import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import {
  createUserToken,
  upsertStreamUser,
  ensureMeetingChannel,
  ensureGeneralChannel,
  ensureStoreChannel,
  createGroupChannel,
  isStreamConfigured,
  getStreamConfigStatus,
} from '../services/stream.service';

const GROUP_CREATOR_ROLES = ['Admin', 'Mağaza Müdürü', 'Bölge Müdürü'];

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Health check — frontend Stream'in yapılandırılıp yapılandırılmadığını
// öğrenmek için kullanır (UI graceful fallback gösterir).
//
// Yanıt aynı zamanda hangi env değişkeninin eksik olduğunu da belirtir,
// böylece UI/log "neden devre dışı" sorusunu cevaplayabilir.
router.get('/config', (_req, res) => {
  const status = getStreamConfigStatus();
  return res.json({
    enabled:      status.enabled,
    apiKey:       status.enabled ? process.env.STREAM_API_KEY : null,
    diagnostics: {
      hasApiKey:    status.hasApiKey,
      hasApiSecret: status.hasApiSecret,
      hint: status.enabled
        ? null
        : 'backend/.env içinde STREAM_API_KEY ve STREAM_API_SECRET dolu olmalı, ardından backend yeniden başlatılmalı.',
    },
  });
});

// ─── GET /api/chat/token ─────────────────────────────────────────────────────
// Giriş yapmış kullanıcıya Stream Chat user token'ı döner.
// Frontend bu token + apiKey ile Stream'e bağlanır.
router.get('/token', async (req: AuthRequest, res) => {
  if (!isStreamConfigured()) {
    return res.status(503).json({
      message: 'Stream Chat yapılandırılmadı. .env içinde STREAM_API_KEY/STREAM_API_SECRET tanımlayın.',
    });
  }

  try {
    const { userId, fullName, roleName } = req.user!;
    console.log(`[Chat] Token isteği — userId=${userId}, name="${fullName}", role=${roleName}`);

    // Kullanıcıyı Stream'e senkronize et (idempotent — her token isteğinde profili tazeler)
    await upsertStreamUser({ userId, fullName, role: roleName });

    const token = createUserToken(userId);
    console.log(`[Chat] ✅ Token üretildi userId=${userId} (uzunluk: ${token.length})`);

    return res.json({
      token,
      user: {
        id:    String(userId),
        name:  fullName,
        role:  roleName,
      },
    });
  } catch (err: any) {
    console.error('[Chat] ❌ token error:', err.message, err.stack);
    return res.status(500).json({ message: 'Stream token üretilemedi: ' + err.message });
  }
});

// ─── POST /api/chat/bootstrap ────────────────────────────────────────────────
// Kullanıcı sohbet sayfasına ilk girdiğinde çağrılır:
//   1. Stream profili senkronlanır
//   2. Genel Chat kanalına üye yapılır
//   3. Mağazası varsa kendi mağaza kanalına üye yapılır (yoksa atlanır)
//
// Yanıt: kullanıcının erişebileceği kanal kimliklerinin listesi (UI
// ChannelList'i bu id'lerle filtreler — başka kullanıcının mağaza
// kanalını görmemesini garanti eder).
router.post('/bootstrap', async (req: AuthRequest, res) => {
  if (!isStreamConfigured()) {
    return res.status(503).json({ message: 'Stream Chat yapılandırılmadı.' });
  }

  try {
    const { userId, fullName, roleName, storeId } = req.user!;
    console.log(`[Chat] Bootstrap — userId=${userId}, storeId=${storeId ?? '(yok)'}`);

    // 0. Stream'de kullanıcı profilini güncelle
    await upsertStreamUser({ userId, fullName, role: roleName });

    const channels: { id: string; name: string }[] = [];

    // 1. Genel Chat — herkes
    const general = await ensureGeneralChannel(userId);
    channels.push(general);

    // 2. Mağaza Chat — kullanıcının mağazası varsa
    if (storeId) {
      const store = await prisma.store.findUnique({
        where:  { storeId },
        select: { storeId: true, storeName: true },
      });
      if (store) {
        const storeCh = await ensureStoreChannel(userId, store.storeId, store.storeName);
        channels.push(storeCh);
      }
    }

    console.log(`[Chat] ✅ Bootstrap tamamlandı: ${channels.map(c => c.id).join(', ')}`);

    return res.json({ channels });
  } catch (err: any) {
    console.error('[Chat] ❌ bootstrap error:', err.message, err.stack);
    return res.status(500).json({ message: 'Kanallar oluşturulamadı: ' + err.message });
  }
});

// ─── POST /api/chat/groups ───────────────────────────────────────────────────
// Yönetici (Admin / Mağaza Müdürü / Bölge Müdürü) yeni grup sohbeti oluşturur.
//
// Body:
//   • name:      string   — grup adı (zorunlu, max 80 char)
//   • memberIds: number[] — gruba davet edilecek kullanıcı ID'leri (zorunlu, ≥1)
//
// Yetki kuralları (sunucu tarafında zorlanır — UI bypass edilemez):
//   • Admin       → herkesi davet edebilir (Admin rolündeki başka kullanıcılar hariç)
//   • Mağaza Müd. → SADECE kendi mağazasındaki personeli davet edebilir
//   • Bölge Müd.  → kendi sorumlu olduğu mağazaların personeli (basitlik için
//                   şimdilik kendi storeId'siyle eşleşenler)
router.post('/groups', async (req: AuthRequest, res) => {
  if (!isStreamConfigured()) {
    return res.status(503).json({ message: 'Stream Chat yapılandırılmadı.' });
  }

  try {
    const { roleName, userId, storeId } = req.user!;
    if (!GROUP_CREATOR_ROLES.includes(roleName)) {
      return res.status(403).json({ message: 'Grup sohbeti oluşturma yetkiniz yok.' });
    }

    const { name, memberIds } = req.body as { name?: string; memberIds?: number[] };

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Grup adı zorunludur.' });
    }
    if (name.trim().length > 80) {
      return res.status(400).json({ message: 'Grup adı 80 karakteri geçmemeli.' });
    }
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: 'En az bir üye seçmelisiniz.' });
    }

    // Üye ID'lerini sadeleştir (kendisi otomatik eklenir, dublicate'leri at)
    const requestedIds = [...new Set(memberIds.map(Number).filter(n => Number.isFinite(n)))];

    // Veritabanından gerçekten var olan + aktif kullanıcıları çek
    const candidateUsers = await prisma.user.findMany({
      where: {
        userId: { in: requestedIds },
        status: 1,
      },
      select: {
        userId:  true,
        fullName: true,
        storeId: true,
        role:    { select: { roleName: true } },
      },
    });

    // Yetki filtresi: Müdür sadece kendi mağazasının personelini ekleyebilir, Admin hariç
    const isAdmin = roleName === 'Admin';
    const allowedUsers = candidateUsers.filter(u => {
      if (u.role.roleName === 'Admin') return false; // Admin gruba davet edilemez
      if (isAdmin) return true;
      // Müdür/Bölge Müdürü → sadece kendi storeId'si
      return storeId !== null && u.storeId === storeId;
    });

    if (allowedUsers.length === 0) {
      return res.status(400).json({
        message: 'Davet edilebilir geçerli üye bulunamadı (yetki/mağaza kısıtı).',
      });
    }

    // Tüm üyeleri (yaratıcı dahil) Stream'de upsert et
    const allMembers = [
      { userId, fullName: req.user!.fullName, role: roleName },
      ...allowedUsers.map(u => ({ userId: u.userId, fullName: u.fullName, role: u.role.roleName })),
    ];
    await Promise.all(
      allMembers.map(m => upsertStreamUser({ userId: m.userId, fullName: m.fullName, role: m.role }))
    );

    const group = await createGroupChannel(
      userId,
      name.trim(),
      allowedUsers.map(u => u.userId),
    );

    console.log(
      `[Chat] ✅ Grup oluşturuldu: ${group.id} (${group.memberCount} üye, yaratıcı=${userId})`
    );

    return res.status(201).json({
      channelId:   group.id,
      channelType: 'messaging',
      name:        group.name,
      memberCount: group.memberCount,
      members:     allowedUsers.map(u => ({ id: String(u.userId), name: u.fullName })),
    });
  } catch (err: any) {
    console.error('[Chat] ❌ create group error:', err.message, err.stack);
    return res.status(500).json({ message: 'Grup oluşturulamadı: ' + err.message });
  }
});

// ─── POST /api/chat/meetings/:meetingId/join ─────────────────────────────────
// Kullanıcıyı bir toplantı kanalına ekler. Kanal yoksa oluşturulur.
//
// Body (opsiyonel):
//   - meetingName:    string   — kanal adı (varsayılan: "Toplantı #ID")
//   - participantIds: number[] — kanala eklenecek diğer kullanıcı ID'leri
//
// Mantık:
//   • Mağaza Müdürü/Bölge Müdürü/Admin: meetingName özelleştirebilir,
//     participantIds göndererek tüm ekibi davet edebilir.
//   • Diğer roller: yalnızca kendilerini ekler (mevcut kanala katılır).
router.post('/meetings/:meetingId/join', async (req: AuthRequest, res) => {
  if (!isStreamConfigured()) {
    return res.status(503).json({ message: 'Stream Chat yapılandırılmadı.' });
  }

  try {
    const meetingId = req.params.meetingId;
    const callerId  = req.user!.userId;
    const { meetingName, participantIds } = req.body as {
      meetingName?:    string;
      participantIds?: number[];
    };

    const isManagerRole = ['Admin', 'Bölge Müdürü', 'Mağaza Müdürü', 'Mağaza Müdür Yardımcısı']
      .includes(req.user!.roleName);

    // Üye listesi: caller + (yetkiliyse) participantIds
    const memberSet = new Set<number>([callerId]);
    if (isManagerRole && Array.isArray(participantIds)) {
      participantIds.forEach(id => memberSet.add(Number(id)));
    }

    // Tüm üyelerin Stream'de profili olduğundan emin ol
    const memberUsers = await prisma.user.findMany({
      where:  { userId: { in: [...memberSet] } },
      select: { userId: true, fullName: true, role: { select: { roleName: true } } },
    });
    await Promise.all(
      memberUsers.map(u =>
        upsertStreamUser({ userId: u.userId, fullName: u.fullName, role: u.role.roleName })
      )
    );

    const channel = await ensureMeetingChannel({
      meetingId,
      meetingName: meetingName?.trim() || `Toplantı #${meetingId}`,
      createdBy:   callerId,
      memberIds:   memberUsers.map(u => u.userId),
    });

    return res.json({
      channelId:   channel.channelId,
      channelType: channel.type,
      members:     memberUsers.map(u => ({ id: String(u.userId), name: u.fullName })),
    });
  } catch (err: any) {
    console.error('[Chat] join meeting error:', err.message);
    return res.status(500).json({ message: 'Toplantı kanalına katılım başarısız: ' + err.message });
  }
});

export default router;
