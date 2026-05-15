import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import KPIChart from '../components/charts/KPIChart';

interface UserDetail {
  userId: number;
  fullName: string;
  email: string;
  status: boolean;
  role: { roleName: string };
  store: { storeName: string; region: { regionName: string } } | null;
}

interface CourseAssignment {
  assignmentId: number;
  course: { title: string; category: { categoryName: string } | null };
  progress: { completionRate: number; status: string; startedDate?: string } | null;
}

const ROLE_COLORS: Record<string, string> = {
  'Müdür':            'text-brand-red bg-brand-redLight border-brand-redMid',
  'Bölge Müdürü':     'text-purple-700 bg-purple-50 border-purple-200',
  'Satış Danışmanı':  'text-blue-700 bg-blue-50 border-blue-200',
  'Eğitim Uzmanı':    'text-green-700 bg-green-50 border-green-200',
  'Admin':            'text-gray-700 bg-gray-100 border-gray-300',
};

// Gelişim trend verisi (API entegrasyonuna kadar mock)
const DEVELOPMENT_TREND = [
  { month: 'Oca', actual: 20 },
  { month: 'Şub', actual: 35 },
  { month: 'Mar', actual: 45 },
  { month: 'Nis', actual: 55 },
  { month: 'May', actual: 70 },
  { month: 'Haz', actual: 82 },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: detail } = useApi<UserDetail>('/users/me');
  const { data: courses } = useApi<CourseAssignment[]>('/courses');

  const allCourses = courses ?? [];
  const completed  = allCourses.filter(c => c.progress?.status === 'completed');
  const inProgress = allCourses.filter(c => c.progress?.status === 'in_progress');
  const avgRate    = allCourses.length
    ? Math.round(allCourses.reduce((s, c) => s + Number(c.progress?.completionRate ?? 0), 0) / allCourses.length)
    : 0;

  const roleColorClass = ROLE_COLORS[detail?.role.roleName ?? ''] ?? 'text-brand-gray bg-brand-lightGray border-brand-border';

  return (
    <div className="space-y-6">
      {/* Üst profil kartı */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
        {/* Kırmızı banner */}
        <div className="h-24 bg-gradient-to-r from-brand-red to-brand-redDark relative">
          <div className="absolute inset-0 opacity-10">
            <svg width="100%" height="100%" viewBox="0 0 400 96" preserveAspectRatio="xMidYMid slice">
              <circle cx="350" cy="48" r="80" fill="white" />
              <circle cx="80" cy="-10" r="60" fill="white" />
            </svg>
          </div>
        </div>

        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="flex items-end justify-between -mt-8 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-red border-4 border-white shadow-lg
              flex items-center justify-center text-white text-2xl font-extrabold">
              {user?.fullName.charAt(0)}
            </div>
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border ${roleColorClass}`}>
              {detail?.role.roleName}
            </div>
          </div>

          <h2 className="text-xl font-extrabold text-brand-black">{detail?.fullName}</h2>
          <p className="text-sm text-brand-gray mt-0.5">{detail?.email}</p>

          {detail?.store && (
            <div className="flex items-center gap-4 mt-3 text-sm text-brand-gray">
              <span className="flex items-center gap-1.5">🏪 <span>{detail.store.storeName}</span></span>
              <span className="flex items-center gap-1.5">📍 <span>{detail.store.region.regionName}</span></span>
            </div>
          )}

          {/* Özet stat'lar */}
          <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-brand-border">
            <MiniStat value={allCourses.length} label="Toplam Kurs" />
            <MiniStat value={completed.length}  label="Tamamlandı" color="text-green-600" />
            <MiniStat value={`%${avgRate}`}      label="Genel İlerleme" color="text-brand-red" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sol kolon — Gelişim dosyası detayları */}
        <div className="lg:col-span-2 space-y-5">
          {/* Tamamlanan Eğitimler */}
          <Section title="Tamamlanan Eğitimler" icon="🏅" count={completed.length}>
            {completed.length === 0 ? (
              <EmptyInSection text="Henüz tamamlanan eğitim yok" />
            ) : (
              <div className="space-y-2">
                {completed.map((c) => (
                  <div key={c.assignmentId} className="flex items-center gap-3 p-3 bg-brand-lightGray rounded-xl">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                      <span className="text-sm">✅</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-black truncate">{c.course.title}</p>
                      {c.course.category && (
                        <p className="text-xs text-brand-gray">{c.course.category.categoryName}</p>
                      )}
                    </div>
                    <span className="text-xs font-bold text-green-600 shrink-0">%100</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Devam Eden Eğitimler */}
          <Section title="Devam Eden Eğitimler" icon="▶️" count={inProgress.length}>
            {inProgress.length === 0 ? (
              <EmptyInSection text="Devam eden eğitim yok" />
            ) : (
              <div className="space-y-3">
                {inProgress.map((c) => (
                  <div key={c.assignmentId} className="p-3 bg-brand-lightGray rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-brand-black truncate flex-1">{c.course.title}</p>
                      <span className="text-xs font-bold text-amber-600 ml-2">
                        %{Math.round(Number(c.progress?.completionRate ?? 0))}
                      </span>
                    </div>
                    <ProgressBar
                      value={Number(c.progress?.completionRate ?? 0)}
                      showPercent={false}
                      height="h-1.5"
                      color="bg-amber-400"
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Gelişim trend grafiği */}
          <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📈</span>
              <div>
                <h3 className="font-bold text-sm text-brand-black">Eğitim İlerlemesi</h3>
                <p className="text-xs text-brand-gray">Aylık tamamlanma yüzdesi</p>
              </div>
            </div>
            <KPIChart data={DEVELOPMENT_TREND} type="area" unit="%" color="#D42B2B" showTarget={false} height={200} />
          </div>
        </div>

        {/* Sağ kolon — özet & bilgiler */}
        <div className="space-y-4">
          {/* Hesap bilgileri */}
          <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-gray mb-3">Hesap Bilgileri</h3>
            <div className="space-y-3">
              <InfoRow label="ID" value={`#${detail?.userId}`} />
              <InfoRow label="Durum" value={detail?.status ? '✅ Aktif' : '❌ Pasif'} />
              <InfoRow label="Rol" value={detail?.role.roleName ?? '—'} />
            </div>
          </div>

          {/* Rozetler */}
          <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-gray mb-3">Rozetler</h3>
            <div className="space-y-2">
              <BadgeItem
                icon="🎓"
                label="İlk Eğitim"
                desc="İlk kursunu tamamladın"
                earned={completed.length >= 1}
              />
              <BadgeItem
                icon="🏆"
                label="Süper Öğrenci"
                desc="5 kurs tamamlandı"
                earned={completed.length >= 5}
              />
              <BadgeItem
                icon="🔥"
                label="Azimli"
                desc="3 ay üst üste aktif"
                earned={avgRate >= 50}
              />
              <BadgeItem
                icon="⭐"
                label="Mükemmeliyetçi"
                desc="Tüm kurslar tamamlandı"
                earned={allCourses.length > 0 && completed.length === allCourses.length}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ value, label, color = 'text-brand-black' }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      <p className="text-xs text-brand-gray mt-0.5">{label}</p>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm text-brand-black flex items-center gap-2">
          <span className="text-lg">{icon}</span> {title}
        </h3>
        <span className="text-xs font-bold bg-brand-lightGray text-brand-gray px-2 py-0.5 rounded-lg">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyInSection({ text }: { text: string }) {
  return <p className="text-sm text-brand-gray/60 text-center py-4">{text}</p>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-brand-gray">{label}</span>
      <span className="font-semibold text-brand-black">{value}</span>
    </div>
  );
}

function BadgeItem({ icon, label, desc, earned }: { icon: string; label: string; desc: string; earned: boolean }) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${earned ? 'bg-brand-redLight' : 'bg-brand-lightGray opacity-50'}`}>
      <span className={`text-xl ${!earned && 'grayscale'}`}>{icon}</span>
      <div>
        <p className={`text-xs font-bold ${earned ? 'text-brand-red' : 'text-brand-gray'}`}>{label}</p>
        <p className="text-xs text-brand-gray/70">{desc}</p>
      </div>
      {earned && <span className="ml-auto text-brand-red text-xs">✓</span>}
    </div>
  );
}
