/* Ocak-Şubat 2026: Satış Adedi, Hedef UPT, MDO hedef, Tekli Fatura verilerini ekler */
import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();
const EXCEL_PATH = path.resolve(__dirname, '../../PERAKENDE KPI GÜNCEL.xlsx');
const KPI = { CIRO: 1, FATURA: 2, MDO: 3, UPT: 4, SATIS: 5, TEKLI: 6 } as const;
const TR_MONTHS: Record<string, number> = {
  OCAK: 1, ŞUBAT: 2, MART: 3, NİSAN: 4, MAYIS: 5, HAZİRAN: 6,
  TEMMUZ: 7, AĞUSTOS: 8, EYLÜL: 9, EKİM: 10, KASIM: 11, ARALIK: 12,
};

function parseNum(s: unknown): number {
  if (!s && s !== 0) return 0;
  const v = Number(String(s).replace(/[₺%\s,]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

async function main() {
  console.log('📥 Eksik Excel verileri yükleniyor…');
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: false });

  const actuals: any[] = [];
  const goals:   any[] = [];

  let currentMonth = 0;
  const YEAR = 2026;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const c0 = String(row?.[0] ?? '').trim().toUpperCase();

    if (TR_MONTHS[c0]) { currentMonth = TR_MONTHS[c0]; i++; continue; }
    if (c0 === 'PERSONEL HEDEF GERÇEKLEŞTİRME') { currentMonth = 0; continue; }
    if (!currentMonth || !row?.[0]) continue;
    if (/^(MAĞAZA|TOPLAM|GENEL|Perakende)/i.test(c0)) continue;

    const storeName = String(row[0]).trim();
    if (!storeName) continue;

    // col 8: Toplam Adet, col 11: Hedef UPT, col 13: Hedef MDO, col 17: Tekli Fatura Oranı
    const satisAdet  = parseNum(row[8]);
    const hedefUpt   = parseNum(row[11]);
    const hedefMdo   = parseNum(row[13]);
    const tekli      = parseNum(row[17]);

    const store = await prisma.store.findFirst({ where: { storeName } });
    if (!store) { console.log('  ⚠ Mağaza bulunamadı:', storeName); continue; }

    const mgr = await prisma.user.findFirst({ where: { storeId: store.storeId, roleId: 3 } });
    if (!mgr) { console.log('  ⚠ Müdür bulunamadı:', storeName); continue; }

    const recordDate = new Date(YEAR, currentMonth - 1, 28);

    if (satisAdet > 0) actuals.push({ userId: mgr.userId, kpiId: KPI.SATIS, actualValue: satisAdet, recordDate, storeId: store.storeId });
    if (tekli > 0) {
      const tekliPct = tekli > 1 ? tekli : tekli * 100;
      actuals.push({ userId: mgr.userId, kpiId: KPI.TEKLI, actualValue: parseFloat(tekliPct.toFixed(2)), recordDate, storeId: store.storeId });
    }
    if (hedefUpt > 0) goals.push({ userId: mgr.userId, kpiId: KPI.UPT, targetValue: hedefUpt, month: currentMonth, year: YEAR });
    if (hedefMdo > 0) {
      const mdoPct = hedefMdo > 1 ? hedefMdo : hedefMdo * 100;
      goals.push({ userId: mgr.userId, kpiId: KPI.MDO, targetValue: parseFloat(mdoPct.toFixed(2)), month: currentMonth, year: YEAR });
    }
  }

  console.log(`📊 ${goals.length} hedef, ${actuals.length} gerçekleşen hazırlandı`);

  await prisma.performanceGoal.createMany({ data: goals, skipDuplicates: true });
  await prisma.performanceActual.createMany({ data: actuals, skipDuplicates: true });

  console.log('✅ Tamamlandı');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
