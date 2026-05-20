import { Router, Response } from 'express';
import { PrismaClient }     from '@prisma/client';
import { authenticate, requireRole, AuthRequest, ADMIN_ROLE } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── GET /api/team/progress ───────────────────────────────────────────────────
router.get(
  '/progress',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdmin = req.user!.roleName === ADMIN_ROLE;
      const storeId = req.user!.storeId;
      if (!isAdmin && !storeId) {
        return res.status(400).json({ message: 'Token içinde mağaza bilgisi yok. Tekrar giriş yapın.' });
      }

      const users = await prisma.user.findMany({
        where:  { ...(isAdmin ? {} : { storeId }), status: 1 },
        select: {
          userId:   true,
          fullName: true,
          role:     { select: { roleName: true } },
          courseAssignments: {
            select: {
              courseId:    true,
              isMandatory: true,
              course:      { select: { title: true } },
            },
          },
          userProgress: {
            select: { courseId: true, completionRate: true, status: true },
          },
        },
        orderBy: { fullName: 'asc' },
      });

      const userIds  = users.map(u => u.userId);
      const attempts = await prisma.quizAttempt.findMany({
        where:   { userId: { in: userIds } },
        include: { quiz: { select: { courseId: true } } },
        orderBy: { attemptDate: 'desc' },
      });

      const lastAttemptMap = new Map<string, typeof attempts[0]>();
      for (const a of attempts) {
        const key = `${a.userId}_${a.quiz.courseId}`;
        if (!lastAttemptMap.has(key)) lastAttemptMap.set(key, a);
      }

      const result = users.map(u => {
        const courses = u.courseAssignments.map(ca => {
          const prog    = u.userProgress.find(p => p.courseId === ca.courseId);
          const attempt = lastAttemptMap.get(`${u.userId}_${ca.courseId}`);
          return {
            courseId:       ca.courseId,
            title:          ca.course.title,
            isMandatory:    ca.isMandatory,
            completionRate: prog ? Number(prog.completionRate) : 0,
            status:         prog?.status ?? 'not_started',
            lastQuizScore:  attempt?.score  ?? null,
            lastQuizTotal:  attempt ? 10    : null,
            lastQuizPassed: attempt?.isPassed ?? null,
          };
        });

        const overallRate = courses.length
          ? Math.round(courses.reduce((s, c) => s + c.completionRate, 0) / courses.length)
          : 0;

        return {
          userId:      u.userId,
          fullName:    u.fullName,
          role:        u.role.roleName,
          overallRate,
          courses,
        };
      });

      return res.json(result);
    } catch (err: any) {
      console.error('[Shift] progress error:', err.message);
      return res.status(500).json({ message: 'İlerleme verileri alınamadı: ' + err.message });
    }
  },
);

// ─── POST /api/team/remind/:userId ───────────────────────────────────────────
router.post(
  '/remind/:userId',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const targetId = parseInt(req.params.userId);
      if (isNaN(targetId)) return res.status(400).json({ message: 'Geçersiz kullanıcı ID.' });

      const isAdmin = req.user!.roleName === ADMIN_ROLE;
      const target = await prisma.user.findFirst({
        where: { userId: targetId, ...(isAdmin ? {} : { storeId: req.user!.storeId }) },
      });
      if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

      // Müdür adıyla kişiselleştirilmiş mesaj — fullName fallback "Müdürün"
      const senderName = req.user!.fullName?.trim() || 'Müdürün';
      await prisma.notification.create({
        data: {
          userId:  targetId,
          type:    'reminder',
          message: `${senderName} sana bir eğitim hatırlatması gönderdi. 📚`,
        },
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Shift] remind error:', err.message);
      return res.status(500).json({ message: 'Bildirim gönderilemedi.' });
    }
  },
);

// ─── GET /api/team/shifts ─────────────────────────────────────────────────────
router.get(
  '/shifts',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdmin     = req.user!.roleName === ADMIN_ROLE;
      const tokenStore  = req.user!.storeId;
      const queryStore  = req.query.storeId ? parseInt(req.query.storeId as string) : null;
      const storeId     = isAdmin ? (queryStore ?? tokenStore) : tokenStore;

      if (!isAdmin && !storeId) {
        return res.status(400).json({ message: 'Token içinde mağaza bilgisi yok. Tekrar giriş yapın.' });
      }

      const weekStart = req.query.weekStart
        ? new Date(req.query.weekStart as string)
        : getMonday(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const [users, shifts] = await Promise.all([
        prisma.user.findMany({
          where:   { ...(storeId ? { storeId } : {}), status: 1 },
          select:  {
            userId:   true,
            fullName: true,
            role:     { select: { roleName: true } },
          },
          orderBy: { fullName: 'asc' },
        }),
        prisma.shift.findMany({
          where: {
            ...(storeId ? { storeId } : {}),
            date: { gte: weekStart, lte: weekEnd },
          },
        }),
      ]);

      return res.json({ users, shifts, weekStart: weekStart.toISOString() });
    } catch (err: any) {
      console.error('[Shift] shifts error:', err.message);
      return res.status(500).json({ message: 'Vardiya verileri alınamadı: ' + err.message });
    }
  },
);

// ─── PUT /api/team/shifts ─────────────────────────────────────────────────────
router.put(
  '/shifts',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdmin = req.user!.roleName === ADMIN_ROLE;
      const { userId, date, shiftType, storeId: bodyStore } = req.body as {
        userId: number; date: string; shiftType: 'ACILIS' | 'KAPANIS' | 'OFF'; storeId?: number;
      };
      const storeId = (isAdmin ? (bodyStore ?? req.user!.storeId) : req.user!.storeId)!;

      if (!userId || !date || !shiftType) {
        return res.status(400).json({ message: 'userId, date ve shiftType zorunludur.' });
      }
      if (!['ACILIS', 'KAPANIS', 'OFF'].includes(shiftType)) {
        return res.status(400).json({ message: 'shiftType ACILIS, KAPANIS veya OFF olmalıdır.' });
      }

      const entry = await prisma.shift.upsert({
        where:  { userId_date: { userId, date: new Date(date) } },
        create: { userId, storeId, date: new Date(date), shiftType },
        update: { shiftType },
      });

      return res.json(entry);
    } catch (err: any) {
      console.error('[Shift] shift upsert error:', err.message);
      return res.status(500).json({ message: 'Vardiya kaydedilemedi: ' + err.message });
    }
  },
);

// ─── GET /api/team/leave-requests ────────────────────────────────────────────
router.get(
  '/leave-requests',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const isAdmin = req.user!.roleName === ADMIN_ROLE;
      const storeId = req.user!.storeId;
      if (!isAdmin && !storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

      const requests = await prisma.leaveRequest.findMany({
        where:   isAdmin ? {} : { storeId: storeId! },
        include: { user: { select: { fullName: true, role: { select: { roleName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take:    50,
      });
      return res.json(requests);
    } catch (err: any) {
      console.error('[Shift] leave-requests error:', err.message);
      return res.status(500).json({ message: 'İzin talepleri alınamadı: ' + err.message });
    }
  },
);

// ─── PUT /api/team/leave-requests/:id ────────────────────────────────────────
router.put(
  '/leave-requests/:id',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id     = parseInt(req.params.id);
      const { action } = req.body as { action: 'approve' | 'reject' };
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ message: "action 'approve' veya 'reject' olmalı." });
      }

      const isAdmin = req.user!.roleName === ADMIN_ROLE;
      const lr = await prisma.leaveRequest.findFirst({
        where: { id, ...(isAdmin ? {} : { storeId: req.user!.storeId! }) },
      });
      if (!lr) return res.status(404).json({ message: 'Talep bulunamadı.' });

      const updated = await prisma.leaveRequest.update({
        where: { id },
        data:  { status: action === 'approve' ? 'approved' : 'rejected' },
      });

      const msg = action === 'approve'
        ? `İzin talebiniz (${fmtDate(lr.startDate)} – ${fmtDate(lr.endDate)}) onaylandı. ✅`
        : `İzin talebiniz (${fmtDate(lr.startDate)} – ${fmtDate(lr.endDate)}) reddedildi. ❌`;

      await prisma.notification.create({
        data: { userId: lr.userId, type: 'leave', message: msg },
      });

      return res.json(updated);
    } catch (err: any) {
      console.error('[Shift] leave update error:', err.message);
      return res.status(500).json({ message: 'Talep güncellenemedi.' });
    }
  },
);

// ─── POST /api/team/leave-requests ───────────────────────────────────────────
router.post('/leave-requests', async (req: AuthRequest, res: Response) => {
  try {
    const userId  = req.user!.userId;
    const storeId = req.user!.storeId;
    if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

    const { startDate, endDate, reason } = req.body as {
      startDate: string; endDate: string; reason: string;
    };
    if (!startDate || !endDate || !reason) {
      return res.status(400).json({ message: 'startDate, endDate ve reason zorunludur.' });
    }

    const lr = await prisma.leaveRequest.create({
      data: { userId, storeId, startDate: new Date(startDate), endDate: new Date(endDate), reason },
    });
    return res.status(201).json(lr);
  } catch (err: any) {
    console.error('[Shift] leave create error:', err.message);
    return res.status(500).json({ message: 'İzin talebi oluşturulamadı.' });
  }
});

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day  = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('tr-TR');
}

export default router;
