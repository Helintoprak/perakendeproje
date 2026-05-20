import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router  = Router();
const prisma  = new PrismaClient();

const MANAGER_ROLES = ['Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'];

export type QuestionType = 'emoji' | 'rating';
export interface SurveyQuestion {
  key:   string;
  label: string;
  type:  QuestionType;
}

router.use(authenticate);

// ─── Admin: Mağaza Listesi ────────────────────────────────────────────────────
router.get('/stores-list', async (req: AuthRequest, res) => {
  if (req.user!.roleName !== 'Admin') {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const stores = await prisma.store.findMany({
    orderBy: { storeName: 'asc' },
    select: { storeId: true, storeName: true },
  });
  return res.json(stores);
});

// ─── Admin: Tüm anket istatistikleri ─────────────────────────────────────────
router.get('/admin/stats', async (req: AuthRequest, res) => {
  try {
    if (req.user!.roleName !== 'Admin') {
      return res.status(403).json({ message: 'Yetkiniz yok.' });
    }
    const selectedStoreId = req.query.storeId ? parseInt(req.query.storeId as string) : null;

    const surveys = await prisma.pulseSurvey.findMany({
      where: selectedStoreId ? { storeId: selectedStoreId } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        creator:   { select: { fullName: true } },
        store:     { select: { storeName: true } },
        responses: {
          include: { user: { select: { fullName: true, store: { select: { storeName: true } } } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result = surveys.map(s => {
      const questions = s.questions as unknown as SurveyQuestion[];
      const avgByQuestion = questions.map(q => {
        const values = s.responses
          .map(r => (r.ratings as Record<string, number>)[q.key])
          .filter((v): v is number => typeof v === 'number');
        const avg = values.length
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
          : null;
        return { key: q.key, label: q.label, avg, count: values.length };
      });

      // Mağaza bazlı kırılım
      const storeBreakdown: Record<string, { storeName: string; count: number; avgRating: number }> = {};
      s.responses.forEach(r => {
        const sName = r.user?.store?.storeName ?? 'Bilinmiyor';
        if (!storeBreakdown[sName]) storeBreakdown[sName] = { storeName: sName, count: 0, avgRating: 0 };
        storeBreakdown[sName].count++;
        const vals = Object.values(r.ratings as Record<string, number>);
        const rAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        storeBreakdown[sName].avgRating += rAvg;
      });
      Object.values(storeBreakdown).forEach(sb => {
        if (sb.count > 0) sb.avgRating = Math.round((sb.avgRating / sb.count) * 10) / 10;
      });

      return {
        surveyId:       s.surveyId,
        title:          s.title,
        description:    s.description,
        isActive:       s.isActive,
        createdBy:      s.creator?.fullName ?? 'Bilinmiyor',
        storeName:      s.store?.storeName ?? 'Tüm Zincir',
        createdAt:      s.createdAt,
        totalResponses: s.responses.length,
        avgByQuestion,
        storeBreakdown: Object.values(storeBreakdown),
      };
    });

    return res.json(result);
  } catch (err: unknown) {
    console.error('❌ GET /pulse/admin/stats error:', err);
    return res.status(500).json({ message: 'İstatistikler yüklenirken hata oluştu.' });
  }
});

// ─── Admin: Anket Oluştur (hedefleme destekli) ───────────────────────────────
router.post('/admin/surveys', async (req: AuthRequest, res) => {
  if (req.user!.roleName !== 'Admin') {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }

  const { title, description, questions, targetType, targetStoreIds } = req.body as {
    title: string;
    description: string;
    questions: SurveyQuestion[];
    targetType: 'chain' | 'store' | 'role';
    targetStoreIds?: number[];
  };

  if (!title?.trim()) return res.status(400).json({ message: 'Başlık zorunludur.' });
  if (!description?.trim()) return res.status(400).json({ message: 'Açıklama zorunludur.' });
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'En az bir soru eklenmelidir.' });
  }

  const createdBy = req.user!.userId;

  if (targetType === 'chain') {
    // Zincir geneli — storeId null
    const survey = await prisma.pulseSurvey.create({
      data: { createdBy, storeId: null, title: title.trim(), description: description.trim(), questions: questions as unknown as never },
    });
    return res.status(201).json(survey);
  }

  if (targetType === 'store' && targetStoreIds?.length) {
    // Seçilen mağazalar için ayrı anket oluştur
    const created = [];
    for (const sid of targetStoreIds) {
      const survey = await prisma.pulseSurvey.create({
        data: { createdBy, storeId: sid, title: title.trim(), description: description.trim(), questions: questions as unknown as never },
      });
      created.push(survey);
    }
    return res.status(201).json(created);
  }

  // Varsayılan: zincir geneli
  const survey = await prisma.pulseSurvey.create({
    data: { createdBy, storeId: null, title: title.trim(), description: description.trim(), questions: questions as unknown as never },
  });
  return res.status(201).json(survey);
});

// ─── Anket Listesi (personel + müdür) ─────────────────────────────────────────
router.get('/surveys', async (req: AuthRequest, res) => {
  try {
    const userId  = req.user!.userId;
    const storeId = req.user!.storeId;
    const isAdmin = req.user!.roleName === 'Admin';

    if (!isAdmin && !storeId) return res.status(400).json({ message: 'Mağaza bilgisi yok.' });

    const surveys = await prisma.pulseSurvey.findMany({
      where: {
        isActive: true,
        ...(isAdmin ? {} : { OR: [{ storeId }, { storeId: null }] }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator:  { select: { fullName: true } },
        store:    { select: { storeName: true } },
        responses: { where: { userId }, select: { responseId: true } },
      },
    });

    const result = surveys.map(s => ({
      surveyId:    s.surveyId,
      title:       s.title,
      description: s.description,
      questions:   s.questions as unknown as SurveyQuestion[],
      createdBy:   s.creator?.fullName ?? 'Bilinmiyor',
      storeName:   s.store?.storeName ?? 'Tüm Zincir',
      createdAt:   s.createdAt,
      completed:   s.responses.length > 0,
    }));

    return res.json(result);
  } catch (err: unknown) {
    console.error('❌ GET /pulse/surveys error:', err);
    return res.status(500).json({ message: 'Anketler yüklenirken hata oluştu.' });
  }
});

// ─── Tekil Anket ─────────────────────────────────────────────────────────────
router.get('/surveys/:id', async (req: AuthRequest, res) => {
  const userId   = req.user!.userId;
  const surveyId = parseInt(req.params.id);

  const survey = await prisma.pulseSurvey.findUnique({
    where:   { surveyId },
    include: {
      responses: { where: { userId }, select: { ratings: true } },
    },
  });
  if (!survey) return res.status(404).json({ message: 'Anket bulunamadı.' });

  const completed = survey.responses.length > 0;
  return res.json({
    surveyId:    survey.surveyId,
    title:       survey.title,
    description: survey.description,
    questions:   survey.questions as unknown as SurveyQuestion[],
    completed,
    ratings:     completed ? (survey.responses[0].ratings as unknown as Record<string, number>) : null,
  });
});

// ─── Anket Oluştur (Müdürler) ─────────────────────────────────────────────────
router.post('/surveys', async (req: AuthRequest, res) => {
  if (!MANAGER_ROLES.includes(req.user!.roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }

  const createdBy = req.user!.userId;
  const storeId   = req.user!.storeId;
  if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi yok.' });

  const { title, description, questions } = req.body as {
    title: string; description: string; questions: SurveyQuestion[];
  };

  if (!title?.trim()) return res.status(400).json({ message: 'Başlık zorunludur.' });
  if (!description?.trim()) return res.status(400).json({ message: 'Açıklama zorunludur.' });
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ message: 'En az bir soru eklenmelidir.' });
  }

  const survey = await prisma.pulseSurvey.create({
    data: { createdBy, storeId, title: title.trim(), description: description.trim(), questions: questions as unknown as never },
  });

  return res.status(201).json(survey);
});

// ─── Anket Güncelle / Deaktive Et ─────────────────────────────────────────────
router.patch('/surveys/:id', async (req: AuthRequest, res) => {
  const isAdmin = req.user!.roleName === 'Admin';
  if (!isAdmin && !MANAGER_ROLES.includes(req.user!.roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }

  const surveyId = parseInt(req.params.id);
  const existing = await prisma.pulseSurvey.findUnique({ where: { surveyId } });
  if (!existing) return res.status(404).json({ message: 'Anket bulunamadı.' });
  if (!isAdmin && existing.storeId !== req.user!.storeId) {
    return res.status(404).json({ message: 'Anket bulunamadı.' });
  }

  const { title, description, questions, isActive } = req.body as Partial<{
    title: string; description: string; questions: SurveyQuestion[]; isActive: boolean;
  }>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (title       !== undefined) patch.title       = title.trim();
  if (description !== undefined) patch.description = description.trim();
  if (questions   !== undefined) patch.questions   = questions;
  if (isActive    !== undefined) patch.isActive    = isActive;

  const updated = await prisma.pulseSurvey.update({ where: { surveyId }, data: patch });
  return res.json(updated);
});

// ─── Anketi Yanıtla ───────────────────────────────────────────────────────────
router.post('/surveys/:id/respond', async (req: AuthRequest, res) => {
  const userId   = req.user!.userId;
  const surveyId = parseInt(req.params.id);

  const survey = await prisma.pulseSurvey.findUnique({ where: { surveyId } });
  if (!survey || !survey.isActive) {
    return res.status(404).json({ message: 'Anket bulunamadı veya aktif değil.' });
  }

  const { ratings } = req.body as { ratings: Record<string, number> };
  if (!ratings || Object.keys(ratings).length === 0) {
    return res.status(400).json({ message: 'Cevaplar eksik.' });
  }

  try {
    const response = await prisma.pulseResponse.create({
      data: { surveyId, userId, ratings },
    });
    return res.status(201).json({ message: 'Cevabınız kaydedildi.', responseId: response.responseId });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      return res.status(409).json({ message: 'Bu anketi zaten cevapladınız.' });
    }
    throw err;
  }
});

// ─── Müdür İstatistikleri ─────────────────────────────────────────────────────
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    if (!MANAGER_ROLES.includes(req.user!.roleName)) {
      return res.status(403).json({ message: 'Yetkiniz yok.' });
    }

    const storeId = req.user!.storeId;
    if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi yok.' });

    const surveys = await prisma.pulseSurvey.findMany({
      where:   { OR: [{ storeId }, { storeId: null }] },
      orderBy: { createdAt: 'desc' },
      include: {
        creator:   { select: { fullName: true } },
        store:     { select: { storeName: true } },
        responses: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const result = surveys.map(s => {
      const questions = s.questions as unknown as SurveyQuestion[];
      const avgByQuestion = questions.map(q => {
        const values = s.responses
          .map(r => (r.ratings as Record<string, number>)[q.key])
          .filter((v): v is number => typeof v === 'number');
        const avg = values.length
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
          : null;
        return { key: q.key, label: q.label, avg, count: values.length };
      });

      return {
        surveyId:       s.surveyId,
        title:          s.title,
        description:    s.description,
        isActive:       s.isActive,
        createdBy:      s.creator?.fullName ?? 'Bilinmiyor',
        storeName:      s.store?.storeName ?? 'Tüm Zincir',
        createdAt:      s.createdAt,
        totalResponses: s.responses.length,
        avgByQuestion,
      };
    });

    return res.json(result);
  } catch (err: unknown) {
    console.error('❌ GET /pulse/stats error:', err);
    return res.status(500).json({ message: 'İstatistikler yüklenirken hata oluştu.' });
  }
});

export default router;
