import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { upload, fileUrlFromUpload } from '../middleware/upload.middleware';

const router  = Router();
const prisma  = new PrismaClient();
const MANAGER_ROLES = ['Mağaza Müdürü', 'Mağaza Müdür Yardımcısı', 'Admin'];

const ROLE_LEVEL: Record<string, number> = {
  'Admin':                   4,
  'Mağaza Müdürü':           3,
  'Mağaza Müdür Yardımcısı': 2,
  'Satış Danışmanı':         1,
};

// Not: Multer/Cloudinary yapılandırması artık ortak middleware'de
// (upload.middleware.ts). Bu dosyaya özel kurulum yok.

// ─── Dosya Yükleme (Sadece Yöneticiler) ──────────────────────────────────────
router.post('/upload', authenticate, upload.single('file'), (req: AuthRequest, res) => {
  if (!MANAGER_ROLES.includes(req.user!.roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Dosya yüklenemedi.' });
  }
  // Cloudinary modunda tam HTTPS URL, disk modunda /uploads/<filename> döner
  const fileUrl = fileUrlFromUpload(req.file);
  return res.json({ fileUrl, fileName: req.file.originalname });
});

router.use(authenticate);

// ─── Kategoriler ──────────────────────────────────────────────────────────────
router.get('/categories', async (_req, res) => {
  const cats = await prisma.feedbackCategory.findMany({ orderBy: { categoryId: 'asc' } });
  return res.json(cats);
});

// ─── Mağaza personeli listesi (yönetici → alt personel seçimi için) ───────────
router.get('/store-users', async (req: AuthRequest, res) => {
  const { roleName, storeId } = req.user!;
  if (!MANAGER_ROLES.includes(roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const isAdmin = roleName === 'Admin';
  const selectedStoreId = req.query.storeId ? parseInt(req.query.storeId as string) : null;
  const filterStoreId = isAdmin ? selectedStoreId : storeId;
  if (!isAdmin && !storeId) return res.status(400).json({ message: 'Mağaza bilgisi bulunamadı.' });

  const users = await prisma.user.findMany({
    where: {
      ...(filterStoreId ? { storeId: filterStoreId } : {}),
      status: 1,
      userId: { not: req.user!.userId },
      // Admin her role gönderebilir (başka Admin hariç); Müdürler sadece Satış Danışmanına
      role: isAdmin
        ? { roleName: { not: 'Admin' } }
        : { roleName: 'Satış Danışmanı' },
    },
    select: {
      userId: true, fullName: true,
      role: { select: { roleName: true } },
      store: { select: { storeName: true } },
    },
    orderBy: [{ role: { roleId: 'asc' } }, { fullName: 'asc' }],
  });
  return res.json(users);
});

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

// ─── Admin: Tüm geri bildirim trafiği ────────────────────────────────────────
router.get('/admin/traffic', async (req: AuthRequest, res) => {
  if (req.user!.roleName !== 'Admin') {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const selectedStoreId = req.query.storeId ? parseInt(req.query.storeId as string) : null;
  const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : null;

  const feedbacks = await prisma.feedbackForm.findMany({
    where: {
      ...(selectedStoreId ? { storeId: selectedStoreId } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    include: {
      user: { select: { fullName: true, role: { select: { roleName: true } } } },
      targetUser: { select: { fullName: true, role: { select: { roleName: true } } } },
      category: true,
      store: { select: { storeName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return res.json(feedbacks);
});

// ─── Gelen geri bildirimler (bana gönderilmiş, direction='down') ──────────────
router.get('/received', async (req: AuthRequest, res) => {
  const feedbacks = await prisma.feedbackForm.findMany({
    where: { targetUserId: req.user!.userId, direction: 'down' },
    include: {
      user:     { select: { fullName: true, role: { select: { roleName: true } } } },
      category: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(feedbacks);
});

// ─── Benim gönderdiğim (direction='up' olan kendi kayıtlarım) ────────────────
router.get('/my', async (req: AuthRequest, res) => {
  const feedbacks = await prisma.feedbackForm.findMany({
    where: { userId: req.user!.userId, direction: 'up' },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(feedbacks);
});

// ─── Müdür: mağazadan gelen tüm bildirimler (direction='up') ─────────────────
router.get('/all', async (req: AuthRequest, res) => {
  const { roleName, storeId } = req.user!;
  if (!MANAGER_ROLES.includes(roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const feedbacks = await prisma.feedbackForm.findMany({
    where: {
      direction: 'up',
      ...(storeId ? { storeId } : {}),
    },
    include: {
      user:     { select: { fullName: true, role: { select: { roleName: true } } } },
      category: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(feedbacks);
});

// ─── Müdür: alt personele gönderdiği bildirimler ─────────────────────────────
router.get('/sent', async (req: AuthRequest, res) => {
  const { roleName } = req.user!;
  if (!MANAGER_ROLES.includes(roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const feedbacks = await prisma.feedbackForm.findMany({
    where: { userId: req.user!.userId, direction: 'down' },
    include: {
      targetUser: { select: { fullName: true, role: { select: { roleName: true } } } },
      category:   true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(feedbacks);
});

// ─── Geri bildirim gönder (yalnızca aşağı yönlü: üst → alt) ─────────────────
router.post('/', async (req: AuthRequest, res) => {
  const { categoryId, subject, message, rating, targetUserId, fileUrl, fileName } = req.body;
  const { roleName } = req.user!;

  // Satış Danışmanı hiç geri bildirim gönderemez
  const senderLevel = ROLE_LEVEL[roleName] ?? 0;
  if (senderLevel <= 1) {
    return res.status(403).json({ message: 'Satış danışmanları geri bildirim gönderemez.' });
  }

  if (!targetUserId) return res.status(400).json({ message: 'Hedef kullanıcı seçilmelidir.' });
  if (!categoryId)   return res.status(400).json({ message: 'Geri bildirim kategorisi seçilmelidir.' });
  if (!subject || !message) return res.status(400).json({ message: 'Konu ve mesaj alanları zorunludur.' });

  // Hedef kullanıcı bilgilerini getir
  const target = await prisma.user.findUnique({
    where:  { userId: Number(targetUserId) },
    select: { storeId: true, role: { select: { roleName: true } } },
  });
  if (!target) return res.status(404).json({ message: 'Hedef kullanıcı bulunamadı.' });

  const targetLevel = ROLE_LEVEL[target.role.roleName] ?? 0;

  // Hiyerarşi kontrolü: gönderenin seviyesi hedeften kesinlikle yüksek olmalı
  if (senderLevel <= targetLevel) {
    return res.status(403).json({ message: 'Yalnızca daha düşük seviyedeki personele geri bildirim gönderebilirsiniz.' });
  }

  // Müdürler yalnızca kendi mağazasındaki Satış Danışmanlarına gönderebilir
  if (roleName !== 'Admin') {
    if (target.role.roleName !== 'Satış Danışmanı') {
      return res.status(403).json({ message: 'Yalnızca Satış Danışmanlarına geri bildirim gönderebilirsiniz.' });
    }
    if (target.storeId !== req.user!.storeId) {
      return res.status(403).json({ message: 'Yalnızca kendi mağazanızdaki personele geri bildirim gönderebilirsiniz.' });
    }
  }

  const feedbackStoreId = target.storeId ?? req.user!.storeId ?? null;

  const feedback = await prisma.feedbackForm.create({
    data: {
      userId:      req.user!.userId,
      storeId:     feedbackStoreId,
      categoryId:  Number(categoryId),
      subject,
      message,
      rating:      rating ?? null,
      direction:   'down',
      targetUserId: Number(targetUserId),
      evaluatorId: req.user!.userId,
      status:      'delivered',
      fileUrl:     fileUrl ?? null,
      fileName:    fileName ?? null,
    },
    include: { category: true },
  });

  try {
    // Kategoriye özgü bildirim metni — alıcının tonu hızlıca anlamasına yardım eder
    const catName  = feedback.category?.categoryName ?? '';
    const catEmoji = catName === 'Pozitif'    ? '🌟'
                   : catName === 'Yapıcı'     ? '🛠️'
                   : catName === 'Odaklanmış' ? '🎯'
                   : '💬';
    const catLabel = catName ? `${catEmoji} ${catName} bir` : '💬 Yeni bir';

    await prisma.notification.create({
      data: {
        userId:  Number(targetUserId),
        type:    'feedback',
        message: `${catLabel} geri bildirim aldınız: "${subject}"`,
      },
    });
  } catch { /* bildirim gönderilemezse feedback hâlâ kayıt olsun */ }

  return res.status(201).json(feedback);
});

// ─── Durum güncelle (müdür, gelen up-bildirimleri için) ──────────────────────
router.put('/:id/status', async (req: AuthRequest, res) => {
  const { roleName } = req.user!;
  if (!MANAGER_ROLES.includes(roleName)) {
    return res.status(403).json({ message: 'Yetkiniz yok.' });
  }
  const feedback = await prisma.feedbackForm.update({
    where: { feedbackId: parseInt(req.params.id) },
    data:  { status: req.body.status, evaluatorId: req.user!.userId },
  });
  return res.json(feedback);
});

export default router;
