/* eslint-disable no-console */
/**
 * Sporthink — Tam Veritabanı Hard Reset + CSV Veri Yüklemesi
 *
 * Bu script:
 * 1. Tüm User, Store, Performance tablolarını temizler
 * 2. Admin kullanıcısını (perakende1@sporthink.local) oluşturur
 * 3. CSV dosyasındaki mağaza ve personel verilerini yükler
 * 4. Sadece Ocak-Şubat 2026 KPI verilerini işler
 *
 * Çalıştırma:
 *   cd backend && npx ts-node prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import xlsx from 'xlsx';

const prisma = new PrismaClient();

// ─── Sabitler ────────────────────────────────────────────────────────────────

const EXCEL_PATH = '../PERAKENDE KPI GÜNCEL.xlsx';

const KPI = {
  CIRO:    1,
  FATURA:  2,
  MDO:     3,
  UPT:     4,
} as const;

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const TR_MONTHS: Record<string, number> = {
  OCAK: 1, ŞUBAT: 2, MART: 3, NİSAN: 4, MAYIS: 5, HAZİRAN: 6,
  TEMMUZ: 7, AĞUSTOS: 8, EYLÜL: 9, EKİM: 10, KASIM: 11, ARALIK: 12,
};

// ─── Parse Yardımcıları ──────────────────────────────────────────────────────

function parseMoney(s: unknown): number {
  if (s === null || s === undefined || s === '') return 0;
  const v = Number(String(s).replace(/[₺$\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function parseNum(s: unknown): number {
  if (s === null || s === undefined || s === '') return 0;
  const cleaned = String(s).replace(/[%\s]/g, '').replace(/,/g, '');
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

function parseMonthLabel(s: string): { month: number; year: number } | null {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const month = MONTH_MAP[m[1]];
  if (!month) return null;
  return { month, year: 2000 + Number(m[2]) };
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '');
}

// ─── Veritabanı İşlemleri ────────────────────────────────────────────────────

async function hardReset() {
  console.log('🗑️  Veritabanı temizleniyor...');

  // Foreign key constraint'leri devre dışı bırak (PostgreSQL)
  await prisma.$executeRawUnsafe("SET session_replication_role = 'replica'");

  // Tüm tabloları sil (doğru tablo isimleri: lowercase ve suffix)
  try {
    const r1 = await prisma.$executeRawUnsafe('DELETE FROM performanceactuals');
    console.log(`   • performanceactuals: ${r1} satır silindi`);
  } catch (e) {
    console.error('   ✗ performanceactuals silme hatası:', (e as any).message);
  }
  try {
    const r2 = await prisma.$executeRawUnsafe('DELETE FROM performancegoals');
    console.log(`   • performancegoals: ${r2} satır silindi`);
  } catch (e) {
    console.error('   ✗ performancegoals silme hatası:', (e as any).message);
  }
  try {
    const r3 = await prisma.$executeRawUnsafe('DELETE FROM notifications');
    console.log(`   • notifications: ${r3} satır silindi`);
  } catch (e) {
    console.error('   ✗ notifications silme hatası:', (e as any).message);
  }
  // Comment'lar communityposts'tan önce silinmeli (FK Comment.PostID → CommunityPost)
  try {
    const r3a = await prisma.$executeRawUnsafe('DELETE FROM comments');
    console.log(`   • comments: ${r3a} satır silindi`);
  } catch (e) {
    console.error('   ✗ comments silme hatası:', (e as any).message);
  }
  try {
    const r3b = await prisma.$executeRawUnsafe('DELETE FROM communityposts');
    console.log(`   • communityposts: ${r3b} satır silindi`);
  } catch (e) {
    console.error('   ✗ communityposts silme hatası:', (e as any).message);
  }
  try {
    const r4 = await prisma.$executeRawUnsafe('DELETE FROM promotion_logs');
    console.log(`   • promotion_logs: ${r4} satır silindi`);
  } catch (e) {
    console.error('   ✗ promotion_logs silme hatası:', (e as any).message);
  }
  try {
    const r5 = await prisma.$executeRawUnsafe('DELETE FROM users');
    console.log(`   • users: ${r5} satır silindi`);
  } catch (e) {
    console.error('   ✗ users silme hatası:', (e as any).message);
  }
  try {
    const r6 = await prisma.$executeRawUnsafe('DELETE FROM stores');
    console.log(`   • stores: ${r6} satır silindi`);
  } catch (e) {
    console.error('   ✗ stores silme hatası:', (e as any).message);
  }
  try {
    const r7 = await prisma.$executeRawUnsafe('DELETE FROM regions');
    console.log(`   • regions: ${r7} satır silindi`);
  } catch (e) {
    console.error('   ✗ regions silme hatası:', (e as any).message);
  }

  // Foreign key constraint'leri geri aç (PostgreSQL)
  await prisma.$executeRawUnsafe("SET session_replication_role = 'origin'");

  console.log('✅ Tüm tablolar temizlendi');
}

async function ensureRoles() {
  const roles = [
    { roleId: 1, roleName: 'Admin' },
    { roleId: 2, roleName: 'Bölge Müdürü' },
    { roleId: 3, roleName: 'Mağaza Müdürü' },
    { roleId: 4, roleName: 'Satış Danışmanı' },
    { roleId: 5, roleName: 'Eğitim Uzmanı' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { roleId: role.roleId },
      update: { roleName: role.roleName },
      create: role,
    });
  }

  console.log('✅ Roller hazır (Admin, Bölge Müdürü, Mağaza Müdürü, Satış Danışmanı, Eğitim Uzmanı)');
}

async function ensureKpis() {
  const kpis = [
    { kpiId: KPI.CIRO,   kpiName: 'Aylık Satış Hedefi (Ciro)', unit: 'TL' },
    { kpiId: KPI.FATURA, kpiName: 'Fatura Sayısı',             unit: 'Adet' },
    { kpiId: KPI.MDO,    kpiName: 'MDO',                       unit: '%' },
    { kpiId: KPI.UPT,    kpiName: 'UPT',                       unit: 'Adet' },
  ];

  for (const kpi of kpis) {
    await prisma.kpiDefinition.upsert({
      where: { kpiId: kpi.kpiId },
      update: { kpiName: kpi.kpiName, unit: kpi.unit },
      create: kpi,
    });
  }

  console.log('✅ KPI tanımları hazır (Ciro, Fatura, MDO, UPT)');
}

/**
 * Geri Bildirim Kategorileri — Müdür → Personel feedback akışında kullanılır.
 * Sabit ID'ler; UI rengini ID'ye göre eşleştirir (ad değişse bile renkler bozulmaz).
 *   1 → Pozitif    (Yüksek Performans) — Yeşil
 *   2 → Yapıcı     (Gelişime Açık)     — Sarı/Turuncu
 *   3 → Odaklanmış (Düşük Performans)  — Mavi
 */
const FEEDBACK_CATEGORY = {
  POZITIF:    1,
  YAPICI:     2,
  ODAKLANMIS: 3,
} as const;

async function ensureFeedbackCategories() {
  const cats = [
    { categoryId: FEEDBACK_CATEGORY.POZITIF,    categoryName: 'Pozitif',    description: 'Yüksek Performans — başarıların takdir edildiği geri bildirim.' },
    { categoryId: FEEDBACK_CATEGORY.YAPICI,     categoryName: 'Yapıcı',     description: 'Gelişime Açık — iyileştirme önerileri içeren rehberlik.' },
    { categoryId: FEEDBACK_CATEGORY.ODAKLANMIS, categoryName: 'Odaklanmış', description: 'Düşük Performans — yakın takip gerektiren konular.' },
  ];

  for (const c of cats) {
    await prisma.feedbackCategory.upsert({
      where:  { categoryId: c.categoryId },
      update: { categoryName: c.categoryName, description: c.description },
      create: c,
    });
  }

  console.log('✅ Geri bildirim kategorileri hazır (Pozitif, Yapıcı, Odaklanmış)');
}

async function createAdminUser() {
  const email = 'perakende1@sporthink.local'.toLowerCase();
  const plainPassword = 'Admin123!';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  console.log('  → Plain password:', plainPassword);
  console.log('  → Hash uzunluğu:', hashedPassword.length, 'Başlangıç: $' + hashedPassword.substring(0, 10));

  const admin = await prisma.user.create({
    data: {
      fullName: 'Perakende Admin',
      email,
      password: hashedPassword,
      roleId: 1,
      storeId: null,
      status: 1,
    },
  });

  // Kontrol: Kaydedilen password doğru mu?
  const check = await prisma.user.findUnique({ where: { userId: admin.userId } });
  if (check?.password) {
    const isValid = await bcrypt.compare(plainPassword, check.password);
    console.log('  ✓ Kaydedilen user - password doğru mu?', isValid ? '✅ EVET' : '❌ HAYIR');
    console.log('  ✓ Hash uzunluğu:', check.password.length, 'Başlangıç: $' + check.password.substring(0, 10));
  }

  console.log(`✅ Admin kullanıcı oluşturuldu: ${email}`);
  return admin.userId;
}

async function ensureRegion(regionName: string): Promise<number> {
  const found = await prisma.region.findFirst({ where: { regionName } });
  if (found) return found.regionId;

  const created = await prisma.region.create({ data: { regionName } });
  return created.regionId;
}

async function ensureStore(storeName: string, regionId: number): Promise<number> {
  const found = await prisma.store.findFirst({ where: { storeName } });
  if (found) return found.storeId;

  const created = await prisma.store.create({ data: { storeName, regionId } });
  return created.storeId;
}

async function ensureStoreManager(storeId: number, storeName: string): Promise<number> {
  const existing = await prisma.user.findFirst({ where: { storeId, roleId: 3 } });
  if (existing) return existing.userId;

  // Email'de storeId KULLANMA — mağaza isimleri zaten unique, slug yeterli.
  // Böylece reseed sonrası e-postalar sabit kalır (ör. mudur.akhisar.sporthink.magaza@sporthink.local).
  const slug = slugify(storeName);
  const email = `mudur.${slug}@sporthink.local`.toLowerCase();
  const password = await bcrypt.hash('Manager123!', 10);

  const manager = await prisma.user.create({
    data: {
      fullName: `${storeName} — Mağaza Müdürü`,
      email,
      password,
      roleId: 3,
      storeId,
      status: 1,
    },
  });

  return manager.userId;
}

/**
 * Personel kaydını bulur veya oluşturur.
 *
 * Önemli: Personel rotasyonu (mağaza değişikliği) desteklenir.
 * - Aynı isimli personel daha önce yaratıldıysa (hangi mağazada olursa olsun) tekrar yaratılmaz.
 * - storeId, kullanıcının "en son bulunduğu mağaza" olarak güncellenir (statik referans değil).
 * - Tarihsel mağaza bilgisi PerformanceActual.storeId / PerformanceGoal.storeId üzerinden tutulur.
 */
async function ensureStaff(fullName: string, storeId: number): Promise<number> {
  // İsim bazlı global arama — mağaza değişse bile aynı kullanıcı kullanılır
  const existing = await prisma.user.findFirst({
    where: { fullName, roleId: 4 },
  });

  if (existing) {
    // Kullanıcının "şu anki" mağazasını günceller (en son görünen mağaza)
    if (existing.storeId !== storeId) {
      await prisma.user.update({
        where: { userId: existing.userId },
        data: { storeId },
      });
    }
    return existing.userId;
  }

  const slug = slugify(fullName);
  let email = `${slug}@sporthink.local`.toLowerCase();
  let i = 1;

  while (await prisma.user.findFirst({ where: { email: email.toLowerCase() } })) {
    email = `${slug}${i}@sporthink.local`.toLowerCase();
    i++;
  }

  const password = await bcrypt.hash('Staff123!', 10);

  const staff = await prisma.user.create({
    data: {
      fullName,
      email: email.toLowerCase(),
      password,
      roleId: 4,
      storeId,
      status: 1,
    },
  });

  return staff.userId;
}

async function upsertGoal(
  userId: number,
  kpiId: number,
  targetValue: number,
  month: number,
  year: number,
  storeId: number | null
) {
  if (!Number.isFinite(targetValue) || targetValue <= 0) return;

  const existing = await prisma.performanceGoal.findFirst({
    where: { userId, kpiId, month, year },
  });

  if (existing) {
    await prisma.performanceGoal.update({
      where: { goalId: existing.goalId },
      data: { targetValue, storeId },
    });
  } else {
    await prisma.performanceGoal.create({
      data: { userId, kpiId, targetValue, month, year, storeId },
    });
  }
}

async function upsertActual(
  userId: number,
  kpiId: number,
  actualValue: number,
  recordDate: Date,
  storeId: number | null
) {
  if (!Number.isFinite(actualValue)) return;

  const existing = await prisma.performanceActual.findFirst({
    where: { userId, kpiId, recordDate },
  });

  if (existing) {
    await prisma.performanceActual.update({
      where: { actualId: existing.actualId },
      data: { actualValue, storeId },
    });
  } else {
    await prisma.performanceActual.create({
      data: { userId, kpiId, actualValue, recordDate, storeId },
    });
  }
}

// ─── Excel Bölüm Tespiti ─────────────────────────────────────────────────────

type Row = any[];

interface StoreSection {
  month: number;
  year: number;
  startRow: number;
  endRow: number;
}

interface PersonnelSection {
  startRow: number;
  endRow: number;
}

function detectSections(rows: Row[], year = 2026): { stores: StoreSection[]; personnel: PersonnelSection[] } {
  const stores: StoreSection[] = [];
  const personnel: PersonnelSection[] = [];

  let currentStore: StoreSection | null = null;
  let currentPers: PersonnelSection | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c0 = r?.[0];
    if (typeof c0 === 'string') {
      const upper = c0.toUpperCase().trim();

      if (TR_MONTHS[upper]) {
        if (currentStore) {
          currentStore.endRow = i - 1;
          stores.push(currentStore);
          currentStore = null;
        }
        if (currentPers) {
          currentPers.endRow = i - 1;
          personnel.push(currentPers);
          currentPers = null;
        }
        currentStore = { month: TR_MONTHS[upper], year, startRow: i + 2, endRow: i + 2 };
        continue;
      }

      if (upper === 'PERSONEL HEDEF GERÇEKLEŞTİRME') {
        if (currentStore) {
          currentStore.endRow = i - 1;
          stores.push(currentStore);
          currentStore = null;
        }
        if (currentPers) {
          currentPers.endRow = i - 1;
          personnel.push(currentPers);
          currentPers = null;
        }
        currentPers = { startRow: i + 2, endRow: i + 2 };
        continue;
      }
    }
  }

  if (currentStore) {
    currentStore.endRow = rows.length - 1;
    stores.push(currentStore);
  }
  if (currentPers) {
    currentPers.endRow = rows.length - 1;
    personnel.push(currentPers);
  }

  return { stores, personnel };
}

// ─── Ana Akış ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Sporthink Veritabanı Hard Reset + CSV Yüklemesi başlıyor...\n');

  // 1. Excel dosyasını oku
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Row>(sheet, { header: 1, defval: null, raw: false });
  console.log(`📑 ${rows.length} satır okundu: ${EXCEL_PATH}\n`);

  // 2. Tam veritabanı temizliği
  await hardReset();

  // 3. Roller ve KPI tanımları
  await ensureRoles();
  await ensureKpis();
  await ensureFeedbackCategories();

  // 4. Admin kullanıcısı
  await createAdminUser();

  // 5. Bölümleri tespit et
  const { stores: storeSections, personnel: personnelSections } = detectSections(rows);
  console.log(
    `🔎 Tespit: ${storeSections.length} mağaza-bloğu, ${personnelSections.length} personel-bloğu\n`
  );

  // ── A) Mağaza özet blokları (OCAK / ŞUBAT) ───────────────────────────────
  console.log('📊 Mağaza özet blokları işleniyor...');
  let storeCount = 0;

  for (const sect of storeSections) {
    if (sect.month !== 1 && sect.month !== 2) continue;

    const recordDate = new Date(sect.year, sect.month - 1, 28);

    for (let r = sect.startRow; r <= sect.endRow; r++) {
      const row = rows[r];
      if (!row || !row[0]) continue;

      const storeNameRaw = String(row[0]).trim();
      if (!storeNameRaw || /^(MAĞAZA|TOPLAM|GENEL|Perakende)/i.test(storeNameRaw)) continue;

      const regionName = String(row[1] ?? 'Genel').trim() || 'Genel';
      const fatura = Math.round(parseNum(row[9]));
      const mdoDecimal = parseNum(row[14]);
      const mdo = mdoDecimal > 1 ? mdoDecimal : mdoDecimal * 100;

      const regionId = await ensureRegion(regionName);
      const storeId = await ensureStore(storeNameRaw, regionId);
      const managerId = await ensureStoreManager(storeId, storeNameRaw);

      if (fatura > 0) await upsertActual(managerId, KPI.FATURA, fatura, recordDate, storeId);
      if (mdo > 0) await upsertActual(managerId, KPI.MDO, mdo, recordDate, storeId);

      storeCount++;
    }
  }
  console.log(`   ✅ ${storeCount} mağaza-aylık kaydı işlendi\n`);

  // ── B) Personel blokları (Jan-26 / Feb-26) ───────────────────────────────
  console.log('👥 Personel blokları işleniyor...');
  let staffCount = 0;

  for (const sect of personnelSections) {
    for (let r = sect.startRow; r <= sect.endRow; r++) {
      const row = rows[r];
      if (!row) continue;

      const monthLabel = row[0];
      if (typeof monthLabel !== 'string') continue;

      const parsed = parseMonthLabel(monthLabel);
      if (!parsed || (parsed.month !== 1 && parsed.month !== 2)) continue;

      const storeNameRaw = String(row[1] ?? '').trim();
      const fullName = String(row[2] ?? '').trim();
      const target = parseMoney(row[3]);
      const actual = parseMoney(row[4]);
      const upt = parseNum(row[5]);

      if (!storeNameRaw || !fullName || /^(MAĞAZA|TOPLAM|GENEL)/i.test(fullName)) continue;

      let store = await prisma.store.findFirst({ where: { storeName: storeNameRaw } });
      if (!store) {
        const regionId = await ensureRegion('Genel');
        store = await prisma.store.create({
          data: { storeName: storeNameRaw, regionId },
        });
      }

      const userId = await ensureStaff(fullName, store.storeId);
      const recordDate = new Date(parsed.year, parsed.month - 1, 28);

      // Debug: İlk 5 personeli göster
      if (staffCount < 5) {
        console.log(`   → ${fullName} | Hedef: ${target} | Gerçekleşen: ${actual} | UPT: ${upt}`);
      }

      // Önemli: storeId her satırın kendi mağazasından gelir (rotasyon desteği)
      await upsertGoal(userId, KPI.CIRO, target, parsed.month, parsed.year, store.storeId);
      await upsertActual(userId, KPI.CIRO, actual, recordDate, store.storeId);
      await upsertActual(userId, KPI.UPT, upt, recordDate, store.storeId);

      staffCount++;
    }
  }
  console.log(`   ✅ ${staffCount} personel-aylık kaydı işlendi\n`);

  console.log('═'.repeat(60));
  console.log('🎉 SEED TAMAMLANDI!');
  console.log('═'.repeat(60));
  console.log('═'.repeat(60));
  console.log('\n📋 Özet:');
  console.log('   • Admin: perakende1@sporthink.local (şifre: Admin123!)');
  console.log(`   • Mağazalar: CSV'den ${storeCount} kayıt`);
  console.log(`   • Personel: CSV'den ${staffCount} kayıt`);
  console.log('   • Dönem: Ocak-Şubat 2026');
  console.log('   • Uygulamada başlangıç: Şubat 2026\n');
}

main()
  .then(() => {
    console.log('✅ Seed script başarıyla tamamlandı');
  })
  .catch((err) => {
    console.error('❌ Script hatası:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
