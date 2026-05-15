import { useState } from 'react';
import { useApi } from '../hooks/useApi';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface StoreOption {
  storeId:   number;
  storeName: string;
  location:  string | null;
}

interface KpiDef {
  kpiId:   number;
  kpiName: string;
  unit:    string | null;
}

interface SummaryItem {
  kpi:         KpiDef;
  totalTarget: number;
  totalActual: number;
  rate:        number;
}

interface StoreUser {
  userId:   number;
  fullName: string;
  role:     { roleName: string; roleId: number };
}

interface Goal {
  goalId:      number;
  userId:      number;
  kpiId:       number;
  targetValue: number;
  kpi:         KpiDef;
  user:        { fullName: string; role: { roleName: string } };
}

interface Actual {
  actualId:    number;
  userId:      number;
  kpiId:       number;
  actualValue: number;
  recordDate:  string;
  kpi:         KpiDef;
  user:        { fullName: string };
}

interface SingleStoreData {
  storeUsers:   StoreUser[];
  goals:        Goal[];
  actuals:      Actual[];
  storeSummary: SummaryItem[];
}

interface PerStoreRow {
  storeId:      number;
  storeName:    string;
  staffCount:   number;
  storeSummary: SummaryItem[];
  overallRate:  number;
}

interface ChainData {
  chainSummary: SummaryItem[];
  perStore:     PerStoreRow[];
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function formatVal(actual: number, unit: string | null): string {
  if (unit === '%') return `%${Number(actual).toFixed(1)}`;
  if (unit === 'TL') return actual.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 });
  return actual.toLocaleString('tr-TR');
}

const KPI_ICONS: Record<string, string> = {
  'Ciro':               '💰',
  'Satış Adedi':        '🛒',
  'Fatura Sayısı':      '🧾',
  'MDO':                '⭐',
  'Tekli Fatura Oranı': '📑',
};

function getKpiIcon(name: string): string {
  for (const [key, icon] of Object.entries(KPI_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return '📊';
}

const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

// ─── Admin Sayfası ────────────────────────────────────────────────────────────

export default function AdminPage() {
  const now = new Date();
  const [month, setMonth]     = useState(now.getMonth() + 1);
  const [year, setYear]       = useState(now.getFullYear());
  const [selectedStore, setSelectedStore] = useState<number | null>(null);

  const { data: stores } = useApi<StoreOption[]>('/performance/stores-list');

  const adminParams: Record<string, string | number> = { month, year };
  if (selectedStore) adminParams.storeId = selectedStore;

  const { data: adminData, loading, error } = useApi<SingleStoreData | ChainData>(
    '/performance/admin',
    adminParams
  );

  const isChain = !selectedStore;
  const chainData = isChain ? (adminData as ChainData | null) : null;
  const storeData = !isChain ? (adminData as SingleStoreData | null) : null;

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-8">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-brand-black tracking-tight">
          🏢 Merkezi Yönetim Paneli
        </h1>
        <p className="text-sm text-brand-gray font-medium mt-1">
          Tüm Sporthink zincirini izleyin veya tek bir mağazayı seçin.
        </p>
      </div>

      {/* Filtreler */}
      <div className="bg-white border border-brand-border rounded-xl p-4 flex flex-wrap gap-3 shadow-sm">
        {/* Mağaza Seçimi */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-1.5">Mağaza</label>
          <select
            value={selectedStore ?? ''}
            onChange={e => setSelectedStore(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm font-bold text-brand-black bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            <option value="">🌐 Tüm Mağazalar</option>
            {(stores ?? []).map(s => (
              <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
            ))}
          </select>
        </div>

        {/* Ay Seçimi */}
        <div className="w-36">
          <label className="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-1.5">Ay</label>
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm font-bold text-brand-black bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        {/* Yıl Seçimi */}
        <div className="w-28">
          <label className="block text-[10px] font-black uppercase tracking-widest text-brand-gray mb-1.5">Yıl</label>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm font-bold text-brand-black bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-bold">Veri yüklenemedi</p>
            <p className="mt-1 text-red-600">{error}</p>
          </div>
        </div>
      ) : isChain ? (
        <ChainView data={chainData} />
      ) : (
        <StoreView data={storeData} storeName={(stores ?? []).find(s => s.storeId === selectedStore)?.storeName ?? ''} />
      )}
    </div>
  );
}

// ─── Tüm Mağazalar Görünümü ───────────────────────────────────────────────────

function ChainView({ data }: { data: ChainData | null }) {
  if (!data) return <EmptyState />;
  const chainSummary = data.chainSummary ?? [];
  const perStore     = data.perStore     ?? [];

  const mainKpi = chainSummary.find(s =>
    s.kpi.kpiName.toLowerCase().includes('ciro')
  ) ?? chainSummary[0] ?? null;

  return (
    <>
      {/* Zincir Banner */}
      {mainKpi && (
        <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-xl p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Zincir Geneli — {mainKpi.kpi.kpiName}</p>
              <p className="text-3xl font-black mt-2">
                {formatVal(mainKpi.totalActual, mainKpi.kpi.unit)}
              </p>
              {mainKpi.totalTarget > 0 && (
                <p className="text-sm text-white/60 mt-1">
                  Hedef: {formatVal(mainKpi.totalTarget, mainKpi.kpi.unit)}
                </p>
              )}
            </div>
            <RateCircle rate={Math.round(mainKpi.rate)} />
          </div>
        </div>
      )}

      {/* KPI Kartları */}
      {chainSummary.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {chainSummary.map((item, i) => (
            <KPICard
              key={item.kpi.kpiId}
              icon={getKpiIcon(item.kpi.kpiName)}
              label={item.kpi.kpiName}
              value={formatVal(item.totalActual, item.kpi.unit)}
              rate={Math.round(item.rate)}
              accent={i === 0}
            />
          ))}
        </div>
      )}

      {/* Mağaza Bazlı Tablo */}
      <div className="bg-white rounded-xl border border-brand-border shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border">
          <h2 className="text-base font-black text-brand-black">Mağaza Bazlı Özet</h2>
          <p className="text-xs text-brand-gray font-medium mt-0.5">{perStore.length} mağaza listeleniyor</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-lightGray border-b border-brand-border">
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-wider text-brand-gray">Mağaza</th>
                <th className="text-center px-4 py-3 text-xs font-black uppercase tracking-wider text-brand-gray">Personel</th>
                {perStore[0]?.storeSummary.map(s => (
                  <th key={s.kpi.kpiId} className="text-right px-4 py-3 text-xs font-black uppercase tracking-wider text-brand-gray whitespace-nowrap">
                    {getKpiIcon(s.kpi.kpiName)} {s.kpi.kpiName}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-black uppercase tracking-wider text-brand-gray">Oran</th>
              </tr>
            </thead>
            <tbody>
              {perStore.map((store, idx) => (
                <tr key={store.storeId} className={`border-b border-brand-border/50 ${idx % 2 === 0 ? '' : 'bg-brand-lightGray/40'}`}>
                  <td className="px-5 py-3 font-bold text-brand-black">{store.storeName}</td>
                  <td className="px-4 py-3 text-center text-brand-gray font-medium">{store.staffCount}</td>
                  {store.storeSummary.map(s => (
                    <td key={s.kpi.kpiId} className="px-4 py-3 text-right font-bold text-brand-black tabular-nums">
                      {formatVal(s.totalActual, s.kpi.unit)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                      store.overallRate >= 100 ? 'bg-green-100 text-green-700'
                      : store.overallRate >= 75  ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-brand-red'
                    }`}>
                      %{store.overallRate}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {perStore.length === 0 && (
            <div className="text-center py-10 text-brand-gray text-sm">Bu dönem için veri bulunamadı.</div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Tek Mağaza Görünümü ──────────────────────────────────────────────────────

function StoreView({ data, storeName }: { data: SingleStoreData | null; storeName: string }) {
  if (!data) return <EmptyState />;
  const storeUsers   = data.storeUsers   ?? [];
  const goals        = data.goals        ?? [];
  const actuals      = data.actuals      ?? [];
  const storeSummary = data.storeSummary ?? [];

  const mainKpi = storeSummary.find(s =>
    s.kpi.kpiName.toLowerCase().includes('ciro')
  ) ?? storeSummary[0] ?? null;

  return (
    <>
      {/* Mağaza Banner */}
      {mainKpi && (
        <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-xl p-6 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-bold text-white/70 uppercase tracking-widest">🏪 {storeName}</p>
              <p className="text-3xl font-black mt-2">{formatVal(mainKpi.totalActual, mainKpi.kpi.unit)}</p>
              {mainKpi.totalTarget > 0 && (
                <p className="text-sm text-white/60 mt-1">Hedef: {formatVal(mainKpi.totalTarget, mainKpi.kpi.unit)}</p>
              )}
            </div>
            <RateCircle rate={Math.round(mainKpi.rate)} />
          </div>
        </div>
      )}

      {/* KPI Kartları */}
      {storeSummary.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {storeSummary.map((item, i) => (
            <KPICard
              key={item.kpi.kpiId}
              icon={getKpiIcon(item.kpi.kpiName)}
              label={item.kpi.kpiName}
              value={formatVal(item.totalActual, item.kpi.unit)}
              rate={Math.round(item.rate)}
              accent={i === 0}
            />
          ))}
        </div>
      )}

      {/* Personel Performans Tablosu */}
      <div className="bg-white rounded-xl border border-brand-border shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-border">
          <h2 className="text-base font-black text-brand-black">Personel Performansı</h2>
          <p className="text-xs text-brand-gray font-medium mt-0.5">{storeUsers.length} personel listeleniyor</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-lightGray border-b border-brand-border">
                <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-wider text-brand-gray">Personel</th>
                {storeSummary.map(s => (
                  <th key={s.kpi.kpiId} className="text-right px-4 py-3 text-xs font-black uppercase tracking-wider text-brand-gray whitespace-nowrap">
                    {getKpiIcon(s.kpi.kpiName)} {s.kpi.kpiName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Mağaza Geneli Satırı */}
              <tr className="border-b border-brand-border bg-red-50/60">
                <td className="px-5 py-3 font-black text-brand-red">🏪 Mağaza Genel</td>
                {storeSummary.map(s => (
                  <td key={s.kpi.kpiId} className="px-4 py-3 text-right font-black text-brand-red tabular-nums">
                    {formatVal(s.totalActual, s.kpi.unit)}
                    {s.totalTarget > 0 && (
                      <span className="block text-[10px] font-bold text-brand-gray">
                        / {formatVal(s.totalTarget, s.kpi.unit)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>

              {storeUsers.map((u, idx) => {
                const userGoals   = goals  .filter(g => g.userId === u.userId);
                const userActuals = actuals.filter(a => a.userId === u.userId);
                return (
                  <tr key={u.userId} className={`border-b border-brand-border/50 ${idx % 2 === 0 ? '' : 'bg-brand-lightGray/30'}`}>
                    <td className="px-5 py-3">
                      <p className="font-bold text-brand-black">{u.fullName}</p>
                      <p className="text-[11px] text-brand-gray font-medium">{u.role.roleName}</p>
                    </td>
                    {storeSummary.map(s => {
                      const target = userGoals  .find(g => g.kpiId === s.kpi.kpiId)?.targetValue ?? null;
                      const actual = userActuals.filter(a => a.kpiId === s.kpi.kpiId).reduce((sum, a) => sum + Number(a.actualValue), 0);
                      return (
                        <td key={s.kpi.kpiId} className="px-4 py-3 text-right tabular-nums">
                          <span className="font-bold text-brand-black">{formatVal(actual, s.kpi.unit)}</span>
                          {target !== null && (
                            <span className="block text-[10px] font-bold text-brand-gray">
                              / {formatVal(Number(target), s.kpi.unit)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {storeUsers.length === 0 && (
                <tr>
                  <td colSpan={storeSummary.length + 1} className="text-center py-10 text-brand-gray text-sm">
                    Bu mağazada personel bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Alt Bileşenler ───────────────────────────────────────────────────────────

function RateCircle({ rate }: { rate: number }) {
  const clamped = Math.min(rate, 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${clamped * 2.64} ${264 - clamped * 2.64}`}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black text-white">%{rate}</span>
        </div>
      </div>
      <p className="text-xs text-white/60 mt-2 font-bold uppercase tracking-wider">Gerçekleşme</p>
    </div>
  );
}

function KPICard({ icon, label, value, rate, accent }: {
  icon: string;
  label: string;
  value: string;
  rate: number;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 border transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${
      accent
        ? 'bg-brand-red text-white border-brand-red shadow-[0_8px_30px_rgb(179,0,0,0.15)]'
        : 'bg-white text-brand-black border-brand-border shadow-md'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${
        accent ? 'bg-white/20' : 'bg-brand-lightGray'
      }`}>
        {icon}
      </div>
      <p className={`text-2xl font-black tabular-nums tracking-tight ${accent ? 'text-white' : 'text-brand-black'}`}>
        {value}
      </p>
      <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${accent ? 'text-white/70' : 'text-brand-gray'}`}>
        {label}
      </p>
      {rate > 0 && (
        <p className={`text-xs font-black mt-2 ${accent ? 'text-white/80' : 'text-brand-gray'}`}>
          %{rate} gerçekleşme
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-700 flex items-start gap-3">
      <span className="text-xl">ℹ️</span>
      <div>
        <p className="font-bold">Veri bulunamadı</p>
        <p className="mt-1 text-amber-600">Seçilen dönem için performans verisi bulunmuyor.</p>
      </div>
    </div>
  );
}
