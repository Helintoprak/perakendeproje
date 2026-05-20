import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MulterError } from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import { fileUrlFromUpload } from '../middleware/upload.middleware';

const prisma = new PrismaClient();

// GET /api/educations/store-users
// Admin: tüm kullanıcılar (mağaza bilgisiyle birlikte)
// Manager/Deputy: kendi mağazasındaki kullanıcılar
export async function listStoreUsers(req: AuthRequest, res: Response) {
  const { roleName, storeId } = req.user!;

  if (roleName === 'Admin') {
    const users = await prisma.user.findMany({
      where: { status: 1 },
      select: {
        userId: true,
        fullName: true,
        role: { select: { roleName: true } },
        store: { select: { storeId: true, storeName: true } },
      },
      orderBy: [{ store: { storeName: 'asc' } }, { role: { roleId: 'asc' } }, { fullName: 'asc' }],
    });
    return res.json(users);
  }

  if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

  const users = await prisma.user.findMany({
    where: { storeId, status: 1 },
    select: {
      userId: true,
      fullName: true,
      role: { select: { roleName: true } },
    },
    orderBy: [{ role: { roleId: 'asc' } }, { fullName: 'asc' }],
  });

  return res.json(users);
}

// POST /api/educations/upload
// Body (multipart): file + userIds (JSON string array) + mandatoryIds (JSON string array)
export async function uploadEducation(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Dosya yüklenmedi. Lütfen bir PDF veya PPTX dosyası seçin.' });
    }

    let userIds: number[] = [];
    try {
      userIds = JSON.parse(req.body.userIds ?? '[]');
      if (!Array.isArray(userIds) || userIds.length === 0) throw new Error();
    } catch {
      return res.status(400).json({ message: 'En az bir kullanıcı seçilmelidir.' });
    }

    let mandatoryIds: number[] = [];
    try {
      mandatoryIds = JSON.parse(req.body.mandatoryIds ?? '[]');
    } catch { /* boş kalabilir */ }
    const mandatorySet = new Set(mandatoryIds);

    const { originalname } = req.file;
    // Cloudinary modunda tam HTTPS URL, disk modunda /uploads/<filename> döner
    const fileUrl = fileUrlFromUpload(req.file);

    const education = await prisma.education.create({
      data: {
        title: originalname,
        fileUrl,
        uploadedBy: req.user!.userId,
        assignments: {
          create: userIds.map((userId) => ({
            userId,
            isMandatory: mandatorySet.has(userId),
          })),
        },
      },
      include: {
        assignments: {
          include: { user: { select: { fullName: true, role: { select: { roleName: true } } } } },
        },
      },
    });

    // accessUrl: Cloudinary URL'i ise zaten tam https://... — olduğu gibi gönder.
    // Disk modunda relative path (/uploads/...) → PUBLIC_BASE_URL veya localhost ekle.
    const accessUrl = fileUrl.startsWith('http')
      ? fileUrl
      : `${process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`}${fileUrl}`;

    return res.status(201).json({
      message: `Dosya başarıyla yüklendi ve ${userIds.length} kullanıcıya atandı.`,
      education,
      accessUrl,
    });
  } catch (err: any) {
    console.error('[uploadEducation]', err.message);
    return res.status(500).json({ message: 'Yükleme başarısız: ' + err.message });
  }
}

// GET /api/educations
// Mevcut kullanıcıya atanmış materyaller
export async function listEducations(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;

  const assignments = await prisma.educationAssignment.findMany({
    where: { userId },
    include: {
      education: {
        include: {
          uploader: { select: { fullName: true } },
        },
      },
    },
    orderBy: [
      { isMandatory: 'desc' },
      { education: { createdAt: 'desc' } },
    ],
  });

  const educations = assignments.map((a) => ({
    id: a.education.id,
    title: a.education.title,
    fileUrl: a.education.fileUrl,
    createdAt: a.education.createdAt,
    uploader: a.education.uploader,
    isMandatory: a.isMandatory,
    assignmentId: a.id,
    viewedAt: a.viewedAt ?? null,
  }));

  return res.json(educations);
}

// GET /api/educations/all
// Admin: tüm sisteme ait materyaller
// Manager/Deputy: kendi yüklediği materyaller
export async function listAllEducations(req: AuthRequest, res: Response) {
  const { roleName, userId } = req.user!;

  const educations = await prisma.education.findMany({
    where: roleName === 'Admin' ? {} : { uploadedBy: userId },
    include: {
      uploader: { select: { fullName: true } },
      assignments: {
        include: {
          user: { select: { userId: true, fullName: true, role: { select: { roleName: true } } } },
        },
        orderBy: [{ isMandatory: 'desc' }, { user: { fullName: 'asc' } }],
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(educations);
}

// GET /api/educations/stores-completion (Admin only)
// Her mağaza için eğitim tamamlama oranı özeti
export async function listStoreCompletionRates(_req: AuthRequest, res: Response) {
  const stores = await prisma.store.findMany({ orderBy: { storeName: 'asc' } });

  const result = await Promise.all(
    stores.map(async (store) => {
      const [staffCount, totalAssignments, viewedCount] = await Promise.all([
        prisma.user.count({ where: { storeId: store.storeId, status: 1 } }),
        prisma.educationAssignment.count({ where: { user: { storeId: store.storeId, status: 1 } } }),
        prisma.educationAssignment.count({
          where: { user: { storeId: store.storeId, status: 1 }, viewedAt: { not: null } },
        }),
      ]);
      return {
        storeId: store.storeId,
        storeName: store.storeName,
        staffCount,
        totalAssignments,
        viewedCount,
        completionRate: totalAssignments > 0 ? Math.round((viewedCount / totalAssignments) * 100) : 0,
      };
    })
  );

  return res.json(result);
}

// PATCH /api/educations/:educationId/view
export async function markAsViewed(req: AuthRequest, res: Response) {
  const educationId = parseInt(req.params.educationId);
  const userId = req.user!.userId;

  if (isNaN(educationId)) return res.status(400).json({ message: 'Geçersiz materyal ID.' });

  const assignment = await prisma.educationAssignment.findUnique({
    where: { educationId_userId: { educationId, userId } },
  });

  if (!assignment) return res.status(404).json({ message: 'Atama bulunamadı.' });

  if (assignment.viewedAt) {
    return res.json({ viewedAt: assignment.viewedAt, alreadyViewed: true });
  }

  const updated = await prisma.educationAssignment.update({
    where: { educationId_userId: { educationId, userId } },
    data: { viewedAt: new Date() },
  });

  return res.json({ viewedAt: updated.viewedAt, alreadyViewed: false });
}

// DELETE /api/educations/:id
export async function deleteEducation(req: AuthRequest, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Geçersiz ID.' });

    const education = await prisma.education.findUnique({ where: { id } });
    if (!education) return res.status(404).json({ message: 'Kayıt bulunamadı.' });

    // Cloudinary URL ise Cloudinary'den sil; yoksa local disk'ten dene
    if (education.fileUrl.startsWith('http')) {
      try {
        const { cloudinary, isCloudinaryConfigured } = await import('../services/cloudinary.service');
        if (isCloudinaryConfigured()) {
          // public_id: URL'den yol segmentini çıkar (sporthink/education/filename)
          const urlPath = new URL(education.fileUrl).pathname; // /dybe7hqqb/raw/upload/v.../sporthink/...
          const match = urlPath.match(/\/(?:raw|image|video)\/upload\/(?:v\d+\/)?(.+)$/);
          if (match) {
            await cloudinary.uploader.destroy(match[1], { resource_type: 'raw' }).catch(() => {});
          }
        }
      } catch { /* Cloudinary hatası DB silmeyi engellemesin */ }
    } else {
      const fs = await import('fs/promises');
      const path = await import('path');
      const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
      const filePath = path.join(uploadsDir, path.basename(education.fileUrl));
      await fs.unlink(filePath).catch(() => {});
    }

    await prisma.education.delete({ where: { id } });
    return res.json({ message: 'Eğitim materyali silindi.' });
  } catch (err: any) {
    console.error('[deleteEducation]', err.message);
    return res.status(500).json({ message: 'Silme işlemi başarısız: ' + err.message });
  }
}

// Multer hata yakalayıcı
export function handleUploadError(err: unknown, _req: Request, res: Response, next: Function) {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Dosya boyutu 50 MB sınırını aşıyor.' });
    }
    return res.status(400).json({ message: `Yükleme hatası: ${err.message}` });
  }
  if (err instanceof Error) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
}
