import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ui/ProgressBar';
import KPIChart, { ComparisonChart } from '../components/charts/KPIChart';
import api from '../lib/api';
import { ActionMenu, PromotionModal, StaffBasic } from '../components/promotion/PromotionModal';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface KpiDef { kpiId: number; kpiName: string; unit: string | null; description: string | null }

interface Goal {
  goalId: number; userId: number; kpiId: number; targetValue: string;
  month: number; year: number;
  storeId?: number | null;
  store?: { storeId: number; storeName: string } | null;
  kpi: KpiDef;
  user?: { fullName: string; role: { roleName: string } };
}

interface Actual {
  actualId: number; userId: number; kpiId: number; actualValue: string; recordDate: string;
  storeId?: number | null;
  store?: { storeId: number; storeName: string } | null;
  kpi: KpiDef;
  user?: { fullName: string };
}

interface StoreUser {
  userId: number; fullName: string;
  role: { roleName: string; roleId: number };
}

interface StoreSummaryItem {
  kpi: KpiDef; totalTarget: number; totalActual: number; rate: number;
}

interface TrendPoint { month: string; actual: number; storeName?: string | null; target?: number }
interface MyPerf  {
  goals: Goal[];
  actuals: Actual[];
  trends: Record<number, TrendPoint[]>;
  currentStoreName?: string | null;
}
interface StorePerf { storeUsers: StoreUser[]; goals: Goal[]; actuals: Actual[]; storeSummary: StoreSummaryItem[] }
interface YearlyPoint { month: string; monthNum: number; year: number; personal: number; storeAvg: number }
interface YearlyPerf { yearly: Record<number, YearlyPoint[]> }

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

const KPI_CONFIG: Record<number, { icon: string; color: string; format: (v: number, unit: string|null) => string }> = {
  1: { icon: '🎯', color: '#D42B2B', format: (v) => v.toLocaleString('tr-TR') + ' TL' },
  2: { icon: '💰', color: '#22C55E', format: (v) => v.toLocaleString('tr-TR') + ' adet' },
  3: { icon: '👥', color: '#7C3AED', format: (v) => '%' + v.toFixed(1) },
  4: { icon: '📦', color: '#0EA5E9', format: (v) => v.toFixed(2) + ' adet' },
};

function rateColor(rate: number) {
  if (rate >= 100) return 'bg-green-500';
  if (rate >= 70)  return 'bg-amber-400';
  return 'bg-brand-red';
}

function rateText(rate: number) {
  if (rate >= 100) return 'text-green-600';
  if (rate >= 70)  return 'text-amber-600';
  return 'text-brand-red';
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [selectedMonth, setSelectedMonth] = useState(2); // Şubat 2026 — en güncel veri
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const { isManager, isRegionalManager, isAdmin, user } = useAuth();
  const isMgr = isManager || isRegionalManager;

  const myParams = { month: selectedMonth, year: 2026 };
  const { data: myPerf, loading: myLoading } = useApi<MyPerf>(isAdmin ? '' : '/performance/my', myParams);
  const { data: storePerf, loading: storeLoading } = useApi<StorePerf>(
    isMgr ? '/performance/store' : '', myParams
  );
  const adminParams = { month: selectedMonth, year: 2026, ...(selectedStoreId ? { storeId: selectedStoreId } : {}) };
  const { data: adminPerf, loading: adminLoading, refetch: refetchAdmin } = useApi<any>(isAdmin ? '/performance/admin' : '', adminParams);
  const { data: storesList } = useApi<{ storeId: number; storeName: string }[]>(isAdmin ? '/performance/stores-list' : '');
  const { data: kpiDefs } = useApi<KpiDef[]>('/performance/kpis');
  const { data: yearlyPerf } = useApi<YearlyPerf>(!isAdmin && !isMgr ? '/performance/my-yearly' : '');

  const MDO_KPI_ID = 3;

  const goals   = myPerf?.goals   ?? [];
  const actuals = myPerf?.actuals ?? [];
  const trends  = myPerf?.trends  ?? {};

  const visibleKpiDefs = useMemo(
    () => (isMgr || isAdmin) ? (kpiDefs ?? []) : (kpiDefs ?? []).filter(k => k.kpiId !== MDO_KPI_ID),
    [kpiDefs, isMgr, isAdmin]
  );

  const kpiCards = useMemo(() => {
    const map: Record<number, { kpi: KpiDef; target: number; actual: number }> = {};
    goals.forEach(g => { map[g.kpiId] = { kpi: g.kpi, target: parseFloat(g.targetValue), actual: 0 }; });
    actuals.forEach(a => {
      if (map[a.kpiId]) map[a.kpiId].actual += parseFloat(a.actualValue);
      else map[a.kpiId] = { kpi: a.kpi, target: 0, actual: parseFloat(a.actualValue) };
    });
    return Object.values(map);
  }, [goals, actuals]);

  const personalAvgRate = kpiCards.length
    ? Math.round(kpiCards.reduce((s, k) => s + (k.target > 0 ? Math.min((k.actual / k.target) * 100, 100) : 0), 0) / kpiCards.length)
    : 0;

  const storeAvgRate = useMemo(() => {
    const items = (storePerf?.storeSummary ?? []).filter(s => s.totalTarget > 0);
    if (!items.length) return 0;
    return Math.round(items.reduce((s, k) => s + Math.min((k.totalActual / k.totalTarget) * 100, 100), 0) / items.length);
  }, [storePerf]);

  const adminAvgRate = useMemo(() => {
    const summary = adminPerf?.chainSummary ?? adminPerf?.storeSummary ?? [];
    const items = summary.filter((s: any) => s.totalTarget > 0);
    if (!items.length) return 0;
    return Math.round(items.reduce((s: number, k: any) => s + Math.min((k.totalActual / k.totalTarget) * 100, 100), 0) / items.length);
  }, [adminPerf]);

  const displayAvgRate = isAdmin ? adminAvgRate : isMgr ? storeAvgRate : personalAvgRate;

  return (
    <div className="space-y-6">

      {/* Üst başlık bandı */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-2xl p-5 lg:p-6 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">
              {isAdmin ? 'Zincir Performans Analizi' : isMgr ? 'Mağaza Performansı' : 'Performans Takibi'}
            </p>
            <h2 className="text-xl font-extrabold">
              {isAdmin ? 'Sporthink Merkezi Yönetim' : isMgr ? (user?.store ?? user?.fullName) : user?.fullName}
            </h2>
            {/* Personel: o ay fiilen çalışılan mağaza (PerformanceActual.storeId üzerinden);
                Müdür: kendi mağazası. */}
            {!isAdmin && (
              <p className="text-white/70 text-sm mt-0.5">
                🏪 {isMgr
                      ? user?.store
                      : (myPerf?.currentStoreName ?? user?.store ?? '—')}
                {!isMgr && myPerf?.currentStoreName && myPerf.currentStoreName !== user?.store && (
                  <span className="ml-2 px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-semibold">
                    {MONTHS[selectedMonth - 1]} ayı
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {MONTHS.map((m, i) => {
              const mn = i + 1;
              return (
                <button key={mn} onClick={() => setSelectedMonth(mn)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    mn === selectedMonth ? 'bg-white text-brand-red' : 'bg-white/15 text-white/80 hover:bg-white/25'
                  }`}>{m}</button>
              );
            })}
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-white/70 mb-1.5">
            <span>
              {isAdmin ? 'Zincir Hedef Başarısı' : isMgr ? 'Mağaza Hedef Başarısı' : 'Genel Hedef Başarısı'} ({MONTHS[selectedMonth - 1]})
            </span>
            <span className="font-bold text-white">%{displayAvgRate}</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${displayAvgRate}%` }} />
          </div>
        </div>
      </div>

      {/* Admin: Mağaza Seçici */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-brand-black">🏪 Mağaza Seçiniz:</label>
          <select
            value={selectedStoreId ?? ''}
            onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-white shadow-card
              focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red min-w-[220px]"
          >
            <option value="">Tüm Mağazalar</option>
            {(storesList ?? []).map(s => (
              <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
            ))}
          </select>
        </div>
      )}

      {/* ─── ADMIN GÖRÜNÜMÜ ─── */}
      {isAdmin ? (
        adminLoading ? <SkeletonCards /> : <AdminView data={adminPerf} selectedStoreId={selectedStoreId} month={selectedMonth} kpiDefs={visibleKpiDefs} refetch={refetchAdmin} />
      ) : isMgr ? (
        /* ─── MÜDÜR GÖRÜNÜMÜ ─── */
        <>
          {myLoading || storeLoading ? <SkeletonCards /> : <ManagerStoreView data={storePerf} />}
          {storeLoading ? <SkeletonCards /> : <StoreView data={storePerf} month={selectedMonth} kpiDefs={visibleKpiDefs} />}
        </>
      ) : (
        /* ─── PERSONEL GÖRÜNÜMÜ ─── */
        myLoading ? <SkeletonCards /> : kpiCards.length === 0 ? <EmptyState /> : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {kpiCards.map(({ kpi, target, actual }) => {
                const cfg = KPI_CONFIG[kpi.kpiId] ?? { icon: '📊', color: '#D42B2B', format: (v: number) => String(v) };
                const rate = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
                const yearlyEntry = yearlyPerf?.yearly[kpi.kpiId]?.find(
                  d => d.monthNum === selectedMonth && d.year === 2026
                );
                return (
                  <KpiCard
                    key={kpi.kpiId}
                    icon={cfg.icon} name={kpi.kpiName} unit={kpi.unit}
                    target={target} actual={actual} rate={rate}
                    color={cfg.color} format={cfg.format}
                    storeAvg={yearlyEntry?.storeAvg}
                  />
                );
              })}
            </div>
            <h2 className="text-base font-bold text-brand-black mt-2">Aylık Trend Grafikleri</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {kpiCards.map(({ kpi }) => {
                const cfg = KPI_CONFIG[kpi.kpiId] ?? { icon: '📊', color: '#D42B2B' };
                const trendData = trends[kpi.kpiId] ?? [];
                const goal = goals.find(g => g.kpiId === kpi.kpiId);
                return <TrendCard key={kpi.kpiId} title={kpi.kpiName} icon={cfg.icon} unit={kpi.unit ?? ''} color={cfg.color} data={trendData.map(d => ({ ...d, target: goal ? parseFloat(goal.targetValue) : undefined }))} />;
              })}
            </div>
            {yearlyPerf && visibleKpiDefs.length > 0 && (
              <YearlyComparisonSection
                yearlyPerf={yearlyPerf}
                kpiDefs={kpiDefs ?? []}
                visibleKpiIds={visibleKpiDefs.map(k => k.kpiId)}
              />
            )}
          </>
        )
      )}
    </div>
  );
}

// ─── Müdür: Mağaza Toplam KPI Kartları ───────────────────────────────────────

function ManagerStoreView({ data }: { data: StorePerf | null | undefined }) {
  if (!data) return <EmptyState />;

  const items = data.storeSummary.filter(s => s.totalTarget > 0 || s.totalActual > 0);
  if (items.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {items.map(s => {
          const cfg = KPI_CONFIG[s.kpi.kpiId] ?? { icon: '📊', color: '#D42B2B', format: (v: number) => String(v) };
          return (
            <KpiCard
              key={s.kpi.kpiId}
              icon={cfg.icon} name={s.kpi.kpiName} unit={s.kpi.unit}
              target={s.totalTarget} actual={s.totalActual} rate={s.rate}
              color={cfg.color} format={cfg.format}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── KPI Kartı ────────────────────────────────────────────────────────────────

function KpiCard({ icon, name, unit, target, actual, rate, color, format, storeAvg }: {
  icon: string; name: string; unit: string | null;
  target: number; actual: number; rate: number;
  color: string; format: (v: number, u: string | null) => string;
  storeAvg?: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="font-bold text-sm text-brand-black leading-snug">{name}</h3>
        </div>
        {rate >= 100 && (
          <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md shrink-0">
            ✓ Hedefe Ulaşıldı
          </span>
        )}
      </div>

      {storeAvg !== undefined ? (
        /* Yan yana karşılaştırma kutuları — sadece personel görünümünde */
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-brand-red/5 border border-brand-red/20 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-brand-red uppercase tracking-wider mb-1">Benim Verim</p>
            <p className={`text-base font-extrabold leading-tight ${rateText(rate)}`}>{format(actual, unit)}</p>
          </div>
          <div className="bg-brand-gray/5 border border-brand-gray/20 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-brand-gray uppercase tracking-wider mb-1">Mağaza Ort.</p>
            <p className="text-base font-extrabold leading-tight text-brand-gray">{format(storeAvg, unit)}</p>
          </div>
        </div>
      ) : (
        /* Standart tek-değer düzeni — müdür / admin */
        <div className="flex justify-between items-end mb-3">
          <div>
            <p className="text-xs text-brand-gray mb-0.5">Gerçekleşen</p>
            <p className={`text-2xl font-extrabold ${rateText(rate)}`}>{format(actual, unit)}</p>
          </div>
          {target > 0 && (
            <div className="text-right">
              <p className="text-xs text-brand-gray mb-0.5">Hedef</p>
              <p className="text-base font-bold text-brand-gray">{format(target, unit)}</p>
            </div>
          )}
        </div>
      )}

      {target > 0 && (
        <>
          <ProgressBar value={rate} showPercent height="h-2.5" color={rateColor(rate)} />
          <p className={`text-xs font-semibold mt-1.5 ${rateText(rate)}`}>%{Math.round(rate)}</p>
        </>
      )}
    </div>
  );
}

// ─── Trend Grafik Kartı ───────────────────────────────────────────────────────

function TrendCard({ title, icon, unit, color, data }: {
  title: string; icon: string; unit: string;
  color: string; data: { month: string; actual: number; target?: number; storeName?: string | null }[];
}) {
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const diff = last && prev && prev.actual > 0
    ? Math.round(((last.actual - prev.actual) / prev.actual) * 100)
    : 0;

  // Verisi olan aylar için ay → mağaza eşlemesi (rotasyon görünürlüğü)
  const monthsWithStore = data.filter(d => d.actual > 0 && d.storeName);
  const uniqueStores = new Set(monthsWithStore.map(d => d.storeName));
  const showRotationList = uniqueStores.size > 1; // Sadece mağaza değişikliği varsa göster

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <h3 className="font-bold text-sm text-brand-black">{title}</h3>
            <p className="text-xs text-brand-gray">Son 6 ay</p>
          </div>
        </div>
        {last && (
          <div className="text-right">
            <p className="text-sm font-extrabold text-brand-black">
              {last.actual > 0 ? last.actual.toLocaleString('tr-TR') : '—'}
              {unit && <span className="text-xs font-normal text-brand-gray ml-1">{unit}</span>}
            </p>
            {diff !== 0 && (
              <p className={`text-xs font-semibold ${diff >= 0 ? 'text-green-600' : 'text-brand-red'}`}>
                {diff >= 0 ? '↑' : '↓'} %{Math.abs(diff)} önceki aya göre
              </p>
            )}
          </div>
        )}
      </div>
      <KPIChart data={data} type="area" unit={unit} color={color} height={180} showTarget={data.some(d => d.target != null)} />

      {/* Personel rotasyonu: ay → mağaza eşleşmesi */}
      {showRotationList && (
        <div className="mt-4 pt-3 border-t border-brand-border/50">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-gray mb-2">
            🔄 Aylık Mağaza Geçmişi
          </p>
          <div className="flex flex-wrap gap-1.5">
            {monthsWithStore.map((d, i) => (
              <span
                key={`${d.month}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-lightGray text-[11px] text-brand-black"
              >
                <span className="font-semibold">{d.month}</span>
                <span className="text-brand-gray">•</span>
                <span className="text-brand-gray">{d.storeName}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ekip Listesi (Müdür görünümü) ───────────────────────────────────────────

function StoreView({ data, month, kpiDefs }: { data: StorePerf | null; month: number; kpiDefs: KpiDef[] }) {
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ userId: 0, kpiId: 0, targetValue: '' });
  const [saving, setSaving] = useState(false);

  if (!data) return <EmptyState />;

  const { storeUsers, storeSummary, goals, actuals } = data;

  async function saveGoal() {
    if (!goalForm.userId || !goalForm.kpiId || !goalForm.targetValue) return;
    setSaving(true);
    try {
      await api.post('/performance/goals', {
        userId: goalForm.userId,
        kpiId: goalForm.kpiId,
        targetValue: parseFloat(goalForm.targetValue),
        month,
        year: 2026,
      });
      setAddGoalOpen(false);
      setGoalForm({ userId: 0, kpiId: 0, targetValue: '' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">

      {/* Personel KPI Tablosu */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
          <h3 className="font-bold text-brand-black">Ekip Performans Tablosu</h3>
          <button onClick={() => setAddGoalOpen(s => !s)}
            className="text-xs font-bold text-brand-red border border-brand-redMid bg-brand-redLight
              hover:bg-brand-red hover:text-white px-3 py-1.5 rounded-lg transition-colors">
            + Hedef Ekle
          </button>
        </div>

        {/* Hedef ekleme mini formu */}
        {addGoalOpen && (
          <div className="px-5 py-4 border-b border-brand-border bg-brand-lightGray">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-brand-gray mb-1">Personel</label>
                <select value={goalForm.userId}
                  onChange={e => setGoalForm(f => ({ ...f, userId: Number(e.target.value) }))}
                  className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/30">
                  <option value={0}>Seçin</option>
                  {storeUsers.map(u => <option key={u.userId} value={u.userId}>{u.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-gray mb-1">KPI</label>
                <select value={goalForm.kpiId}
                  onChange={e => setGoalForm(f => ({ ...f, kpiId: Number(e.target.value) }))}
                  className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/30">
                  <option value={0}>Seçin</option>
                  {kpiDefs.map(k => <option key={k.kpiId} value={k.kpiId}>{k.kpiName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-brand-gray mb-1">Hedef Değer</label>
                <input type="number" value={goalForm.targetValue}
                  onChange={e => setGoalForm(f => ({ ...f, targetValue: e.target.value }))}
                  placeholder="0"
                  className="w-36 px-3 py-2 text-sm rounded-xl border border-brand-border bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/30" />
              </div>
              <button onClick={saveGoal} disabled={saving || !goalForm.userId || !goalForm.kpiId || !goalForm.targetValue}
                className="bg-brand-red text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors hover:bg-brand-redDark">
                {saving ? '...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}

        {/* Tablo */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-lightGray">
                <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray">Personel</th>
                {kpiDefs.map(k => (
                  <th key={k.kpiId} className="text-center px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">
                    {KPI_CONFIG[k.kpiId]?.icon} {k.kpiName}
                    {k.unit && <span className="text-brand-gray/60 ml-1">({k.unit})</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">

              {/* Mağaza Genel Performansı — sabit üst satır */}
              <tr className="bg-brand-red/5 border-b-2 border-brand-red/20">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                      🏪
                    </div>
                    <div>
                      <p className="font-bold text-brand-black text-xs">Mağaza Genel Performansı</p>
                      <p className="text-[10px] text-brand-red">Tüm ekip toplamı</p>
                    </div>
                  </div>
                </td>
                {kpiDefs.map(k => {
                  const s   = storeSummary.find(s => s.kpi.kpiId === k.kpiId);
                  const cfg = KPI_CONFIG[k.kpiId];
                  if (!s || (s.totalTarget === 0 && s.totalActual === 0)) {
                    return <td key={k.kpiId} className="px-4 py-3 text-center"><span className="text-xs text-brand-gray/40">—</span></td>;
                  }
                  return (
                    <td key={k.kpiId} className="px-4 py-3 text-center">
                      <div className="min-w-[80px]">
                        <p className={`font-bold text-xs ${rateText(s.rate)}`}>
                          {cfg ? cfg.format(s.totalActual, k.unit) : s.totalActual.toLocaleString('tr-TR')}
                        </p>
                        {s.totalTarget > 0 && (
                          <>
                            <p className="text-xs text-brand-gray/70">
                              / {cfg ? cfg.format(s.totalTarget, k.unit) : s.totalTarget.toLocaleString('tr-TR')}
                            </p>
                            <div className="mt-1">
                              <ProgressBar value={s.rate} showPercent={false} height="h-1" color={rateColor(s.rate)} />
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Personel satırları (müdür hariç) */}
              {storeUsers.length === 0 ? (
                <tr>
                  <td colSpan={kpiDefs.length + 1} className="px-5 py-8 text-center text-sm text-brand-gray">
                    Bu mağazada personel bulunamadı.
                  </td>
                </tr>
              ) : storeUsers.map(u => (
                <tr key={u.userId} className="hover:bg-brand-lightGray/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {u.fullName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-brand-black text-xs">{u.fullName}</p>
                        <p className="text-xs text-brand-gray">{u.role.roleName}</p>
                      </div>
                    </div>
                  </td>
                  {kpiDefs.map(k => {
                    const goal   = goals.find(g => g.userId === u.userId && g.kpiId === k.kpiId);
                    const actual = actuals
                      .filter(a => a.userId === u.userId && a.kpiId === k.kpiId)
                      .reduce((s, a) => s + parseFloat(a.actualValue), 0);
                    const target = goal ? parseFloat(goal.targetValue) : 0;
                    const rate   = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
                    const cfg    = KPI_CONFIG[k.kpiId];
                    return (
                      <td key={k.kpiId} className="px-4 py-3 text-center">
                        {target > 0 || actual > 0 ? (
                          <div className="min-w-[80px]">
                            <p className={`font-bold text-xs ${rateText(rate)}`}>
                              {cfg ? cfg.format(actual, k.unit) : actual.toLocaleString('tr-TR')}
                            </p>
                            {target > 0 && (
                              <>
                                <p className="text-xs text-brand-gray/70">
                                  / {cfg ? cfg.format(target, k.unit) : target.toLocaleString('tr-TR')}
                                </p>
                                <div className="mt-1">
                                  <ProgressBar value={rate} showPercent={false} height="h-1" color={rateColor(rate)} />
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-brand-gray/40">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── 12 Aylık Karşılaştırma Grafiği (Personel vs Mağaza Ortalaması) ──────────

function YearlyComparisonSection({ yearlyPerf, kpiDefs, visibleKpiIds }: {
  yearlyPerf: YearlyPerf; kpiDefs: KpiDef[]; visibleKpiIds: number[];
}) {
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(null);
  const effectiveId = selectedKpiId ?? visibleKpiIds[0] ?? null;
  if (!effectiveId) return null;

  const kpi     = kpiDefs.find(k => k.kpiId === effectiveId);
  const kpiData = (yearlyPerf.yearly[effectiveId] ?? []).map(d => ({
    month: d.month, personal: d.personal, storeAvg: d.storeAvg,
  }));

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h3 className="font-bold text-brand-black">📈 12 Aylık Gelişim Karşılaştırması</h3>
          <p className="text-xs text-brand-gray mt-0.5">Bireysel performansınız ve mağaza personel ortalaması</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleKpiIds.map(id => {
            const k = kpiDefs.find(k => k.kpiId === id);
            if (!k) return null;
            const c = KPI_CONFIG[id];
            return (
              <button
                key={id}
                onClick={() => setSelectedKpiId(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  id === effectiveId
                    ? 'border-brand-red bg-brand-red text-white shadow-sm'
                    : 'border-brand-border bg-brand-lightGray text-brand-gray hover:bg-white hover:border-brand-red/30'
                }`}
              >
                <span>{c?.icon ?? '📊'}</span> {k.kpiName}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-5 mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-brand-red rounded-full" />
          <span className="text-xs font-semibold text-brand-black">Benim Verim</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 border-t-2 border-dashed border-brand-gray" />
          <span className="text-xs text-brand-gray">Mağaza Ortalaması</span>
        </div>
      </div>

      <ComparisonChart data={kpiData} unit={kpi?.unit ?? undefined} height={260} />
    </div>
  );
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-brand-border p-5 animate-pulse h-36" />
      ))}
    </div>
  );
}

// ─── Admin Görünümü ───────────────────────────────────────────────────────────

function AdminView({ data, selectedStoreId, month, kpiDefs, refetch }: {
  data: any; selectedStoreId: number | null; month: number; kpiDefs: KpiDef[]; refetch?: () => void;
}) {
  if (!data) return <EmptyState />;

  // Tek mağaza seçildiğinde: storeSummary + storeUsers + goals + actuals
  if (selectedStoreId) {
    const summary: StoreSummaryItem[] = data.storeSummary ?? [];
    const storeUsers: StoreUser[] = data.storeUsers ?? [];
    const goals: Goal[] = data.goals ?? [];
    const actuals: Actual[] = data.actuals ?? [];
    const items = summary.filter(s => s.totalTarget > 0 || s.totalActual > 0);

    return (
      <div className="space-y-6">
        {/* KPI Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {items.map(s => {
            const cfg = KPI_CONFIG[s.kpi.kpiId] ?? { icon: '📊', color: '#D42B2B', format: (v: number) => String(v) };
            return <KpiCard key={s.kpi.kpiId} icon={cfg.icon} name={s.kpi.kpiName} unit={s.kpi.unit} target={s.totalTarget} actual={s.totalActual} rate={s.rate} color={cfg.color} format={cfg.format} />;
          })}
        </div>
        {/* Personel Tablosu */}
        <AdminStoreTable storeUsers={storeUsers} goals={goals} actuals={actuals} kpiDefs={kpiDefs} summary={summary} refetch={refetch} />
      </div>
    );
  }

  // Tüm Mağazalar: chainSummary + perStore
  const chainSummary: StoreSummaryItem[] = data.chainSummary ?? [];
  const perStore: { storeId: number; storeName: string; staffCount: number; storeSummary: StoreSummaryItem[]; overallRate: number }[] = data.perStore ?? [];
  const chainItems = chainSummary.filter(s => s.totalTarget > 0 || s.totalActual > 0);

  return (
    <div className="space-y-6">
      {/* Zincir Toplam KPI Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {chainItems.map(s => {
          const cfg = KPI_CONFIG[s.kpi.kpiId] ?? { icon: '📊', color: '#D42B2B', format: (v: number) => String(v) };
          return <KpiCard key={s.kpi.kpiId} icon={cfg.icon} name={s.kpi.kpiName} unit={s.kpi.unit} target={s.totalTarget} actual={s.totalActual} rate={s.rate} color={cfg.color} format={cfg.format} />;
        })}
      </div>
      {/* Mağaza Bazlı Özet Tablosu */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-border">
          <h3 className="font-bold text-brand-black">🏪 Mağaza Performans Sıralaması</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-lightGray">
                <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray">Mağaza</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-brand-gray">Personel</th>
                {kpiDefs.map(k => (
                  <th key={k.kpiId} className="text-center px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">
                    {KPI_CONFIG[k.kpiId]?.icon} {k.kpiName}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-semibold text-brand-gray">Başarı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {perStore.sort((a, b) => b.overallRate - a.overallRate).map(store => (
                <tr key={store.storeId} className="hover:bg-brand-lightGray/50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-brand-black text-xs">{store.storeName}</p>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-brand-gray">{store.staffCount}</td>
                  {kpiDefs.map(k => {
                    const s = store.storeSummary.find(ss => ss.kpi.kpiId === k.kpiId);
                    const cfg = KPI_CONFIG[k.kpiId];
                    if (!s || (s.totalTarget === 0 && s.totalActual === 0)) {
                      return <td key={k.kpiId} className="px-4 py-3 text-center"><span className="text-xs text-brand-gray/40">—</span></td>;
                    }
                    return (
                      <td key={k.kpiId} className="px-4 py-3 text-center">
                        <div className="min-w-[80px]">
                          <p className={`font-bold text-xs ${rateText(s.rate)}`}>
                            {cfg ? cfg.format(s.totalActual, k.unit) : s.totalActual.toLocaleString('tr-TR')}
                          </p>
                          {s.totalTarget > 0 && (
                            <>
                              <p className="text-xs text-brand-gray/70">/ {cfg ? cfg.format(s.totalTarget, k.unit) : s.totalTarget.toLocaleString('tr-TR')}</p>
                              <div className="mt-1"><ProgressBar value={s.rate} showPercent={false} height="h-1" color={rateColor(s.rate)} /></div>
                            </>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${rateText(store.overallRate)}`}>%{store.overallRate}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Admin: Tek Mağaza Personel Tablosu ───────────────────────────────────────

function AdminStoreTable({ storeUsers, goals, actuals, kpiDefs, summary, refetch }: {
  storeUsers: StoreUser[]; goals: Goal[]; actuals: Actual[]; kpiDefs: KpiDef[];
  summary: StoreSummaryItem[]; refetch?: () => void;
}) {
  const [promoUser,    setPromoUser]    = useState<StaffBasic | null>(null);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-brand-border">
        <h3 className="font-bold text-brand-black">👥 Ekip Performans Tablosu</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-lightGray">
              <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray">Personel</th>
              {kpiDefs.map(k => (
                <th key={k.kpiId} className="text-center px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">
                  {KPI_CONFIG[k.kpiId]?.icon} {k.kpiName}
                </th>
              ))}
              <th className="px-4 py-3 text-xs font-semibold text-brand-gray text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {/* Mağaza toplam satırı */}
            <tr className="bg-brand-red/5 border-b-2 border-brand-red/20">
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">🏪</div>
                  <div>
                    <p className="font-bold text-brand-black text-xs">Mağaza Genel Performansı</p>
                    <p className="text-[10px] text-brand-red">Tüm ekip toplamı</p>
                  </div>
                </div>
              </td>
              {kpiDefs.map(k => {
                const s = summary.find(ss => ss.kpi.kpiId === k.kpiId);
                const cfg = KPI_CONFIG[k.kpiId];
                if (!s || (s.totalTarget === 0 && s.totalActual === 0)) return <td key={k.kpiId} className="px-4 py-3 text-center"><span className="text-xs text-brand-gray/40">—</span></td>;
                return (
                  <td key={k.kpiId} className="px-4 py-3 text-center">
                    <div className="min-w-[80px]">
                      <p className={`font-bold text-xs ${rateText(s.rate)}`}>{cfg ? cfg.format(s.totalActual, k.unit) : s.totalActual.toLocaleString('tr-TR')}</p>
                      {s.totalTarget > 0 && (
                        <>
                          <p className="text-xs text-brand-gray/70">/ {cfg ? cfg.format(s.totalTarget, k.unit) : s.totalTarget.toLocaleString('tr-TR')}</p>
                          <div className="mt-1"><ProgressBar value={s.rate} showPercent={false} height="h-1" color={rateColor(s.rate)} /></div>
                        </>
                      )}
                    </div>
                  </td>
                );
              })}
              <td className="px-4 py-3" />
            </tr>
            {/* Personel satırları */}
            {storeUsers.length === 0 ? (
              <tr><td colSpan={kpiDefs.length + 2} className="px-5 py-8 text-center text-sm text-brand-gray">Bu mağazada personel bulunamadı.</td></tr>
            ) : storeUsers.map(u => (
              <tr key={u.userId} className="hover:bg-brand-lightGray/50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">{u.fullName.charAt(0)}</div>
                    <div>
                      <p className="font-semibold text-brand-black text-xs">{u.fullName}</p>
                      <p className="text-xs text-brand-gray">{u.role.roleName}</p>
                    </div>
                  </div>
                </td>
                {kpiDefs.map(k => {
                  const goal = goals.find(g => g.userId === u.userId && g.kpiId === k.kpiId);
                  const actual = actuals.filter(a => a.userId === u.userId && a.kpiId === k.kpiId).reduce((s, a) => s + parseFloat(a.actualValue), 0);
                  const target = goal ? parseFloat(goal.targetValue) : 0;
                  const rate = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
                  const cfg = KPI_CONFIG[k.kpiId];
                  return (
                    <td key={k.kpiId} className="px-4 py-3 text-center">
                      {target > 0 || actual > 0 ? (
                        <div className="min-w-[80px]">
                          <p className={`font-bold text-xs ${rateText(rate)}`}>{cfg ? cfg.format(actual, k.unit) : actual.toLocaleString('tr-TR')}</p>
                          {target > 0 && (
                            <>
                              <p className="text-xs text-brand-gray/70">/ {cfg ? cfg.format(target, k.unit) : target.toLocaleString('tr-TR')}</p>
                              <div className="mt-1"><ProgressBar value={rate} showPercent={false} height="h-1" color={rateColor(rate)} /></div>
                            </>
                          )}
                        </div>
                      ) : <span className="text-xs text-brand-gray/40">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                  <ActionMenu
                    isOpen={actionMenuId === u.userId}
                    onToggle={() => setActionMenuId(actionMenuId === u.userId ? null : u.userId)}
                    onPromote={() => { setPromoUser({ userId: u.userId, fullName: u.fullName, role: u.role.roleName }); setActionMenuId(null); }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {promoUser && (
        <PromotionModal
          staff={promoUser}
          onClose={() => setPromoUser(null)}
          onSuccess={() => { setPromoUser(null); refetch?.(); }}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <span className="text-5xl block mb-3">📊</span>
      <p className="font-bold text-brand-black">Bu ay için veri bulunamadı</p>
      <p className="text-sm text-brand-gray mt-1">Farklı bir ay seçin veya müdürünüzden hedef atanmasını bekleyin.</p>
    </div>
  );
}
