/* eslint-disable no-console */
/**
 * Sporthink — Perakende KPI Excel Toplu Yükleme
 *
 * Kullanım:
 *   cd backend
 *   npx ts-node prisma/seed-performance.ts
 *
 * Veriler "PERAKENDE KPI GÜNCEL.xlsx" dosyasından okunur (proje kökünde).
 * Excel dosyasında iki tip blok vardır:
 *   1) Aylık Mağaza Özeti        (OCAK / ŞUBAT) → mağaza bazlı Hedef-Ciro, Fatura, MDO, UPT
 *   2) Personel Hedef Gerçekleştirme (Jan-26 / Feb-26) → personel bazlı Hedef, Gerçekleşen, UPT
 *
 * Yükleme stratejisi (mükerrer toplama olmasın diye):
 *   • Personel bazlı Ciro hedefi & Gerçekleşen Ciro & kişisel UPT → personel user kaydı
 *   • Mağaza bazlı Fatura Sayısı & MDO                            → mağazaya bağlı "müdür" placeholder user
 *
 * Mağaza toplam Ciro'su zaten personel Ciro'larının toplamından
 * `storeSummary` agregasyonu ile elde ediliyor (bkz. performance.routes.ts).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

// ─── Sabitler ────────────────────────────────────────────────────────────────

const EXCEL_PATH = path.resolve(__dirname, '../../PERAKENDE KPI GÜNCEL.xlsx');

const KPI = {
  CIRO:    1,  // Aylık Satış Hedefi / Gerçekleşen (TL)
  FATURA:  2,  // Fatura Sayısı (adet)
  MDO:     3,  // Müşteri Dönüşüm Oranı (%)
  UPT:     4,  // Units Per Transaction (adet)
} as const;

// Excel'deki "Jan-26", "Feb-26" gibi etiketleri ay numarasına çevirir
const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// ─── Parse Yardımcıları ──────────────────────────────────────────────────────

/** "₺6,600,000" → 6600000  •  "603,133.00" → 603133 */
function parseMoney(s: unknown): number {
  if (s === null || s === undefined || s === '') return 0;
  const v = Number(String(s).replace(/[₺$\s]/g, '').replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

/** "1.589" / "0.0684" / "%6.8" → number  (ondalık nokta) */
function parseNum(s: unknown): number {
  if (s === null || s === undefined || s === '') return 0;
  const cleaned = String(s).replace(/[%\s]/g, '').replace(/,/g, '');
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : 0;
}

/** "Jan-26" → { month:1, year:2026 } */
function parseMonthLabel(s: string): { month: number; year: number } | null {
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const month = MONTH_MAP[m[1]];
  if (!month) return null;
  return { month, year: 2000 + Number(m[2]) };
}

/** Türkçe karakterleri ASCII'ye çevirip e-posta için slug üretir */
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

// ─── DB Yardımcıları ─────────────────────────────────────────────────────────

async function ensureKpis(): Promise<void> {
  const defs = [
    { kpiId: KPI.CIRO,   kpiName: 'Aylık Satış Hedefi (Ciro)', unit: 'TL' },
    { kpiId: KPI.FATURA, kpiName: 'Fatura Sayısı',             unit: 'Adet' },
    { kpiId: KPI.MDO,    kpiName: 'MDO',                       unit: '%' },
    { kpiId: KPI.UPT,    kpiName: 'UPT',                       unit: 'Adet' },
  ];
  for (const def of defs) {
    await prisma.kpiDefinition.upsert({
      where:  { kpiId: def.kpiId },
      update: { kpiName: def.kpiName, unit: def.unit },
      create: def,
    });
  }
}

async function ensureRegion(regionName: string): Promise<number> {
  const found = await prisma.region.findFirst({ where: { regionName } });
  if (found) return found.regionId;
  const created = await prisma.region.create({ data: { regionName } });
  return created.regionId;
}

async function ensureStore(storeName: string, regionId: number): Promise<number> {
  const found = await prisma.store.findFirst({ where: { storeName } });
  if (found) {
    if (found.regionId !== regionId) {
      await prisma.store.update({ where: { storeId: found.storeId }, data: { regionId } });
    }
    return found.storeId;
  }
  const created = await prisma.store.create({ data: { storeName, regionId } });
  return created.storeId;
}

/** Mağaza özet KPI'lerini (Fatura, MDO) tutmak için her mağazaya bağlı bir müdür placeholder kullanıcı */
async function ensureStoreManager(storeId: number, storeName: string): Promise<number> {
  const found = await prisma.user.findFirst({ where: { storeId, roleId: 3 } });
  if (found) return found.userId;

  const slug = slugify(storeName);
  const email = `mudur.${slug}.${storeId}@sporthink.local`;
  const password = await bcrypt.hash('Manager123!', 10);

  const created = await prisma.user.create({
    data: {
      fullName: `${storeName} — Mağaza Müdürü`,
      email,
      password,
      roleId:  3,        // Müdür (seed.ts ile aynı)
      storeId,
      status:  1,
    },
  });
  return created.userId;
}

/** Personel (Satış Danışmanı) kullanıcısını upsert eder */
async function ensureStaff(fullName: string, storeId: number): Promise<number> {
  const found = await prisma.user.findFirst({ where: { fullName, storeId } });
  if (found) return found.userId;

  const slug = slugify(fullName);
  let email = `${slug}@sporthink.local`;
  let i = 1;
  while (await prisma.user.findFirst({ where: { email } })) {
    email = `${slug}${i}@sporthink.local`;
    i++;
  }
  const password = await bcrypt.hash('Staff123!', 10);

  const created = await prisma.user.create({
    data: {
      fullName,
      email,
      password,
      roleId:  4,  // Satış Danışmanı
      storeId,
      status:  1,
    },
  });
  return created.userId;
}

/** Aynı (user, kpi, month, year) için varsa günceller, yoksa oluşturur */
async function upsertGoal(userId: number, kpiId: number, targetValue: number, month: number, year: number) {
  if (!Number.isFinite(targetValue) || targetValue <= 0) return;
  const existing = await prisma.performanceGoal.findFirst({ where: { userId, kpiId, month, year } });
  if (existing) {
    await prisma.performanceGoal.update({
      where: { goalId: existing.goalId },
      data:  { targetValue },
    });
  } else {
    await prisma.performanceGoal.create({
      data: { userId, kpiId, targetValue, month, year },
    });
  }
}

/** Aynı (user, kpi, recordDate) için varsa günceller, yoksa oluşturur */
async function upsertActual(
  userId: number, kpiId: number, actualValue: number, recordDate: Date, storeId: number | null
) {
  if (!Number.isFinite(actualValue)) return;
  const existing = await prisma.performanceActual.findFirst({ where: { userId, kpiId, recordDate } });
  if (existing) {
    await prisma.performanceActual.update({
      where: { actualId: existing.actualId },
      data:  { actualValue, storeId },
    });
  } else {
    await prisma.performanceActual.create({
      data: { userId, kpiId, actualValue, recordDate, storeId },
    });
  }
}

// ─── Excel Bölüm Tespiti ─────────────────────────────────────────────────────

const TR_MONTHS: Record<string, number> = {
  OCAK: 1, ŞUBAT: 2, MART: 3, NİSAN: 4, MAYIS: 5, HAZİRAN: 6,
  TEMMUZ: 7, AĞUSTOS: 8, EYLÜL: 9, EKİM: 10, KASIM: 11, ARALIK: 12,
};

type Row = any[];

interface StoreSection { month: number; year: number; startRow: number; endRow: number }
interface PersonnelSection { startRow: number; endRow: number }

function detectSections(rows: Row[], year = 2026): { stores: StoreSection[]; personnel: PersonnelSection[] } {
  const stores: StoreSection[] = [];
  const personnel: PersonnelSection[] = [];

  let currentStore: StoreSection | null = null;
  let currentPers:  PersonnelSection | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c0 = r?.[0];
    if (typeof c0 === 'string') {
      const upper = c0.toUpperCase().trim();

      // Aylık mağaza bloğu başlangıcı
      if (TR_MONTHS[upper]) {
        // Önceki blokları kapat
        if (currentStore) { currentStore.endRow = i - 1; stores.push(currentStore); currentStore = null; }
        if (currentPers)  { currentPers.endRow  = i - 1; personnel.push(currentPers);  currentPers  = null; }
        // Yeni mağaza bloğu — başlık satırı bir sonraki satırda (MAĞAZA, Son Bölge, ...)
        currentStore = { month: TR_MONTHS[upper], year, startRow: i + 2, endRow: i + 2 };
        continue;
      }

      // Personel bloğu başlangıcı
      if (upper === 'PERSONEL HEDEF GERÇEKLEŞTİRME') {
        if (currentStore) { currentStore.endRow = i - 1; stores.push(currentStore); currentStore = null; }
        if (currentPers)  { currentPers.endRow  = i - 1; personnel.push(currentPers);  currentPers  = null; }
        currentPers = { startRow: i + 2, endRow: i + 2 };  // başlık satırı i+1
        continue;
      }
    }
  }
  if (currentStore) { currentStore.endRow = rows.length - 1; stores.push(currentStore); }
  if (currentPers)  { currentPers.endRow  = rows.length - 1; personnel.push(currentPers); }
  return { stores, personnel };
}

// ─── Ana Akış ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 KPI seed başlıyor…');
  console.log('📂 Excel:', EXCEL_PATH);

  // ── VERİTABANI TEMİZLİĞİ: KPI VERILERINI SİL ──────────────────────────────
  console.log('🗑️  Eski KPI verileri siliniyor...');
  await prisma.performanceGoal.deleteMany({});
  await prisma.performanceActual.deleteMany({});
  console.log('✅ Tüm PerformanceGoal ve PerformanceActual kayıtları silindi');

  const wb     = xlsx.readFile(EXCEL_PATH);
  const sheet  = wb.Sheets[wb.SheetNames[0]];
  const rows   = xlsx.utils.sheet_to_json<Row>(sheet, { header: 1, defval: null, raw: false });
  console.log(`📑 ${rows.length} satır okundu`);

  await ensureKpis();
  console.log('✅ KPI tanımları hazır (Ciro, Fatura, MDO, UPT)');

  const { stores: storeSections, personnel: personnelSections } = detectSections(rows);
  console.log(`🔎 Tespit: ${storeSections.length} mağaza-bloğu, ${personnelSections.length} personel-bloğu`);

  // ── A) Mağaza özet blokları (OCAK / ŞUBAT) ───────────────────────────────
  // Sütun düzeni:
  //  0 MAĞAZA  1 Bölge  2 Hedef Ciro  3 Ciro  4 Fark  5 Hedef%  6 LFL Ciro  7 LFL Adet
  //  8 Toplam Adet  9 Fatura  10 Ziyaretçi  11 Hedef UPT  12 UPT  13 Hedef MDO  14 MDO
  //  15 ASP  16 ATV  17 Tekli Fatura  18 Ayakkabı/Tekstil
  let storeRecordsInserted = 0;
  for (const sect of storeSections) {
    // Sadece Ocak (1) ve Şubat (2) aylarını işle
    if (sect.month !== 1 && sect.month !== 2) {
      console.log(`   ⊘ Ay ${sect.month}/${sect.year} atlandı (sadece Ocak-Şubat kabul)`);
      continue;
    }
    const recordDate = new Date(sect.year, sect.month - 1, 28);
    for (let r = sect.startRow; r <= sect.endRow; r++) {
      const row = rows[r];
      if (!row || !row[0]) continue;
      const storeNameRaw = String(row[0]).trim();
      if (!storeNameRaw) continue;
      // Toplam / başlık satırlarını atla
      if (/^(MAĞAZA|TOPLAM|GENEL|Perakende)/i.test(storeNameRaw)) continue;

      const regionName  = String(row[1] ?? 'Genel').trim() || 'Genel';
      const fatura      = Math.round(parseNum(row[9]));
      const mdoDecimal  = parseNum(row[14]);   // 0..1 aralığı (ör 0.068)
      const mdo         = mdoDecimal > 1 ? mdoDecimal : mdoDecimal * 100;  // %

      const regionId  = await ensureRegion(regionName);
      const storeId   = await ensureStore(storeNameRaw, regionId);
      const managerId = await ensureStoreManager(storeId, storeNameRaw);

      // Mağaza özet KPI'leri: yalnız Fatura ve MDO (Ciro/UPT personel toplamından gelecek)
      if (fatura > 0) await upsertActual(managerId, KPI.FATURA, fatura, recordDate, storeId);
      if (mdo   > 0) await upsertActual(managerId, KPI.MDO,    mdo,    recordDate, storeId);
      storeRecordsInserted++;
    }
    console.log(`   ↳ ${sect.month}/${sect.year}: ${storeRecordsInserted} mağaza işlendi`);
  }

  // ── B) Personel blokları (Jan-26 / Feb-26) — Batch mod ──────────────────
  // Sütun düzeni: 0 ay  1 MAĞAZA  2 İSİM  3 HEDEF  4 GERÇEKLEŞEN  5 UPT  6 %

  // Tüm mağaza ve kullanıcıları tek seferde yükle
  const allStores = await prisma.store.findMany({ select: { storeId: true, storeName: true } });
  const storeMap  = new Map(allStores.map(s => [s.storeName.trim(), s.storeId]));

  const allUsers = await prisma.user.findMany({
    where: { roleId: 4 },
    select: { userId: true, fullName: true, storeId: true },
  });
  const userMap = new Map(allUsers.map(u => [`${u.fullName.trim()}__${u.storeId}`, u.userId]));

  const staffGoals:   any[] = [];
  const staffActuals: any[] = [];
  let staffRecordsInserted = 0;

  for (const sect of personnelSections) {
    for (let r = sect.startRow; r <= sect.endRow; r++) {
      const row = rows[r];
      if (!row) continue;
      const monthLabel = row[0];
      if (typeof monthLabel !== 'string') continue;
      const parsed = parseMonthLabel(monthLabel);
      if (!parsed) continue;
      if (parsed.month !== 1 && parsed.month !== 2) continue;

      const storeNameRaw = String(row[1] ?? '').trim();
      const fullName     = String(row[2] ?? '').trim();
      const target       = parseMoney(row[3]);
      const actual       = parseMoney(row[4]);
      const upt          = parseNum(row[5]);

      if (!storeNameRaw || !fullName) continue;
      if (/^(MAĞAZA|TOPLAM|GENEL)/i.test(fullName)) continue;

      let storeId = storeMap.get(storeNameRaw);
      if (!storeId) {
        const regionId = await ensureRegion('Genel');
        const s = await prisma.store.create({ data: { storeName: storeNameRaw, regionId } });
        storeId = s.storeId;
        storeMap.set(storeNameRaw, storeId);
      }

      let userId = userMap.get(`${fullName}__${storeId}`);
      if (!userId) {
        userId = await ensureStaff(fullName, storeId);
        userMap.set(`${fullName}__${storeId}`, userId);
      }

      const recordDate = new Date(parsed.year, parsed.month - 1, 28);
      if (target > 0) staffGoals.push({ userId, kpiId: KPI.CIRO, targetValue: target, month: parsed.month, year: parsed.year });
      if (actual > 0) staffActuals.push({ userId, kpiId: KPI.CIRO, actualValue: actual, recordDate, storeId });
      if (upt    > 0) staffActuals.push({ userId, kpiId: KPI.UPT,  actualValue: upt,    recordDate, storeId });
      staffRecordsInserted++;
    }
  }

  const CHUNK = 200;
  for (let i = 0; i < staffGoals.length;   i += CHUNK) await prisma.performanceGoal  .createMany({ data: staffGoals  .slice(i, i + CHUNK), skipDuplicates: true });
  for (let i = 0; i < staffActuals.length; i += CHUNK) await prisma.performanceActual.createMany({ data: staffActuals.slice(i, i + CHUNK), skipDuplicates: true });
  console.log(`   ↳ ${staffRecordsInserted} personel-ay kaydı işlendi`);

  console.log('');
  console.log('🎉 Seed tamamlandı!');
}

main()
  .catch((err) => { console.error('❌ Seed hatası:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
