import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── Sistem Logları (sadece Admin) ───────────────────────────────────────────
// GET /api/logs?type=assignments|feedback&storeId=&search=&page=1&limit=30

router.get('/', async (req: AuthRequest, res) => {
  try {
    if (req.user?.role !== 'Admin') {
      return res.status(403).json({ message: 'Yetkisiz erişim.' });
    }

    const type    = (req.query.type as string) || 'all';
    const storeId = req.query.storeId ? Number(req.query.storeId) : undefined;
    const search  = (req.query.search as string)?.trim() || '';
    const page    = Math.max(1, Number(req.query.page) || 1);
    const limit   = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const skip    = (page - 1) * limit;

    const [assignments, assignmentsTotal, feedbacks, feedbacksTotal] = await Promise.all([

      // ── Eğitim Atamaları ──────────────────────────────────────────────────
      (type === 'all' || type === 'assignments')
        ? prisma.courseAssignment.findMany({
            where: {
              ...(storeId ? { user: { storeId } } : {}),
              ...(search
                ? {
                    OR: [
                      { user:   { fullName: { contains: search, mode: 'insensitive' } } },
                      { course: { title:    { contains: search, mode: 'insensitive' } } },
                    ],
                  }
                : {}),
            },
            include: {
              course: { select: { courseId: true, title: true } },
              user:   { select: { userId: true, fullName: true, store: { select: { storeId: true, storeName: true } } } },
            },
            orderBy: { assignedDate: 'desc' },
            skip:  type === 'assignments' ? skip : 0,
            take:  type === 'assignments' ? limit : 200,
          })
        : Promise.resolve([]),

      (type === 'all' || type === 'assignments')
        ? prisma.courseAssignment.count({
            where: {
              ...(storeId ? { user: { storeId } } : {}),
              ...(search
                ? {
                    OR: [
                      { user:   { fullName: { contains: search, mode: 'insensitive' } } },
                      { course: { title:    { contains: search, mode: 'insensitive' } } },
                    ],
                  }
                : {}),
            },
          })
        : Promise.resolve(0),

      // ── Geri Bildirim Logları ─────────────────────────────────────────────
      // direction='down': müdür → personel (yönetici geri bildirimi)
      (type === 'all' || type === 'feedback')
        ? prisma.feedbackForm.findMany({
            where: {
              direction: 'down',
              evaluatorId: { not: null },
              ...(storeId ? { store: { storeId } } : {}),
              ...(search
                ? {
                    OR: [
                      { evaluator: { fullName: { contains: search, mode: 'insensitive' } } },
                      { targetUser: { fullName: { contains: search, mode: 'insensitive' } } },
                      { subject:   { contains: search, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
            include: {
              evaluator:  { select: { userId: true, fullName: true, store: { select: { storeId: true, storeName: true } } } },
              targetUser: { select: { userId: true, fullName: true } },
              category:   { select: { categoryName: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip:  type === 'feedback' ? skip : 0,
            take:  type === 'feedback' ? limit : 200,
          })
        : Promise.resolve([]),

      (type === 'all' || type === 'feedback')
        ? prisma.feedbackForm.count({
            where: {
              direction: 'down',
              evaluatorId: { not: null },
              ...(storeId ? { store: { storeId } } : {}),
              ...(search
                ? {
                    OR: [
                      { evaluator: { fullName: { contains: search, mode: 'insensitive' } } },
                      { targetUser: { fullName: { contains: search, mode: 'insensitive' } } },
                      { subject:   { contains: search, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
          })
        : Promise.resolve(0),
    ]);

    return res.json({
      assignments,
      assignmentsTotal,
      feedbacks,
      feedbacksTotal,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('[GET /logs]', err.message);
    return res.status(500).json({ message: 'Loglar alınamadı: ' + err.message });
  }
});

export default router;
