/* eslint-disable no-console */
/**
 * Son 12 ay için dummy performans verisi üretir.
 * Mevcut Ocak-Şubat 2026 Excel verilerini korur (skipDuplicates).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KPI = { CIRO: 1, FATURA: 2, MDO: 3, UPT: 4, SATIS: 5, TEKLI: 6 } as const;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

// Ay dizisi: son 12 ay (bugünden geriye)
function lastTwelveMonths(): { month: number; year: number }[] {
  const result = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return result;
}

async function main() {
  console.log('🌱 Dummy data seed başlıyor…');

  const months = lastTwelveMonths();
  console.log(`📅 Aylar: ${months.map(m => `${m.month}/${m.year}`).join(', ')}`);

  // Sadece satış danışmanlarını al (roleId=4) — Ciro ve UPT için
  const staff = await prisma.user.findMany({
    where: { status: 1, roleId: 4 },
    select: { userId: true, storeId: true },
  });

  // Mağaza müdürlerini al (roleId=3) — Fatura ve MDO için
  const managers = await prisma.user.findMany({
    where: { status: 1, roleId: 3 },
    select: { userId: true, storeId: true },
  });

  console.log(`👥 Satış danışmanı: ${staff.length} | Müdür: ${managers.length}`);

  const goals:   any[] = [];
  const actuals: any[] = [];

  // ── Personel: Ciro hedef + gerçekleşen + UPT ───────────────────────────────
  for (const user of staff) {
    // Her personel için tutarlı bir baz değer (kişiye özgü sabit oran)
    const baseCiro = rand(60_000, 180_000);
    const baseUpt  = rand(1.3, 2.4);

    for (const { month, year } of months) {
      // Ocak-Şubat 2026 Excel'den geldi, atla
      if (year === 2026 && (month === 1 || month === 2)) continue;

      const seasonFactor = [0.85, 0.88, 0.95, 1.0, 1.05, 1.1, 1.15, 1.08, 1.02, 1.12, 1.2, 1.35][month - 1];
      const target  = Math.round(baseCiro * seasonFactor * rand(0.9, 1.1));
      const actual  = Math.round(target   * rand(0.75, 1.15));
      const upt     = parseFloat((baseUpt * seasonFactor * rand(0.85, 1.1)).toFixed(2));
      const uptGoal = parseFloat((baseUpt * seasonFactor).toFixed(2));
      const recordDate = new Date(year, month - 1, 28);

      goals.push({ userId: user.userId, kpiId: KPI.CIRO, targetValue: target,  month, year });
      goals.push({ userId: user.userId, kpiId: KPI.UPT,  targetValue: uptGoal, month, year });
      actuals.push({ userId: user.userId, kpiId: KPI.CIRO, actualValue: actual, recordDate, storeId: user.storeId });
      actuals.push({ userId: user.userId, kpiId: KPI.UPT,  actualValue: upt,    recordDate, storeId: user.storeId });
    }
  }

  // ── Müdür placeholder: Fatura + MDO + Satış Adedi + Tekli Fatura ──────────
  for (const mgr of managers) {
    const baseFatura = randInt(150, 450);
    const baseMdo    = rand(5, 14);
    const baseSatis  = randInt(2000, 5000);
    const baseTekli  = rand(50, 75);

    for (const { month, year } of months) {
      if (year === 2026 && (month === 1 || month === 2)) continue;

      const seasonFactor = [0.85, 0.88, 0.95, 1.0, 1.05, 1.1, 1.15, 1.08, 1.02, 1.12, 1.2, 1.35][month - 1];
      const fatura     = Math.round(baseFatura * seasonFactor * rand(0.88, 1.12));
      const mdo        = parseFloat((baseMdo   * seasonFactor * rand(0.88, 1.12)).toFixed(2));
      const satis      = Math.round(baseSatis  * seasonFactor * rand(0.88, 1.12));
      const tekli      = parseFloat((baseTekli * seasonFactor * rand(0.88, 1.12)).toFixed(2));
      const recordDate = new Date(year, month - 1, 28);

      actuals.push({ userId: mgr.userId, kpiId: KPI.FATURA, actualValue: fatura, recordDate, storeId: mgr.storeId });
      actuals.push({ userId: mgr.userId, kpiId: KPI.MDO,    actualValue: mdo,    recordDate, storeId: mgr.storeId });
      actuals.push({ userId: mgr.userId, kpiId: KPI.SATIS,  actualValue: satis,  recordDate, storeId: mgr.storeId });
      actuals.push({ userId: mgr.userId, kpiId: KPI.TEKLI,  actualValue: tekli,  recordDate, storeId: mgr.storeId });
    }
  }

  console.log(`📊 Üretilen: ${goals.length} hedef, ${actuals.length} gerçekleşen`);
  console.log('💾 Veritabanına yazılıyor…');

  const CHUNK = 500;
  let gInserted = 0, aInserted = 0;

  for (let i = 0; i < goals.length; i += CHUNK) {
    const r = await prisma.performanceGoal.createMany({
      data: goals.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    gInserted += r.count;
  }

  for (let i = 0; i < actuals.length; i += CHUNK) {
    const r = await prisma.performanceActual.createMany({
      data: actuals.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    aInserted += r.count;
  }

  console.log(`   ✅ ${gInserted} hedef eklendi`);
  console.log(`   ✅ ${aInserted} gerçekleşen eklendi`);
  console.log('');
  console.log('🎉 Dummy data tamamlandı!');
}

main()
  .catch(err => { console.error('❌ Hata:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
