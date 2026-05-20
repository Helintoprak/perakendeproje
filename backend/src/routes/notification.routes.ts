import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// GET /api/notifications — kullanıcının bildirimleri
router.get('/', async (req: AuthRequest, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return res.json(notifications);
});

// GET /api/notifications/unread-count — okunmamış bildirim sayısı
router.get('/unread-count', async (req: AuthRequest, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.userId, isRead: false },
  });
  return res.json({ count });
});

// PUT /api/notifications/read-all — tümünü okundu yap
router.put('/read-all', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.userId, isRead: false },
    data: { isRead: true },
  });
  return res.json({ success: true });
});

// DELETE /api/notifications/all — tüm bildirimleri sil
router.delete('/all', async (req: AuthRequest, res) => {
  await prisma.notification.deleteMany({
    where: { userId: req.user!.userId },
  });
  return res.json({ success: true });
});

// PUT /api/notifications/:id/read — tek bildirimi okundu yap
router.put('/:id/read', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { notifId: parseInt(req.params.id), userId: req.user!.userId },
    data: { isRead: true },
  });
  return res.json({ success: true });
});

// DELETE /api/notifications/:id — tek bildirimi sil
router.delete('/:id', async (req: AuthRequest, res) => {
  const notifId = parseInt(req.params.id);
  if (isNaN(notifId)) return res.status(400).json({ message: 'Geçersiz bildirim ID.' });

  await prisma.notification.deleteMany({
    where: { notifId, userId: req.user!.userId },
  });
  return res.json({ success: true });
});

export default router;
