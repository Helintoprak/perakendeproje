import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();
const MANAGER_ROLES = ['Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'];

router.use(authenticate);

// ─── GET /api/users/me ────────────────────────────────────────────────────────
router.get('/me', async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { userId: req.user!.userId },
    select: {
      userId: true,
      fullName: true,
      email: true,
      status: true,
      roleId: true,
      role: true,
      store: { include: { region: true } },
    },
  });
  return res.json(user);
});

// ─── GET /api/users/store/:storeId ───────────────────────────────────────────
router.get('/store/:storeId', requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { storeId: parseInt(req.params.storeId), status: 1 },
    select: {
      userId: true,
      fullName: true,
      email: true,
      status: true,
      role: true,
    },
  });
  return res.json(users);
});

// ─── GET /api/users/roles ────────────────────────────────────────────────────
router.get('/roles', async (_req: AuthRequest, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { roleId: 'asc' },
      select: { roleId: true, roleName: true },
    });
    return res.json(roles);
  } catch (err: any) {
    console.error('[Users] roles error:', err.message);
    return res.status(500).json({ message: 'Roller alınamadı.' });
  }
});

// ─── GET /api/users/stores ───────────────────────────────────────────────────
// Admin: tüm mağazalar listesi
router.get('/stores', requireRole('Admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      orderBy: { storeName: 'asc' },
      select: { storeId: true, storeName: true },
    });
    return res.json(stores);
  } catch (err: any) {
    console.error('[Users] stores error:', err.message);
    return res.status(500).json({ message: 'Mağazalar alınamadı.' });
  }
});

// ─── GET /api/users ──────────────────────────────────────────────────────────
// Admin: tüm personel listesi (opsiyonel ?storeId filtresi)
//
// Rotasyon mimarisi:
// - Personelin "güncel mağazası" User.storeId değil, EN SON PerformanceActual.storeId'dir.
// - storeId filtresi: o mağazada PerformanceActual kaydı OLAN tüm aktif kullanıcılar
//   getirilir (eski rotasyon kayıtları dahil), ayrıca o mağaza User.storeId'sine yazılı
//   olup hiç performansı olmayanlar da dahil edilir.
// - Performans kaydı hiç olmayan kullanıcılar "Mağazasız" (store=null) olarak listelenir.
router.get('/', requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.query.storeId ? parseInt(req.query.storeId as string) : undefined;

    // 1. Hangi kullanıcılar listelenecek?
    let userIdFilter: number[] | undefined = undefined;

    if (storeId) {
      // O mağazada en az bir kez performans kaydı olan kullanıcı ID'leri (rotasyon dahil)
      const fromPerf = await prisma.performanceActual.findMany({
        where: { storeId },
        select: { userId: true },
        distinct: ['userId'],
      });

      // Statik User.storeId'si bu mağaza olan kullanıcılar (yeni eklenmiş, perf yok)
      const fromUser = await prisma.user.findMany({
        where: { storeId },
        select: { userId: true },
      });

      const idSet = new Set<number>([
        ...fromPerf.map(p => p.userId),
        ...fromUser.map(u => u.userId),
      ]);
      userIdFilter = [...idSet];

      // Bu mağazada kimse yoksa boş dön
      if (userIdFilter.length === 0) {
        return res.json([]);
      }
    }

    // 2. Kullanıcıları çek — Admin rolü hariç TÜM hiyerarşi (Bölge Müdürü, Mağaza
    //    Müdürü, Satış Danışmanı, Eğitim Uzmanı vb.) listede görünür. Admin kendi
    //    hesabını görmez (terfi/pasif gibi yanlış işlem yapmaması için).
    const users = await prisma.user.findMany({
      where: {
        ...(userIdFilter ? { userId: { in: userIdFilter } } : {}),
        role: { roleName: { not: 'Admin' } },
      },
      select: {
        userId:   true,
        fullName: true,
        email:    true,
        status:   true,
        storeId:  true,
        role:     { select: { roleId: true, roleName: true } },
        store:    { select: { storeId: true, storeName: true } },
      },
      orderBy: [
        { status: 'desc' },
        { fullName: 'asc' },
      ],
    });

    if (users.length === 0) {
      return res.json([]);
    }

    // 3. Her kullanıcı için EN SON performans kaydını çek (rotasyon: güncel mağaza)
    const userIds = users.map(u => u.userId);
    const latestActuals = await prisma.performanceActual.findMany({
      where: { userId: { in: userIds }, storeId: { not: null } },
      orderBy: { recordDate: 'desc' },
      select: {
        userId:    true,
        storeId:   true,
        recordDate: true,
        store:     { select: { storeId: true, storeName: true } },
      },
    });

    // userId → en son performance kaydındaki store
    const latestStoreByUser = new Map<number, { storeId: number; storeName: string }>();
    for (const a of latestActuals) {
      if (!latestStoreByUser.has(a.userId) && a.store) {
        latestStoreByUser.set(a.userId, a.store);
      }
    }

    // 4. Yanıtta store alanı = en son perf kaydı mağazası ?? statik User.storeId mağazası
    //    Hiçbiri yoksa null (UI: "Mağazasız")
    const enriched = users.map(u => ({
      userId:   u.userId,
      fullName: u.fullName,
      email:    u.email,
      status:   u.status,
      role:     u.role,
      store:    latestStoreByUser.get(u.userId) ?? u.store ?? null,
    }));

    // 5. Sıralama: önce aktif, sonra mağaza adı (mağazasız sona), sonra isim
    enriched.sort((a, b) => {
      if (a.status !== b.status) return b.status - a.status;
      const an = a.store?.storeName ?? '￿'; // null'lar sona
      const bn = b.store?.storeName ?? '￿';
      if (an !== bn) return an.localeCompare(bn, 'tr');
      return a.fullName.localeCompare(b.fullName, 'tr');
    });

    console.log(`[Users] Liste döndü: ${enriched.length} kayıt (storeId filtresi: ${storeId ?? 'hepsi'})`);

    return res.json(enriched);
  } catch (err: any) {
    console.error('[Users] list error:', err.message);
    return res.status(500).json({ message: 'Personel listesi alınamadı.' });
  }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
// Admin: yeni personel oluştur
router.post('/', requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, email, roleId, storeId, password: customPwd } = req.body as {
      fullName: string;
      email: string;
      roleId: number;
      storeId?: number;
      password?: string;
    };

    if (!fullName?.trim() || !email?.trim() || !roleId) {
      return res.status(400).json({ message: 'fullName, email ve roleId zorunludur.' });
    }

    const existing = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ message: 'Bu e-posta adresi zaten kullanımda.' });
    }

    const role = await prisma.role.findUnique({ where: { roleId } });
    if (!role) return res.status(400).json({ message: 'Geçersiz rol.' });

    const tempPassword = customPwd?.trim() || generatePassword();
    const hashed = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        email:    email.toLowerCase().trim(),
        password: hashed,
        roleId,
        storeId:  storeId || null,
        status:   1,
      },
      select: {
        userId:   true,
        fullName: true,
        email:    true,
        role:     { select: { roleName: true } },
        store:    { select: { storeName: true } },
      },
    });

    return res.status(201).json({
      ...user,
      tempPassword,
    });
  } catch (err: any) {
    console.error('[Users] create error:', err.message);
    return res.status(500).json({ message: 'Kullanıcı oluşturulamadı.' });
  }
});

// ─── PATCH /api/users/:userId/status ─────────────────────────────────────────
// Admin: aktif (1) ↔ pasif (0) geçişi — veriler silinmez
router.patch('/:userId/status', requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const { status } = req.body as { status: 0 | 1 };

    if (isNaN(userId)) return res.status(400).json({ message: 'Geçersiz userId.' });
    if (status !== 0 && status !== 1) return res.status(400).json({ message: 'status 0 veya 1 olmalıdır.' });

    if (userId === req.user!.userId && status === 0) {
      return res.status(400).json({ message: 'Kendi hesabınızı pasife alamazsınız.' });
    }

    const user = await prisma.user.findUnique({ where: { userId } });
    if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

    const updated = await prisma.user.update({
      where: { userId },
      data:  { status },
    });

    return res.json({ userId: updated.userId, status: updated.status });
  } catch (err: any) {
    console.error('[Users] status error:', err.message);
    return res.status(500).json({ message: 'Durum güncellenemedi.' });
  }
});

// ─── PUT /api/users/:userId/role ─────────────────────────────────────────────
// Terfi / Rol Değiştirme — sadece Admin
router.put('/:userId/role', requireRole('Admin'), async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const { newRoleId, note } = req.body as { newRoleId: number; note?: string };

    if (isNaN(targetUserId) || !newRoleId) {
      return res.status(400).json({ message: 'userId ve newRoleId zorunludur.' });
    }

    const target = await prisma.user.findUnique({
      where: { userId: targetUserId },
      include: { role: true },
    });
    if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    if (target.roleId === newRoleId) return res.status(400).json({ message: 'Kullanıcı zaten bu role sahip.' });

    const newRole = await prisma.role.findUnique({ where: { roleId: newRoleId } });
    if (!newRole) return res.status(400).json({ message: 'Geçersiz rol.' });

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { userId: targetUserId },
        data:  { roleId: newRoleId },
        include: { role: true },
      }),
      prisma.promotionLog.create({
        data: {
          userId:     targetUserId,
          oldRoleId:  target.roleId,
          newRoleId,
          promotedBy: req.user!.userId,
          note:       note || null,
        },
      }),
      prisma.notification.create({
        data: {
          userId:  targetUserId,
          type:    'promotion',
          message: `Tebrikler! Rolünüz "${target.role.roleName}" → "${newRole.roleName}" olarak güncellendi. 🎉`,
        },
      }),
    ]);

    return res.json({
      success: true,
      user: {
        userId:   updatedUser.userId,
        fullName: updatedUser.fullName,
        oldRole:  target.role.roleName,
        newRole:  updatedUser.role.roleName,
      },
    });
  } catch (err: any) {
    console.error('[Users] role update error:', err.message);
    return res.status(500).json({ message: 'Rol güncellenemedi.' });
  }
});

// ─── GET /api/users/:userId/promotions ───────────────────────────────────────
router.get('/:userId/promotions', async (req: AuthRequest, res: Response) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (isNaN(targetUserId)) return res.status(400).json({ message: 'Geçersiz userId.' });

    const isAdmin = req.user!.roleName === 'Admin';
    if (!isAdmin && !MANAGER_ROLES.includes(req.user!.roleName)) {
      if (targetUserId !== req.user!.userId) {
        return res.status(403).json({ message: 'Bu bilgiye erişim yetkiniz yok.' });
      }
    }

    const logs = await prisma.promotionLog.findMany({
      where: { userId: targetUserId },
      include: {
        oldRole:  { select: { roleName: true } },
        newRole:  { select: { roleName: true } },
        promoter: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(logs);
  } catch (err: any) {
    console.error('[Users] promotions error:', err.message);
    return res.status(500).json({ message: 'Kariyer geçmişi alınamadı.' });
  }
});

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$';
  const pool = upper + lower + digits + special;
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  const rest = Array.from({ length: 6 }, () => rand(pool)).join('');
  return rand(upper) + rand(lower) + rand(digits) + rand(special) + rest;
}

export default router;
