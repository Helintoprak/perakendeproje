import { Router, Response } from 'express';
import { PrismaClient }     from '@prisma/client';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── GET /api/team/progress ───────────────────────────────────────────────────
// Mağazadaki tüm personelin eğitim ilerlemesi + son quiz skoru
router.get(
  '/progress',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const storeId = req.user!.storeId;
      if (!storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

      const users = await prisma.user.findMany({
        where:  { storeId, status: 1, userId: { not: req.user!.userId } },
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

      // Son quiz denemelerini tek sorguda çek
      const userIds = users.map(u => u.userId);
      const attempts = await prisma.quizAttempt.findMany({
        where:   { userId: { in: userIds } },
        include: { quiz: { select: { courseId: true } } },
        orderBy: { attemptDate: 'desc' },
      });

      // userId + courseId başına en son deneme
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
      console.error('[Team] progress error:', err.message);
      return res.status(500).json({ message: 'İlerleme verileri alınamadı.' });
    }
  },
);

// ─── POST /api/team/remind/:userId ───────────────────────────────────────────
// Personele "eğitimini tamamla" bildirimi gönder
router.post(
  '/remind/:userId',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const targetId = parseInt(req.params.userId);
      if (isNaN(targetId)) return res.status(400).json({ message: 'Geçersiz kullanıcı ID.' });

      // Hedef kullanıcı aynı mağazada mı?
      const target = await prisma.user.findFirst({
        where: { userId: targetId, storeId: req.user!.storeId },
      });
      if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

      await prisma.notification.create({
        data: {
          userId:  targetId,
          type:    'reminder',
          message: `Eğitimini tamamlamayı unutma! Müdürün sana hatırlatmak istedi. 📚`,
        },
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Team] remind error:', err.message);
      return res.status(500).json({ message: 'Bildirim gönderilemedi.' });
    }
  },
);

// ─── GET /api/team/shifts ─────────────────────────────────────────────────────
// Haftanın vardiya kayıtları  ?weekStart=YYYY-MM-DD
router.get(
  '/shifts',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const storeId = req.user!.storeId!;
      const weekStart = req.query.weekStart
        ? new Date(req.query.weekStart as string)
        : getMonday(new Date());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const [users, shifts] = await Promise.all([
        prisma.user.findMany({
          where:   { storeId, status: 1, userId: { not: req.user!.userId } },
          select:  { userId: true, fullName: true, role: { select: { roleName: true } } },
          orderBy: { fullName: 'asc' },
        }),
        prisma.shiftEntry.findMany({
          where: {
            storeId,
            date: { gte: weekStart, lte: weekEnd },
          },
        }),
      ]);

      return res.json({ users, shifts, weekStart: weekStart.toISOString() });
    } catch (err: any) {
      console.error('[Team] shifts error:', err.message);
      return res.status(500).json({ message: 'Vardiya verileri alınamadı.' });
    }
  },
);

// ─── PUT /api/team/shifts ─────────────────────────────────────────────────────
// Vardiya oluştur / güncelle
router.put(
  '/shifts',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const storeId = req.user!.storeId!;
      const { userId, date, shiftType } = req.body as {
        userId: number; date: string; shiftType: 'morning' | 'evening' | 'off';
      };

      if (!userId || !date || !shiftType) {
        return res.status(400).json({ message: 'userId, date ve shiftType zorunludur.' });
      }

      const entry = await prisma.shiftEntry.upsert({
        where:  { userId_date: { userId, date: new Date(date) } },
        create: { userId, storeId, date: new Date(date), shiftType },
        update: { shiftType },
      });

      return res.json(entry);
    } catch (err: any) {
      console.error('[Team] shift upsert error:', err.message);
      return res.status(500).json({ message: 'Vardiya kaydedilemedi.' });
    }
  },
);

// ─── GET /api/team/leave-requests ────────────────────────────────────────────
// Mağazanın bekleyen izin talepleri
router.get(
  '/leave-requests',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const storeId = req.user!.storeId!;
      const requests = await prisma.leaveRequest.findMany({
        where:   { storeId },
        include: { user: { select: { fullName: true, role: { select: { roleName: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return res.json(requests);
    } catch (err: any) {
      console.error('[Team] leave-requests error:', err.message);
      return res.status(500).json({ message: 'İzin talepleri alınamadı.' });
    }
  },
);

// ─── PUT /api/team/leave-requests/:id ────────────────────────────────────────
// İzin talebini onayla veya reddet  { action: 'approve' | 'reject' }
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

      const lr = await prisma.leaveRequest.findFirst({
        where: { id, storeId: req.user!.storeId! },
      });
      if (!lr) return res.status(404).json({ message: 'Talep bulunamadı.' });

      const updated = await prisma.leaveRequest.update({
        where: { id },
        data:  { status: action === 'approve' ? 'approved' : 'rejected' },
      });

      // Kullanıcıya bildirim gönder
      const msg = action === 'approve'
        ? `İzin talebiniz (${fmtDate(lr.startDate)} – ${fmtDate(lr.endDate)}) onaylandı. ✅`
        : `İzin talebiniz (${fmtDate(lr.startDate)} – ${fmtDate(lr.endDate)}) reddedildi. ❌`;

      await prisma.notification.create({
        data: { userId: lr.userId, type: 'leave', message: msg },
      });

      return res.json(updated);
    } catch (err: any) {
      console.error('[Team] leave update error:', err.message);
      return res.status(500).json({ message: 'Talep güncellenemedi.' });
    }
  },
);

// ─── POST /api/team/leave-requests ───────────────────────────────────────────
// Personel izin talebi oluşturur
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
      data: {
        userId,
        storeId,
        startDate: new Date(startDate),
        endDate:   new Date(endDate),
        reason,
      },
    });
    return res.status(201).json(lr);
  } catch (err: any) {
    console.error('[Team] leave create error:', err.message);
    return res.status(500).json({ message: 'İzin talebi oluşturulamadı.' });
  }
});

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day  = date.getDay(); // 0=Pazar
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('tr-TR');
}

export default router;
