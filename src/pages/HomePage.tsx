import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import ProgressBar from '../components/ui/ProgressBar';
import TrainingVsSalesChart from '../components/charts/TrainingVsSalesChart';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface TeamMember {
  userId:      number;
  fullName:    string;
  role:        string;
  overallRate: number;
  courses:     {
    courseId:       number;
    title:         string;
    isMandatory:   boolean;
    completionRate: number;
    status:        string;
    lastQuizScore:  number | null;
    lastQuizTotal:  number | null;
    lastQuizPassed: boolean | null;
  }[];
}

interface KpiDef {
  kpiId:   number;
  kpiName: string;
  unit:    string;
}

interface StoreSummaryItem {
  kpi:         KpiDef;
  totalTarget: number;
  totalActual: number;
  rate:        number;
}

interface StorePerformance {
  storeSummary: StoreSummaryItem[];
}

interface PersonalPerformance {
  goals:   { kpiId: number; targetValue: number; kpi: KpiDef }[];
  actuals: { kpiId: number; actualValue: number; kpi: KpiDef }[];
}

interface CourseAssignment {
  assignmentId: number;
  courseId:      number;
  isMandatory:  boolean;
  course:       { title: string };
  progress:     { completionRate: number; status: string } | null;
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, isManager, isRegionalManager, isAdmin } = useAuth();
  const isManagerRole = isManager || isRegionalManager;

  const subtitle = isAdmin
    ? 'Tüm Sporthink zincirini yönetin.'
    : isManagerRole
      ? 'Mağazanızın güncel performans ve eğitim durumuna göz atın.'
      : 'Kişisel performans ve eğitim durumunuza göz atın.';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-brand-black tracking-tight">
          {user?.fullName?.split(' ')[0]}
        </h1>
        <p className="text-sm lg:text-base text-brand-gray font-medium mt-1">{subtitle}</p>
      </div>

      {isAdmin ? <AdminHomeView /> : isManagerRole ? <ManagerView /> : <StaffView />}
    </div>
  );
}

// ─── KPI eşleştirme yardımcıları ─────────────────────────────────────────────

function findKpi(summary: StoreSummaryItem[], keywords: string[]) {
  return summary.find(s =>
    keywords.some(k => s.kpi.kpiName.toLowerCase().includes(k.toLowerCase()))
  );
}

function fmtVal(val: number, unit: string | null): string {
  if (!unit) return val.toLocaleString('tr-TR');
  if (unit === 'TL') return val.toLocaleString('tr-TR') + ' ₺';
  if (unit === '%')  return '%' + val.toFixed(1);
  return val.toLocaleString('tr-TR') + ' ' + unit;
}

function rateColor(rate: number) {
  if (rate >= 100) return 'text-green-600';
  if (rate >= 70)  return 'text-amber-600';
  return 'text-brand-red';
}

function rateBg(rate: number) {
  if (rate >= 100) return 'bg-green-500';
  if (rate >= 70)  return 'bg-amber-400';
  return 'bg-brand-red';
}

// ─── Admin Görünümü ───────────────────────────────────────────────────────────

interface ChainSummaryItem {
  kpi:         KpiDef;
  totalTarget: number;
  totalActual: number;
  rate:        number;
}

interface ChainData {
  chainSummary: ChainSummaryItem[];
  perStore:     { storeId: number; storeName: string; staffCount: number; overallRate: number }[];
}

interface TrainingStats { total: number; completed: number; rate: number }

function AdminHomeView() {
  const now = new Date();
  const { data, loading } = useApi<ChainData>(
    '/performance/admin',
    { month: now.getMonth() + 1, year: now.getFullYear() }
  );
  const { data: trainStats } = useApi<TrainingStats>('/team/training-stats');

  const summary   = data?.chainSummary ?? [];
  const stores    = data?.perStore     ?? [];
  const topStores = stores.slice().sort((a, b) => b.overallRate - a.overallRate).slice(0, 5);

  const ciro      = findKpi(summary, ['ciro']);
  const satis     = findKpi(summary, ['satış adedi', 'satış']);
  const fatura    = findKpi(summary, ['fatura sayısı', 'fatura']);
  const upt       = findKpi(summary, ['upt']);
  const mdo       = findKpi(summary, ['mdo', 'müşteri dönüşüm']);
  const tekli     = findKpi(summary, ['tekli fatura', 'tekli']);

  const overallRate = summary.length > 0
    ? Math.round(summary.filter(s => s.totalTarget > 0).reduce((acc, s) => acc + Math.min(s.rate, 100), 0) / Math.max(1, summary.filter(s => s.totalTarget > 0).length))
    : 0;

  return (
    <>
      {/* Banner */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-xl p-5 lg:p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">
              Zincir Geneli — {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
            </p>
            <p className="text-2xl font-black mt-1">{stores.length} Aktif Mağaza</p>
            <p className="text-sm text-white/60 mt-0.5">Genel hedef başarısı: %{overallRate}</p>
          </div>
          <Link
            to="/performance"
            className="inline-flex items-center gap-2 bg-white text-brand-red font-black text-sm px-5 py-3 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 shrink-0"
          >
            Tam Analiz →
          </Link>
        </div>
      </div>

      {/* KPI Kartları */}
      {loading ? (
        <KpiCardSkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Toplam Hedef Ciro"     value={ciro ? fmtVal(ciro.totalTarget, ciro.kpi.unit) : '—'} sub="hedef" />
          <StatCard label="Ciro"                  value={ciro ? fmtVal(ciro.totalActual, ciro.kpi.unit) : '—'} rate={ciro?.rate} sub="gerçekleşen" />
          <StatCard label="Hedef Gerçekleşen"     value={ciro ? `%${Math.round(ciro.rate)}` : '—'} rate={ciro?.rate} highlight />
          <StatCard label="Satış Adedi"           value={satis ? fmtVal(satis.totalActual, satis.kpi.unit) : '—'} rate={satis?.rate} />
          <StatCard label="Fatura Sayısı"         value={fatura ? fmtVal(fatura.totalActual, fatura.kpi.unit) : '—'} rate={fatura?.rate} />
          <StatCard label="Ort. Hedef UPT"        value={upt ? fmtVal(upt.totalTarget, upt.kpi.unit) : '—'} sub="hedef" />
          <StatCard label="UPT"                   value={upt ? fmtVal(upt.totalActual, upt.kpi.unit) : '—'} rate={upt?.rate} />
          <StatCard label="MDO"                   value={mdo ? fmtVal(mdo.totalActual, mdo.kpi.unit) : '—'} rate={mdo?.rate} />
          <StatCard label="Tekli Fatura Oranı"    value={tekli ? fmtVal(tekli.totalActual, tekli.kpi.unit) : '—'} rate={tekli?.rate} />
          <StatCard label="Eğitim Tamamlanma"     value={trainStats ? `%${trainStats.rate}` : '—'} rate={trainStats?.rate} sub={trainStats ? `${trainStats.completed}/${trainStats.total}` : undefined} />
        </div>
      )}

      {/* Mağaza Sıralaması */}
      {topStores.length > 0 && (
        <div className="bg-white rounded-xl border border-brand-border shadow-md p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-brand-black">Mağaza Performans Sıralaması</h2>
            <Link to="/performance" className="text-xs font-black text-brand-red hover:underline">
              Tümünü Gör →
            </Link>
          </div>
          <div className="space-y-3">
            {topStores.map((store, idx) => (
              <div key={store.storeId} className="flex items-center gap-4">
                <span className={`w-5 text-sm font-black text-center shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-brand-gray'}`}>
                  {idx + 1}
                </span>
                <div className="w-40 shrink-0">
                  <p className="text-sm font-bold text-brand-black truncate">{store.storeName}</p>
                  <p className="text-[11px] text-brand-gray">{store.staffCount} personel</p>
                </div>
                <div className="flex-1">
                  <ProgressBar value={Math.min(store.overallRate, 100)} height="h-2" showPercent={false} color={rateBg(store.overallRate)} />
                </div>
                <span className={`text-sm font-black w-10 text-right ${rateColor(store.overallRate)}`}>
                  %{store.overallRate}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TrainingVsSalesChart month={now.getMonth() + 1} year={now.getFullYear()} />
    </>
  );
}

const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

// ─── Yönetici Görünümü ────────────────────────────────────────────────────────

function ManagerView() {
  const now = new Date();
  const { data: storePerf, loading: perfLoading } = useApi<StorePerformance>(
    '/performance/store',
    { month: now.getMonth() + 1, year: now.getFullYear() }
  );
  const { data: teamData, loading: teamLoading } = useApi<TeamMember[]>('/team/progress');
  const { data: trainStats } = useApi<TrainingStats>('/team/training-stats');

  const storeSummary = storePerf?.storeSummary ?? [];
  const team         = teamData ?? [];

  const ciro      = findKpi(storeSummary, ['ciro']);
  const satis     = findKpi(storeSummary, ['satış adedi', 'satış']);
  const fatura    = findKpi(storeSummary, ['fatura sayısı', 'fatura']);
  const upt       = findKpi(storeSummary, ['upt']);
  const mdo       = findKpi(storeSummary, ['mdo', 'müşteri dönüşüm']);
  const tekli     = findKpi(storeSummary, ['tekli fatura', 'tekli']);

  return (
    <>
      {/* Banner */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-xl p-5 lg:p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">
              Mağaza Performansı — {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
            </p>
            <p className="text-2xl font-black mt-1">
              {ciro ? fmtVal(ciro.totalActual, ciro.kpi.unit) : '—'}
            </p>
            {ciro && ciro.totalTarget > 0 && (
              <p className="text-sm text-white/60 mt-0.5">Hedef: {fmtVal(ciro.totalTarget, ciro.kpi.unit)}</p>
            )}
          </div>
          <Link
            to="/performance"
            className="inline-flex items-center gap-2 bg-white text-brand-red font-black text-sm px-5 py-3 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 shrink-0"
          >
            Detaylı Analiz →
          </Link>
        </div>
      </div>

      {/* KPI Kartları */}
      {perfLoading ? (
        <KpiCardSkeleton />
      ) : storeSummary.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700 flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="font-bold">Performans verisi bulunamadı</p>
            <p className="mt-1 text-amber-600">Bu ay için henüz KPI hedefi veya gerçekleşme girişi yapılmamış.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Toplam Hedef Ciro"     value={ciro ? fmtVal(ciro.totalTarget, ciro.kpi.unit) : '—'} sub="hedef" />
          <StatCard label="Ciro"                  value={ciro ? fmtVal(ciro.totalActual, ciro.kpi.unit) : '—'} rate={ciro?.rate} sub="gerçekleşen" />
          <StatCard label="Hedef Gerçekleşen"     value={ciro ? `%${Math.round(ciro.rate)}` : '—'} rate={ciro?.rate} highlight />
          <StatCard label="Satış Adedi"           value={satis ? fmtVal(satis.totalActual, satis.kpi.unit) : '—'} rate={satis?.rate} />
          <StatCard label="Fatura Sayısı"         value={fatura ? fmtVal(fatura.totalActual, fatura.kpi.unit) : '—'} rate={fatura?.rate} />
          <StatCard label="Ort. Hedef UPT"        value={upt ? fmtVal(upt.totalTarget, upt.kpi.unit) : '—'} sub="hedef" />
          <StatCard label="UPT"                   value={upt ? fmtVal(upt.totalActual, upt.kpi.unit) : '—'} rate={upt?.rate} />
          <StatCard label="MDO"                   value={mdo ? fmtVal(mdo.totalActual, mdo.kpi.unit) : '—'} rate={mdo?.rate} />
          <StatCard label="Tekli Fatura Oranı"    value={tekli ? fmtVal(tekli.totalActual, tekli.kpi.unit) : '—'} rate={tekli?.rate} />
          <StatCard label="Eğitim Tamamlanma"     value={trainStats ? `%${trainStats.rate}` : '—'} rate={trainStats?.rate} sub={trainStats ? `${trainStats.completed}/${trainStats.total}` : undefined} />
        </div>
      )}

      {/* Ekip Eğitim Takibi */}
      <div className="bg-white rounded-xl border border-brand-border shadow-md p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-black text-brand-black">Ekip Eğitim Durumu</h2>
          {team.length > 0 && (
            <span className="text-xs text-brand-gray">
              {team.filter(m => m.overallRate === 100).length} / {team.length} tamamladı
            </span>
          )}
        </div>
        {teamLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : team.length === 0 ? (
          <p className="text-center py-8 text-sm text-brand-gray">Mağazada eğitim verisi bulunamadı.</p>
        ) : (
          <div className="space-y-3">
            {team.map(member => (
              <div key={member.userId} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-brand-red flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {member.fullName.charAt(0)}
                </div>
                <div className="w-32 shrink-0">
                  <p className="text-xs font-bold text-brand-black truncate">{member.fullName}</p>
                  <p className="text-[10px] text-brand-gray">{member.role}</p>
                </div>
                <div className="flex-1">
                  <ProgressBar value={member.overallRate} height="h-2" showPercent={false}
                    color={member.overallRate === 100 ? 'bg-green-500' : member.overallRate >= 50 ? 'bg-amber-400' : 'bg-brand-red'} />
                </div>
                <span className={`text-xs font-black w-10 text-right ${rateColor(member.overallRate)}`}>
                  %{member.overallRate}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <TrainingVsSalesChart month={now.getMonth() + 1} year={now.getFullYear()} />
    </>
  );
}

// ─── Personel Görünümü ────────────────────────────────────────────────────────

function StaffView() {
  const now = new Date();
  const { data: perfData, loading: perfLoading } = useApi<PersonalPerformance>(
    '/performance/my',
    { month: now.getMonth() + 1, year: now.getFullYear() }
  );
  const { data: coursesData, loading: coursesLoading } = useApi<CourseAssignment[]>('/courses');

  const courses = coursesData ?? [];
  const totalCourses     = courses.length;
  const completedCourses = courses.filter(c => c.progress?.status === 'completed').length;
  const trainingRate     = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

  // Kişisel KPI'lar
  const goals   = perfData?.goals   ?? [];
  const actuals = perfData?.actuals ?? [];

  // KPI bazlı toplam gerçekleşme
  const kpiSummary = goals.map(g => {
    const totalActual = actuals
      .filter(a => a.kpiId === g.kpiId)
      .reduce((s, a) => s + Number(a.actualValue), 0);
    return {
      kpiId:   g.kpiId,
      name:    g.kpi.kpiName,
      unit:    g.kpi.unit,
      target:  Number(g.targetValue),
      actual:  totalActual,
      rate:    Number(g.targetValue) > 0 ? Math.round((totalActual / Number(g.targetValue)) * 100) : 0,
    };
  });

  const isLoading = perfLoading || coursesLoading;

  return (
    <>
      {/* Eğitim Durumu */}
      <div className="bg-white rounded-xl border border-brand-border shadow-md p-6 lg:p-8">
        {coursesLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {/* Dairesel Grafik */}
            <div className="relative w-40 h-40 shrink-0">
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#E5E7EB" strokeWidth="7" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke="#B30000" strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${trainingRate * 2.64} ${264 - trainingRate * 2.64}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-brand-red">%{trainingRate}</span>
                <span className="text-[10px] font-bold text-brand-gray uppercase tracking-widest mt-0.5">Tamamlandı</span>
              </div>
            </div>
            {/* Eğitim Detayları */}
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-lg font-black text-brand-black tracking-tight">Eğitim Durumum</h2>
                <p className="text-sm text-brand-gray font-medium mt-0.5">
                  {completedCourses} / {totalCourses} eğitimi tamamladınız
                </p>
              </div>
              <ProgressBar
                value={trainingRate}
                label="Genel İlerleme"
                height="h-3"
                color="bg-brand-red"
              />
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-xl font-black text-green-700">{completedCourses}</p>
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mt-0.5">Tamamlanan</p>
                </div>
                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
                  <p className="text-xl font-black text-amber-700">{totalCourses - completedCourses}</p>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-0.5">Devam Eden</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kişisel Performans Kartları */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : kpiSummary.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {kpiSummary.map((kpi) => (
            <StatCard
              key={kpi.kpiId}
              label={kpi.name}
              value={kpi.unit === '%' ? `%${kpi.actual.toFixed(1)}` : kpi.actual.toLocaleString('tr-TR')}
              rate={kpi.rate}
            />
          ))}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700 flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="font-bold">Performans verisi bulunamadı</p>
            <p className="mt-1 text-amber-600">Bu ay için henüz KPI hedefi atanmamış.</p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Stat Kart Bileşeni ───────────────────────────────────────────────────────

function StatCard({ label, value, rate, sub, highlight }: {
  label: string; value: string;
  rate?: number; sub?: string; highlight?: boolean;
}) {
  const hasRate = rate !== undefined && rate !== null;
  return (
    <div className={`rounded-xl p-4 border shadow-card flex flex-col gap-1 ${
      highlight ? 'bg-brand-red text-white border-brand-red' : 'bg-white border-brand-border'
    }`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider truncate ${highlight ? 'text-white/70' : 'text-brand-gray'}`}>
        {label}
      </p>
      <p className={`text-xl font-black tabular-nums leading-tight ${highlight ? 'text-white' : 'text-brand-black'}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-[10px] font-medium ${highlight ? 'text-white/60' : 'text-brand-gray/70'}`}>{sub}</p>
      )}
      {hasRate && !highlight && (
        <div className="mt-1">
          <div className="h-1 bg-brand-lightGray rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${rateBg(rate!)}`}
              style={{ width: `${Math.min(rate!, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="rounded-xl border border-brand-border bg-white p-4 animate-pulse h-20" />
      ))}
    </div>
  );
}
