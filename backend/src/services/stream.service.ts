/**
 * Stream Chat Service
 *
 * Stream Chat (https://getstream.io) entegrasyonu için merkezi servis.
 *
 * Sorumluluklar:
 *   - Tek server-side StreamChat client (singleton)
 *   - Kullanıcı için JWT token üret (frontend Stream'e bunla bağlanır)
 *   - Toplantı kanalı (messaging tipi) oluştur / üye ekle
 *   - Kullanıcı profilini Stream'e senkronize et (upsertUser)
 *
 * Önemli güvenlik notu:
 *   - STREAM_API_SECRET sadece bu dosyada kullanılır, asla istemciye gitmez.
 *   - Frontend yalnızca STREAM_API_KEY (public) ve userToken kullanır.
 */

import { StreamChat } from 'stream-chat';

const apiKey    = process.env.STREAM_API_KEY    ?? '';
const apiSecret = process.env.STREAM_API_SECRET ?? '';

let client: StreamChat | null = null;

// ── Başlangıç tanılaması — sunucu ayağa kalkarken Stream durumu net görünsün ──
const keyOk    = Boolean(apiKey)    && apiKey.length    > 0;
const secretOk = Boolean(apiSecret) && apiSecret.length > 0;

if (keyOk && secretOk) {
  console.log(`[Stream] ✅ Yapılandırıldı (apiKey son 4: …${apiKey.slice(-4)}, secret uzunluk: ${apiSecret.length})`);
} else {
  console.warn('[Stream] ⚠️  YAPILANDIRILMADI — toplantı sohbeti kullanılamayacak.');
  console.warn('         backend/.env içinde şu iki değişken DOLU olmalı:');
  console.warn(`           STREAM_API_KEY    : ${keyOk    ? 'OK' : 'BOŞ ❌'}`);
  console.warn(`           STREAM_API_SECRET : ${secretOk ? 'OK' : 'BOŞ ❌'}`);
  console.warn('         Değerleri ekledikten sonra backend\'i yeniden başlatın.');
}

/**
 * Singleton Stream client. Server tarafı için kullanılır (apiKey + apiSecret).
 * .env'de değer yoksa null döner — caller fallback davranışını yönetir.
 */
export function getStreamClient(): StreamChat | null {
  if (!apiKey || !apiSecret) return null;
  if (!client) {
    client = StreamChat.getInstance(apiKey, apiSecret);
  }
  return client;
}

export function isStreamConfigured(): boolean {
  return Boolean(apiKey && apiSecret);
}

/**
 * Hangi env değişkeninin eksik olduğunu döner — UI ve /config tanılamasında kullanılır.
 */
export function getStreamConfigStatus(): {
  enabled: boolean;
  hasApiKey: boolean;
  hasApiSecret: boolean;
} {
  return {
    enabled:      keyOk && secretOk,
    hasApiKey:    keyOk,
    hasApiSecret: secretOk,
  };
}

/**
 * Frontend'in Stream'e bağlanmak için kullanacağı JWT token.
 * Token kullanıcı ID'sine sıkı bağlıdır ve `userId`'yi temsil eder.
 */
export function createUserToken(userId: number | string): string {
  const c = getStreamClient();
  if (!c) throw new Error('STREAM_API_KEY/SECRET .env içinde tanımlı değil.');
  return c.createToken(String(userId));
}

interface UpsertUserInput {
  userId:   number | string;
  fullName: string;
  role?:    string;
  image?:   string | null;
}

/**
 * Kullanıcıyı Stream tarafında oluştur/güncelle. Login akışında veya
 * meeting'e ilk girişte çağrılır.
 */
export async function upsertStreamUser({ userId, fullName, role, image }: UpsertUserInput) {
  const c = getStreamClient();
  if (!c) return;

  await c.upsertUser({
    id:    String(userId),
    name:  fullName,
    role:  'user',                              // Stream rol modeli (admin/moderator/user)
    teams: role ? [role.replace(/\s+/g, '_')] : undefined,
    ...(image ? { image } : {}),
  });
}

/**
 * Türkçe karakterleri ASCII'ye indirgeyerek Stream'in kanal ID kuralına
 * uygun bir slug üretir (a-z 0-9 - _, max 64 char).
 */
function slugifyChannelId(s: string): string {
  return s
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/İ/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

interface EnsureMeetingChannelInput {
  meetingId:   string | number;
  meetingName: string;
  createdBy:   number | string;
  memberIds:   (number | string)[];
}

/**
 * 📢 Genel Chat — tüm personelin ortak kanalı.
 * Kanal ID sabittir ("general"). Çağıran kullanıcı üye yapılır.
 */
export async function ensureGeneralChannel(userId: number | string) {
  const c = getStreamClient();
  if (!c) throw new Error('STREAM_API_KEY/SECRET .env içinde tanımlı değil.');

  const channelId = 'general';
  const channel = c.channel('messaging', channelId, {
    name:          '📢 Genel Chat',
    created_by_id: String(userId),
  } as any);

  await channel.create();
  await channel.addMembers([String(userId)]);

  return { id: channelId, name: '📢 Genel Chat' };
}

/**
 * 👥 Grup Chat — yöneticinin oluşturduğu özel grup kanalı.
 * Kanal ID format: group-{epoch}-{shortRandom}  (her seferinde tekil)
 */
export async function createGroupChannel(
  creatorId: number | string,
  name:      string,
  memberIds: (number | string)[],
) {
  const c = getStreamClient();
  if (!c) throw new Error('STREAM_API_KEY/SECRET .env içinde tanımlı değil.');

  const epoch  = Date.now().toString(36);
  const rand   = Math.random().toString(36).slice(2, 8);
  const channelId = `group-${epoch}-${rand}`.slice(0, 64);

  // Üye listesinde yaratıcı dahil olduğundan emin ol (idempotent set)
  const memberSet = new Set<string>([String(creatorId), ...memberIds.map(String)]);

  const channel = c.channel('messaging', channelId, {
    name:          name,
    created_by_id: String(creatorId),
    members:       [...memberSet],
    group:         true,
  } as any);

  await channel.create();
  // create() ile members verildi ama belirli sürümlerde addMembers ile garantiye alınır
  await channel.addMembers([...memberSet]);

  return { id: channelId, name, memberCount: memberSet.size };
}

/**
 * 🏠 Mağaza Chat — kullanıcının mağazasına özel kanal.
 * Kanal ID, mağaza adının slug'ına göre üretilir → reseed sonrası storeId
 * değişse bile aynı kanalı korur.
 */
export async function ensureStoreChannel(
  userId:    number | string,
  storeId:   number,
  storeName: string,
) {
  const c = getStreamClient();
  if (!c) throw new Error('STREAM_API_KEY/SECRET .env içinde tanımlı değil.');

  const slug      = slugifyChannelId(storeName);
  const channelId = `store-${slug}`.slice(0, 64);
  const friendly  = `🏠 ${storeName}`;

  const channel = c.channel('messaging', channelId, {
    name:          friendly,
    created_by_id: String(userId),
    store_id:      storeId,
    store_name:    storeName,
  } as any);

  await channel.create();
  await channel.addMembers([String(userId)]);

  return { id: channelId, name: friendly };
}

/**
 * Toplantı kanalını oluştur (varsa al), kullanıcıyı üye yap.
 * Kanal türü: messaging (tipik 1:1 / grup sohbet özellikleri açık).
 *
 * Kanal ID formatı: meeting-{meetingId}  (Stream ID kuralı: max 64 char, [a-z0-9-_])
 */
export async function ensureMeetingChannel({
  meetingId,
  meetingName,
  createdBy,
  memberIds,
}: EnsureMeetingChannelInput) {
  const c = getStreamClient();
  if (!c) throw new Error('STREAM_API_KEY/SECRET .env içinde tanımlı değil.');

  const channelId = `meeting-${String(meetingId)}`.toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 64);
  const members   = memberIds.map(String);

  const channel = c.channel('messaging', channelId, {
    name:       meetingName,
    created_by_id: String(createdBy),
    members,
  } as any);

  // create() varsa "fetch existing"; yoksa oluşturur
  await channel.create();

  // Çağıran kullanıcı (createdBy) zaten members listesinde — yine de idempotent
  // olması için addMembers çağrısı tekrar eklemez (Stream tarafı tekilleştirir).
  if (members.length > 0) {
    await channel.addMembers(members);
  }

  return { channelId, type: 'messaging' as const };
}
