import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.middleware';
import { upload, fileUrlFromUpload } from '../middleware/upload.middleware';
import { handleUploadError } from '../controllers/education.controller';

const router = Router();
const prisma = new PrismaClient();

const MANAGER_ROLES = ['Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'];
const CAN_MANAGE    = [...MANAGER_ROLES, 'Admin'];

router.use(authenticate);

// ─── Yardımcı: Hedef kullanıcıları belirle ───────────────────────────────────
// storeId === null → Admin, kısıtlama yok
async function resolveTargetUsers(storeId: number | null, rawUserIds: unknown): Promise<number[]> {
  const inputIds = Array.isArray(rawUserIds) && (rawUserIds as unknown[]).length > 0
    ? (rawUserIds as number[]).map(Number).filter(n => !isNaN(n) && n > 0)
    : [];

  if (storeId === null) {
    // Admin: mağaza kısıtlaması yok
    if (inputIds.length === 0) {
      const all = await prisma.user.findMany({ where: { status: 1 }, select: { userId: true } });
      return all.map(u => u.userId);
    }
    const valid = await prisma.user.findMany({
      where: { userId: { in: inputIds }, status: 1 },
      select: { userId: true },
    });
    return valid.map(u => u.userId);
  }

  // Manager / Deputy: kendi mağazasıyla kısıtlı
  if (inputIds.length === 0) {
    const all = await prisma.user.findMany({ where: { storeId, status: 1 }, select: { userId: true } });
    return all.map(u => u.userId);
  }
  const valid = await prisma.user.findMany({
    where: { userId: { in: inputIds }, storeId, status: 1 },
    select: { userId: true },
  });
  return valid.map(u => u.userId);
}

// Bölüm verilerini parse et ve doğrula
function parseParts(
  raw: unknown,
  totalParts: number,
): { partNumber: number; title: string; startPage: number | null; endPage: number | null }[] {
  const arr = Array.isArray(raw) ? raw : [];
  const parts = (arr as any[])
    .filter((p: any) => p && typeof p.partNumber === 'number')
    .map((p: any) => ({
      partNumber: Number(p.partNumber),
      title:      (typeof p.title === 'string' && p.title.trim()) ? p.title.trim() : `Bölüm ${p.partNumber}`,
      startPage:  p.startPage ? parseInt(p.startPage) : null,
      endPage:    p.endPage   ? parseInt(p.endPage)   : null,
    }));

  if (parts.length === 0 && totalParts > 0) {
    return Array.from({ length: totalParts }, (_, i) => ({
      partNumber: i + 1,
      title:      `Bölüm ${i + 1}`,
      startPage:  null,
      endPage:    null,
    }));
  }
  return parts;
}

// ─── GET /api/courses/categories ─────────────────────────────────────────────
router.get('/categories', async (_req, res) => {
  const categories = await prisma.courseCategory.findMany({ orderBy: { categoryName: 'asc' } });
  return res.json(categories);
});

// ─── GET /api/courses/store-users ────────────────────────────────────────────
// Admin: tüm kullanıcılar (mağaza bilgisiyle)
// Manager/Deputy: kendi mağazası
router.get('/store-users', requireRole(...CAN_MANAGE), async (req: AuthRequest, res) => {
  const { roleName, storeId, userId } = req.user!;

  if (roleName === 'Admin') {
    const users = await prisma.user.findMany({
      where: { status: 1 },
      select: {
        userId: true,
        fullName: true,
        role:  { select: { roleName: true } },
        store: { select: { storeId: true, storeName: true } },
      },
      orderBy: [{ store: { storeName: 'asc' } }, { role: { roleId: 'asc' } }, { fullName: 'asc' }],
    });
    return res.json(users);
  }

  if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });
  const users = await prisma.user.findMany({
    where: { storeId, status: 1, userId: { not: userId } },
    select: { userId: true, fullName: true, role: { select: { roleName: true } } },
    orderBy: [{ role: { roleId: 'asc' } }, { fullName: 'asc' }],
  });
  return res.json(users);
});

// ─── POST /api/courses/assign ─────────────────────────────────────────────────
router.post('/assign', requireRole(...CAN_MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const isAdminUser = req.user!.roleName === 'Admin';
    const storeId = isAdminUser ? null : (req.user!.storeId ?? null);
    if (!isAdminUser && !storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

    const { title, description, contentUrl, duration, categoryId, deadline, userIds, mandatoryUserIds } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: 'Kurs başlığı zorunludur.' });

    let rawParts: unknown[] = [];
    try { rawParts = JSON.parse(req.body.parts ?? '[]'); } catch { /* ok */ }
    const totalParts = rawParts.length > 0 ? rawParts.length : Math.max(1, parseInt(req.body.totalParts ?? '1') || 1);
    const partsData  = parseParts(rawParts, totalParts);

    const targetUserIds = await resolveTargetUsers(storeId, userIds);
    if (targetUserIds.length === 0) {
      return res.status(400).json({ message: 'Atama yapılacak geçerli kullanıcı bulunamadı.' });
    }

    const mandatorySet = new Set<number>(Array.isArray(mandatoryUserIds) ? mandatoryUserIds.map(Number) : []);

    const course = await prisma.$transaction(async (tx) => {
      const c = await tx.course.create({
        data: {
          title:       title.trim(),
          description: description?.trim() || null,
          contentUrl:  contentUrl?.trim()  || null,
          duration:    duration   ? parseInt(duration)   : null,
          categoryId:  categoryId ? parseInt(categoryId) : null,
          totalParts,
        },
        include: { category: true },
      });
      await tx.coursePart.createMany({
        data: partsData.map(p => ({
          courseId:   c.courseId,
          partNumber: p.partNumber,
          title:      p.title,
          startPage:  p.startPage,
          endPage:    p.endPage,
        })),
        skipDuplicates: true,
      });
      await tx.courseAssignment.createMany({
        data: targetUserIds.map(uid => ({
          userId:       uid,
          courseId:     c.courseId,
          isMandatory:  mandatorySet.has(uid),
          assignedDate: new Date(),
          deadline:     deadline ? new Date(deadline) : null,
        })),
        skipDuplicates: true,
      });
      return c;
    });

    return res.status(201).json({
      message: `"${course.title}" kursu ${targetUserIds.length} çalışana atandı.`,
      course,
      assignedCount: targetUserIds.length,
    });
  } catch (err) {
    console.error('[POST /courses/assign]', err);
    return res.status(500).json({ message: 'Kurs eklenirken bir hata oluştu.' });
  }
});

// ─── POST /api/courses/upload ─────────────────────────────────────────────────
router.post(
  '/upload',
  requireRole(...CAN_MANAGE),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err) => {
      if (err) return handleUploadError(err, req, res, next);
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdminUser = req.user!.roleName === 'Admin';
      const storeId = isAdminUser ? null : (req.user!.storeId ?? null);
      if (!isAdminUser && !storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

      const contentFile = req.file;

      if (!contentFile) {
        return res.status(400).json({ message: 'Dosya yüklenmedi. Lütfen bir PDF/PPTX/Video seçin.' });
      }

      const { title, description, duration, categoryId, deadline } = req.body;
      const effectiveTitle = title?.trim() || contentFile.originalname;

      let rawUserIds: number[]      = [];
      let rawMandatoryIds: number[] = [];
      let rawParts: unknown[]       = [];
      try { rawUserIds      = JSON.parse(req.body.userIds          ?? '[]'); } catch { /* ok */ }
      try { rawMandatoryIds = JSON.parse(req.body.mandatoryUserIds ?? '[]'); } catch { /* ok */ }
      try { rawParts        = JSON.parse(req.body.parts            ?? '[]'); } catch { /* ok */ }

      const totalParts = rawParts.length > 0 ? rawParts.length : Math.max(1, parseInt(req.body.totalParts ?? '1') || 1);
      const partsData  = parseParts(rawParts, totalParts);

      const targetUserIds = await resolveTargetUsers(storeId, rawUserIds);
      if (targetUserIds.length === 0) {
        return res.status(400).json({ message: 'Atama yapılacak geçerli kullanıcı bulunamadı.' });
      }

      const mandatorySet = new Set(rawMandatoryIds.map(Number));
      const fileUrl = fileUrlFromUpload(contentFile);

      const course = await prisma.$transaction(async (tx) => {
        const c = await tx.course.create({
          data: {
            title:       effectiveTitle,
            description: description?.trim() || null,
            contentUrl:  fileUrl,
            coverImage:  null,
            duration:    duration   ? parseInt(duration)   : null,
            categoryId:  categoryId ? parseInt(categoryId) : null,
            totalParts,
          },
          include: { category: true },
        });
        await tx.coursePart.createMany({
          data: partsData.map(p => ({
            courseId:   c.courseId,
            partNumber: p.partNumber,
            title:      p.title,
            startPage:  p.startPage,
            endPage:    p.endPage,
          })),
          skipDuplicates: true,
        });
        await tx.courseAssignment.createMany({
          data: targetUserIds.map(uid => ({
            userId:       uid,
            courseId:     c.courseId,
            isMandatory:  mandatorySet.has(uid),
            assignedDate: new Date(),
            deadline:     deadline ? new Date(deadline) : null,
          })),
          skipDuplicates: true,
        });
        return c;
      });

      return res.status(201).json({
        message: `"${course.title}" kursu ${targetUserIds.length} çalışana atandı.`,
        course,
        assignedCount: targetUserIds.length,
      });
    } catch (err) {
      console.error('[POST /courses/upload]', err);
      return res.status(500).json({ message: 'Kurs eklenirken bir hata oluştu.' });
    }
  }
);

// ─── GET /api/courses/all (Admin + Manager) ───────────────────────────────────
router.get('/all', requireRole(...CAN_MANAGE), async (_req, res) => {
  const courses = await prisma.course.findMany({
    include: {
      category: true,
      _count: { select: { courseAssignments: true } },
    },
    orderBy: { courseId: 'desc' },
  });
  return res.json(courses);
});

// ─── GET /api/courses ─────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const assignments = await prisma.courseAssignment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            category: { select: { categoryId: true, categoryName: true } },
            parts:    { orderBy: { partNumber: 'asc' } },
          },
        },
      },
      orderBy: { assignedDate: 'desc' },
    });

    if (assignments.length === 0) return res.json([]);

    const courseIds = assignments.map(a => a.courseId);

    const [progressList, partProgressList] = await Promise.all([
      prisma.userProgress.findMany({
        where: { userId, courseId: { in: courseIds } },
        select: { courseId: true, completionRate: true, status: true },
      }),
      prisma.userPartProgress.findMany({
        where: { userId, courseId: { in: courseIds } },
        select: { courseId: true, partNumber: true },
      }),
    ]);

    const progressMap = new Map(progressList.map(p => [p.courseId, p]));

    const partProgressMap = new Map<number, number[]>();
    for (const pp of partProgressList) {
      if (!partProgressMap.has(pp.courseId)) partProgressMap.set(pp.courseId, []);
      partProgressMap.get(pp.courseId)!.push(pp.partNumber);
    }

    const result = assignments.map(a => {
      const p              = progressMap.get(a.courseId);
      const completedParts = partProgressMap.get(a.courseId) ?? [];
      return {
        assignmentId:   a.assignmentId,
        courseId:       a.courseId,
        isMandatory:    a.isMandatory ?? false,
        deadline:       a.deadline    ?? null,
        assignedDate:   a.assignedDate,
        course: {
          courseId:   a.course.courseId,
          title:      a.course.title,
          duration:   a.course.duration   ?? null,
          contentUrl: a.course.contentUrl ?? null,
          totalParts: a.course.totalParts,
          parts:      a.course.parts,
          category:   a.course.category   ?? null,
        },
        completedParts,
        progress: p
          ? { completionRate: Number(p.completionRate), status: p.status ?? 'not_started' }
          : null,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('[GET /courses]', err);
    return res.status(500).json({ message: 'Kurslar yüklenirken bir hata oluştu.' });
  }
});

// ─── GET /api/courses/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req: AuthRequest, res) => {
  const courseId = parseInt(req.params.id);
  const userId   = req.user!.userId;

  const course = await prisma.course.findUnique({
    where: { courseId },
    include: { category: true, parts: { orderBy: { partNumber: 'asc' } } },
  });
  if (!course) return res.status(404).json({ message: 'Kurs bulunamadı' });

  const [progress, partProgress] = await Promise.all([
    prisma.userProgress.findUnique({ where: { userId_courseId: { userId, courseId } } }),
    prisma.userPartProgress.findMany({ where: { userId, courseId }, select: { partNumber: true } }),
  ]);

  return res.json({ ...course, progress, completedParts: partProgress.map(p => p.partNumber) });
});

// ─── POST /api/courses/:id/start ──────────────────────────────────────────────
router.post('/:id/start', async (req: AuthRequest, res) => {
  const courseId = parseInt(req.params.id);
  const userId   = req.user!.userId;

  const progress = await prisma.userProgress.upsert({
    where:  { userId_courseId: { userId, courseId } },
    update: { status: 'in_progress' },
    create: { userId, courseId, status: 'in_progress', startedDate: new Date(), completionRate: 0 },
  });

  return res.json(progress);
});

// ─── PUT /api/courses/:id/progress ───────────────────────────────────────────
router.put('/:id/progress', async (req: AuthRequest, res) => {
  const courseId = parseInt(req.params.id);
  const userId   = req.user!.userId;
  const { completionRate } = req.body;

  if (isNaN(courseId) || completionRate === undefined) {
    return res.status(400).json({ message: 'Geçersiz istek.' });
  }

  const rate   = Math.min(Math.max(Number(completionRate), 0), 100);
  const status = rate >= 100 ? 'completed' : 'in_progress';

  const progress = await prisma.userProgress.upsert({
    where:  { userId_courseId: { userId, courseId } },
    update: { completionRate: rate, status },
    create: { userId, courseId, completionRate: rate, status, startedDate: new Date() },
  });

  return res.json(progress);
});

// ─── POST /api/courses/:id/parts/:partNum/complete ────────────────────────────
router.post('/:id/parts/:partNum/complete', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = parseInt(req.params.id);
    const partNum  = parseInt(req.params.partNum);
    const userId   = req.user!.userId;

    if (isNaN(courseId) || isNaN(partNum) || partNum < 1) {
      return res.status(400).json({ message: 'Geçersiz bölüm numarası.' });
    }

    const course = await prisma.course.findUnique({
      where: { courseId },
      select: { totalParts: true },
    });
    if (!course) return res.status(404).json({ message: 'Kurs bulunamadı.' });
    if (partNum > course.totalParts) {
      return res.status(400).json({ message: 'Bölüm numarası toplam bölüm sayısını aşıyor.' });
    }

    await prisma.userPartProgress.upsert({
      where:  { userId_courseId_partNumber: { userId, courseId, partNumber: partNum } },
      create: { userId, courseId, partNumber: partNum },
      update: {},
    });

    const completedCount = await prisma.userPartProgress.count({ where: { userId, courseId } });
    const rate   = Math.min(100, Math.round((completedCount / course.totalParts) * 100));
    const status = rate >= 100 ? 'completed' : 'in_progress';

    const progress = await prisma.userProgress.upsert({
      where:  { userId_courseId: { userId, courseId } },
      update: { completionRate: rate, status },
      create: { userId, courseId, completionRate: rate, status, startedDate: new Date() },
    });

    return res.json({ progress, completedParts: completedCount, completionRate: rate });
  } catch (err) {
    console.error('[POST /courses/:id/parts/:partNum/complete]', err);
    return res.status(500).json({ message: 'Bölüm tamamlanamadı.' });
  }
});

// ─── DELETE /api/courses/:id ─────────────────────────────────────────────────
router.delete('/:id', requireRole('Mağaza Müdürü', 'Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const courseId = parseInt(req.params.id);
    if (isNaN(courseId)) return res.status(400).json({ message: 'Geçersiz kurs ID.' });

    const course = await prisma.course.findUnique({ where: { courseId } });
    if (!course) return res.status(404).json({ message: 'Kurs bulunamadı.' });

    // Cloudinary'de yüklü dosyayı sil
    if (course.contentUrl?.startsWith('http')) {
      try {
        const { cloudinary, isCloudinaryConfigured } = await import('../services/cloudinary.service');
        if (isCloudinaryConfigured()) {
          const urlPath = new URL(course.contentUrl).pathname;
          const isVideo = urlPath.includes('/video/upload/');
          const match   = urlPath.match(/\/(?:raw|image|video)\/upload\/(?:v\d+\/)?(.+)$/);
          if (match) {
            await cloudinary.uploader.destroy(match[1], {
              resource_type: isVideo ? 'video' : 'raw',
            }).catch(() => {});
          }
        }
      } catch { /* Cloudinary hatası DB silmeyi engellemesin */ }
    }

    // İlişkili tüm kayıtları transaction içinde sil, ardından kursu sil
    await prisma.$transaction([
      prisma.userPartProgress.deleteMany({ where: { courseId } }),
      prisma.userProgress.deleteMany({ where: { courseId } }),
      prisma.quizAttempt.deleteMany({ where: { quiz: { courseId } } }),
      prisma.quiz.deleteMany({ where: { courseId } }),
      prisma.courseAssignment.deleteMany({ where: { courseId } }),
      prisma.coursePart.deleteMany({ where: { courseId } }),
      prisma.course.delete({ where: { courseId } }),
    ]);
    return res.json({ message: 'Kurs başarıyla silindi.' });
  } catch (err: any) {
    console.error('[DELETE /courses/:id]', err.message);
    return res.status(500).json({ message: 'Silme işlemi başarısız: ' + err.message });
  }
});

// ─── DELETE /api/courses/:id/parts/:partNum/complete ─────────────────────────
router.delete('/:id/parts/:partNum/complete', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = parseInt(req.params.id);
    const partNum  = parseInt(req.params.partNum);
    const userId   = req.user!.userId;

    try {
      await prisma.userPartProgress.delete({
        where: { userId_courseId_partNumber: { userId, courseId, partNumber: partNum } },
      });
    } catch { /* kayıt zaten yoktu */ }

    const course = await prisma.course.findUnique({
      where: { courseId },
      select: { totalParts: true },
    });
    const completedCount = await prisma.userPartProgress.count({ where: { userId, courseId } });
    const rate   = course ? Math.min(100, Math.round((completedCount / course.totalParts) * 100)) : 0;
    const status = completedCount === 0 ? 'in_progress' : rate >= 100 ? 'completed' : 'in_progress';

    await prisma.userProgress.upsert({
      where:  { userId_courseId: { userId, courseId } },
      update: { completionRate: rate, status },
      create: { userId, courseId, completionRate: rate, status, startedDate: new Date() },
    });

    return res.json({ completedParts: completedCount, completionRate: rate });
  } catch (err) {
    console.error('[DELETE /courses/:id/parts/:partNum/complete]', err);
    return res.status(500).json({ message: 'İşlem başarısız.' });
  }
});

export default router;
