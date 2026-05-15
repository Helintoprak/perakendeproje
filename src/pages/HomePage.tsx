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

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0 });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

// KPI ikonları
const KPI_ICONS: Record<string, string> = {
  'Satış Adedi':        '🛒',
  'Fatura Sayısı':      '🧾',
  'MDO':                '⭐',
  'Tekli Fatura Oranı': '📑',
  'Ciro':               '💰',
};

function getKpiIcon(name: string): string {
  for (const [key, icon] of Object.entries(KPI_ICONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return '📊';
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
          {getGreeting()}, {user?.fullName?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm lg:text-base text-brand-gray font-medium mt-1">{subtitle}</p>
      </div>

      {isAdmin ? <AdminHomeView /> : isManagerRole ? <ManagerView /> : <StaffView />}
    </div>
  );
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

function AdminHomeView() {
  const now = new Date();
  const { data, loading } = useApi<ChainData>(
    '/performance/admin',
    { month: now.getMonth() + 1, year: now.getFullYear() }
  );

  const summary  = data?.chainSummary ?? [];
  const stores   = data?.perStore     ?? [];
  const mainKpi  = summary.find(s => s.kpi.kpiName.toLowerCase().includes('ciro')) ?? summary[0];
  const topStores = stores.slice().sort((a, b) => b.overallRate - a.overallRate).slice(0, 5);

  return (
    <>
      {/* Zincir Banner */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-xl p-6 lg:p-8 text-white shadow-lg">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-sm font-bold text-white/70 uppercase tracking-widest">
                🌐 Zincir Geneli — {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
              </p>
              <p className="text-3xl lg:text-4xl font-black mt-2">
                {mainKpi ? mainKpi.totalActual.toLocaleString('tr-TR') : '—'}
                {mainKpi?.kpi.unit === 'TL' ? ' ₺' : mainKpi?.kpi.unit ? ` ${mainKpi.kpi.unit}` : ''}
              </p>
              <p className="text-sm text-white/60 mt-1">{stores.length} mağaza aktif</p>
            </div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-2 bg-white text-brand-red font-black text-sm px-5 py-3 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 shrink-0"
            >
              <span>🏢</span> Tam Analiz
            </Link>
          </div>
        )}
      </div>

      {/* KPI Kartları */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {summary.map((item, i) => (
            <KPICard
              key={item.kpi.kpiId}
              icon={getKpiIcon(item.kpi.kpiName)}
              label={item.kpi.kpiName}
              value={
                item.kpi.unit === '%'
                  ? `%${Number(item.totalActual).toFixed(1)}`
                  : item.totalActual.toLocaleString('tr-TR')
              }
              accent={i === 0}
            />
          ))}
        </div>
      )}

      {/* Mağaza Sıralaması */}
      {topStores.length > 0 && (
        <div className="bg-white rounded-xl border border-brand-border shadow-md p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-black text-brand-black">Mağaza Performans Sıralaması</h2>
              <p className="text-xs text-brand-gray font-medium mt-0.5">İlk KPI gerçekleşme oranına göre</p>
            </div>
            <Link to="/admin" className="text-xs font-black text-brand-red hover:underline">
              Tümünü Gör →
            </Link>
          </div>
          <div className="space-y-3">
            {topStores.map((store, idx) => (
              <div key={store.storeId} className="flex items-center gap-4">
                <span className={`w-6 text-sm font-black text-center shrink-0 ${idx === 0 ? 'text-amber-500' : 'text-brand-gray'}`}>
                  {idx + 1}
                </span>
                <div className="w-40 shrink-0">
                  <p className="text-sm font-bold text-brand-black truncate">{store.storeName}</p>
                  <p className="text-[11px] text-brand-gray">{store.staffCount} personel</p>
                </div>
                <div className="flex-1">
                  <ProgressBar
                    value={Math.min(store.overallRate, 100)}
                    height="h-2.5"
                    showPercent={false}
                    color={store.overallRate >= 100 ? 'bg-green-500' : store.overallRate >= 75 ? 'bg-amber-400' : 'bg-brand-red'}
                  />
                </div>
                <span className={`text-sm font-black tabular-nums w-12 text-right ${
                  store.overallRate >= 100 ? 'text-green-600' : store.overallRate >= 75 ? 'text-amber-600' : 'text-brand-red'
                }`}>
                  %{store.overallRate}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bilgi Gücü — Eğitim vs. Satış (zincir geneli) */}
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

  const storeSummary = storePerf?.storeSummary ?? [];
  const team = teamData ?? [];

  // Genel hedef ve gerçekleşme (ciro bazlı veya ilk KPI)
  const mainKpi = storeSummary.find(s =>
    s.kpi.kpiName.toLowerCase().includes('ciro') ||
    s.kpi.kpiName.toLowerCase().includes('hedef')
  ) ?? storeSummary[0];

  const achievementRate = mainKpi ? Math.round(mainKpi.rate) : 0;
  const totalTarget     = mainKpi?.totalTarget ?? 0;
  const totalActual     = mainKpi?.totalActual ?? 0;

  // Ekibin ortalama eğitim oranı
  const teamAvg = team.length > 0
    ? Math.round(team.reduce((s, t) => s + t.overallRate, 0) / team.length)
    : 0;

  return (
    <>
      {/* Mağaza KPI Banner */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-xl p-6 lg:p-8 text-white shadow-lg">
        {perfLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-sm font-bold text-white/70 uppercase tracking-widest">Aylık Mağaza Performansı</p>
              <p className="text-3xl lg:text-4xl font-black mt-2">
                {totalActual > 0 ? formatCurrency(totalActual) : '—'}
              </p>
              {totalTarget > 0 && (
                <p className="text-sm text-white/60 mt-1">Hedef: {formatCurrency(totalTarget)}</p>
              )}
            </div>
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="white" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(achievementRate, 100) * 2.64} ${264 - Math.min(achievementRate, 100) * 2.64}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-black text-white">%{achievementRate}</span>
                </div>
              </div>
              <p className="text-xs text-white/60 mt-2 font-bold uppercase tracking-wider">Gerçekleşme</p>
            </div>
          </div>
        )}
      </div>

      {/* KPI Kartları */}
      {storeSummary.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {storeSummary.slice(0, 4).map((item, i) => (
            <KPICard
              key={item.kpi.kpiId}
              icon={getKpiIcon(item.kpi.kpiName)}
              label={item.kpi.kpiName}
              value={
                item.kpi.unit === '%'
                  ? `%${Number(item.totalActual).toFixed(1)}`
                  : item.totalActual.toLocaleString('tr-TR')
              }
              accent={i === 0}
            />
          ))}
        </div>
      )}

      {/* Veri yoksa bilgi kartları */}
      {!perfLoading && storeSummary.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-700 flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="font-bold">Performans verisi bulunamadı</p>
            <p className="mt-1 text-amber-600">Bu ay için henüz KPI hedefi veya gerçekleşme girişi yapılmamış.</p>
          </div>
        </div>
      )}

      {/* Ekip Eğitim Takibi */}
      <div className="bg-white rounded-xl border border-brand-border shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-black text-brand-black tracking-tight">Ekip Eğitim Durumu</h2>
            <p className="text-sm text-brand-gray font-medium mt-0.5">
              Personellerin eğitim tamamlama oranları
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-brand-red">%{teamAvg}</p>
            <p className="text-[10px] font-bold text-brand-gray uppercase tracking-widest">Ortalama</p>
          </div>
        </div>

        {teamLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : team.length === 0 ? (
          <div className="text-center py-8 text-brand-gray text-sm">
            <p className="text-2xl mb-2">👥</p>
            Mağazada eğitim verisi bulunamadı.
          </div>
        ) : (
          <div className="space-y-4">
            {team.map(member => (
              <div key={member.userId} className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-brand-red flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
                  {member.fullName.charAt(0)}
                </div>
                <div className="w-36 shrink-0">
                  <p className="text-sm font-bold text-brand-black truncate leading-tight">{member.fullName}</p>
                  <p className="text-[11px] text-brand-gray font-medium">{member.role}</p>
                </div>
                <div className="flex-1">
                  <ProgressBar
                    value={member.overallRate}
                    height="h-2.5"
                    showPercent={false}
                    color={
                      member.overallRate === 100 ? 'bg-green-500'
                      : member.overallRate >= 50  ? 'bg-amber-400'
                      : 'bg-brand-red'
                    }
                  />
                </div>
                <span className={`text-sm font-black tabular-nums w-12 text-right ${
                  member.overallRate === 100 ? 'text-green-600'
                  : member.overallRate >= 50  ? 'text-amber-600'
                  : 'text-brand-red'
                }`}>
                  %{member.overallRate}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bilgi Gücü — Eğitim vs. Satış (kendi mağazası, backend role'den çıkartır) */}
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
          {kpiSummary.map((kpi, i) => (
            <KPICard
              key={kpi.kpiId}
              icon={getKpiIcon(kpi.name)}
              label={kpi.name}
              value={
                kpi.unit === '%'
                  ? `%${kpi.actual.toFixed(1)}`
                  : kpi.actual.toLocaleString('tr-TR')
              }
              accent={i === 0}
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

// ─── KPI Kart Bileşeni ────────────────────────────────────────────────────────

function KPICard({ icon, label, value, accent }: {
  icon: string;
  label: string;
  value: string;
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
    </div>
  );
}
