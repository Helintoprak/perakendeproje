import { useState, useMemo } from 'react';
import { useApi }  from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import api         from '../lib/api';
import ProgressBar from '../components/ui/ProgressBar';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface CourseProgress {
  courseId:       number;
  title:          string;
  isMandatory:    boolean;
  completionRate: number;
  status:         string;
  lastQuizScore:  number | null;
  lastQuizTotal:  number | null;
  lastQuizPassed: boolean | null;
}

interface StaffMember {
  userId:      number;
  fullName:    string;
  role:        string;
  overallRate: number;
  courses:     CourseProgress[];
}

interface ShiftUser {
  userId:   number;
  fullName: string;
  role:     { roleName: string };
}

interface ShiftEntry {
  id:        number;
  userId:    number;
  date:      string;
  shiftType: 'morning' | 'evening' | 'off';
}

interface LeaveRequest {
  id:        number;
  userId:    number;
  startDate: string;
  endDate:   string;
  reason:    string;
  status:    'pending' | 'approved' | 'rejected';
  createdAt: string;
  user:      { fullName: string; role: { roleName: string } };
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const SHIFT_META = {
  morning: { label: 'Açılış',   hours: '09:00–18:00', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  evening: { label: 'Kapanış',  hours: '13:00–22:00', color: 'bg-blue-100 text-blue-800 border-blue-300'         },
  off:     { label: 'OFF',      hours: '',             color: 'bg-gray-100 text-gray-500 border-gray-300'         },
} as const;

type ShiftType = keyof typeof SHIFT_META;
type ProgressFilter = 'all' | 'passed' | 'inProgress' | 'notStarted';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day  = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { isManager, isRegionalManager } = useAuth();
  const isAdmin = isManager || isRegionalManager;

  const [activeTab, setActiveTab] = useState<'progress' | 'shifts'>('progress');

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-brand-gray text-sm">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Başlık */}
      <div>
        <h1 className="text-2xl font-extrabold text-brand-black">Ekip Yönetimi</h1>
        <p className="text-brand-gray text-sm mt-1">Personel eğitim ilerlemesi ve vardiya planlaması</p>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 bg-brand-lightGray rounded-2xl p-1 w-fit border border-brand-border">
        {([
          { key: 'progress', label: '📚 Eğitim İlerlemesi' },
          { key: 'shifts',   label: '📅 Vardiya & İzin'    },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-white text-brand-red shadow-sm border border-brand-border'
                : 'text-brand-gray hover:text-brand-black'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'progress' ? <ProgressTab /> : <ShiftsTab />}
    </div>
  );
}

// ─── Sekme 1: Eğitim İlerleme Takibi ─────────────────────────────────────────

function ProgressTab() {
  const { data: staff, loading, refetch } = useApi<StaffMember[]>('/team/progress');
  const [filter,       setFilter]         = useState<ProgressFilter>('all');
  const [expanded,     setExpanded]       = useState<number | null>(null);
  const [reminding,    setReminding]      = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!staff) return [];
    switch (filter) {
      case 'passed':     return staff.filter(s => s.courses.some(c => c.lastQuizPassed === true));
      case 'inProgress': return staff.filter(s => s.overallRate > 0 && s.overallRate < 100);
      case 'notStarted': return staff.filter(s => s.overallRate === 0);
      default:           return staff;
    }
  }, [staff, filter]);

  async function handleRemind(userId: number) {
    setReminding(userId);
    try {
      await api.post(`/team/remind/${userId}`);
    } finally {
      setReminding(null);
    }
  }

  if (loading) return <LoadingSpinner label="Eğitim verileri yükleniyor..." />;

  const counts = {
    all:        staff?.length ?? 0,
    passed:     staff?.filter(s => s.courses.some(c => c.lastQuizPassed === true)).length ?? 0,
    inProgress: staff?.filter(s => s.overallRate > 0 && s.overallRate < 100).length ?? 0,
    notStarted: staff?.filter(s => s.overallRate === 0).length ?? 0,
  };

  return (
    <div className="space-y-4">
      {/* Filtre butonları */}
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'all',        label: 'Tümü',            count: counts.all,        color: 'bg-gray-100 text-gray-700 border-gray-300'            },
          { key: 'passed',     label: '✅ Quizi Geçenler', count: counts.passed,     color: 'bg-green-100 text-green-700 border-green-300'         },
          { key: 'inProgress', label: '🔄 Yarım Bırakanlar', count: counts.inProgress, color: 'bg-amber-100 text-amber-700 border-amber-300'   },
          { key: 'notStarted', label: '⏳ Başlamayanlar', count: counts.notStarted, color: 'bg-red-100 text-red-700 border-red-300'               },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
              filter === f.key ? f.color + ' shadow-sm' : 'bg-white text-brand-gray border-brand-border hover:bg-brand-lightGray'
            }`}
          >
            {f.label}
            <span className="bg-white/60 px-1.5 py-0.5 rounded-md text-xs font-bold">{f.count}</span>
          </button>
        ))}
      </div>

      {/* Tablo */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-brand-gray text-sm">Bu filtrede personel bulunamadı.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-lightGray border-b border-brand-border text-brand-gray text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Personel</th>
                <th className="text-left px-5 py-3 font-semibold">Genel İlerleme</th>
                <th className="text-left px-5 py-3 font-semibold">Eğitim Sayısı</th>
                <th className="text-left px-5 py-3 font-semibold">Son Quiz</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filtered.map(s => (
                <>
                  <tr
                    key={s.userId}
                    className="hover:bg-brand-lightGray/50 transition-colors cursor-pointer"
                    onClick={() => setExpanded(expanded === s.userId ? null : s.userId)}
                  >
                    {/* Personel */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brand-red flex items-center justify-center text-white font-bold text-sm shrink-0">
                          {s.fullName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-brand-black">{s.fullName}</p>
                          <p className="text-xs text-brand-gray">{s.role}</p>
                        </div>
                      </div>
                    </td>

                    {/* Genel ilerleme */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3 min-w-[160px]">
                        <div className="flex-1">
                          <ProgressBar
                            value={s.overallRate}
                            height="h-2"
                            color={
                              s.overallRate === 100 ? 'bg-green-500'
                              : s.overallRate > 0   ? 'bg-amber-400'
                              : 'bg-brand-border'
                            }
                          />
                        </div>
                        <span className={`text-xs font-bold tabular-nums ${
                          s.overallRate === 100 ? 'text-green-600'
                          : s.overallRate > 0   ? 'text-amber-600'
                          : 'text-brand-gray'
                        }`}>
                          %{s.overallRate}
                        </span>
                      </div>
                    </td>

                    {/* Eğitim sayısı */}
                    <td className="px-5 py-4">
                      <span className="text-brand-black font-medium">
                        {s.courses.filter(c => c.status === 'completed').length}
                        <span className="text-brand-gray">/{s.courses.length}</span>
                      </span>
                      <p className="text-xs text-brand-gray">tamamlandı</p>
                    </td>

                    {/* Son quiz */}
                    <td className="px-5 py-4">
                      {s.courses.some(c => c.lastQuizScore !== null) ? (() => {
                        const best = s.courses.filter(c => c.lastQuizPassed === true)[0]
                          ?? s.courses.filter(c => c.lastQuizScore !== null)[0];
                        return (
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${
                            best.lastQuizPassed ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'
                          }`}>
                            {best.lastQuizPassed ? '✅' : '❌'} {best.lastQuizScore}/{best.lastQuizTotal}
                          </span>
                        );
                      })() : (
                        <span className="text-brand-gray text-xs">—</span>
                      )}
                    </td>

                    {/* Aksiyon */}
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <span className="text-brand-gray/40 text-xs">
                          {expanded === s.userId ? '▲' : '▼'}
                        </span>
                        {s.overallRate < 100 && (
                          <button
                            onClick={() => handleRemind(s.userId)}
                            disabled={reminding === s.userId}
                            className="text-xs font-bold text-white bg-brand-red hover:bg-brand-redDark
                              px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
                          >
                            {reminding === s.userId ? '...' : '🔔 Hatırlat'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Kurs detayları (expand) */}
                  {expanded === s.userId && (
                    <tr key={`${s.userId}-detail`}>
                      <td colSpan={5} className="bg-brand-lightGray/60 px-5 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {s.courses.map(c => (
                            <div key={c.courseId} className="bg-white rounded-xl border border-brand-border p-4">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="text-xs font-semibold text-brand-black leading-snug flex-1">{c.title}</p>
                                {c.isMandatory && (
                                  <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md shrink-0">
                                    Zorunlu
                                  </span>
                                )}
                              </div>
                              <ProgressBar
                                value={c.completionRate}
                                height="h-1.5"
                                color={c.status === 'completed' ? 'bg-green-500' : c.completionRate > 0 ? 'bg-amber-400' : 'bg-brand-border'}
                              />
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="text-[10px] text-brand-gray">%{c.completionRate}</span>
                                {c.lastQuizScore !== null && (
                                  <span className={`text-[10px] font-bold ${c.lastQuizPassed ? 'text-green-600' : 'text-red-600'}`}>
                                    Quiz: {c.lastQuizScore}/{c.lastQuizTotal}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sekme 2: Vardiya & İzin Yönetimi ────────────────────────────────────────

function ShiftsTab() {
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const weekParam = toISO(weekStart);

  const { data: shiftData, loading: shiftsLoading, refetch: refetchShifts } =
    useApi<{ users: ShiftUser[]; shifts: ShiftEntry[]; weekStart: string }>(
      '/team/shifts', { weekStart: weekParam },
    );

  const { data: leaveRequests, loading: leaveLoading, refetch: refetchLeave } =
    useApi<LeaveRequest[]>('/team/leave-requests');

  const [savingShift, setSavingShift] = useState<string | null>(null);
  const [actionLeave, setActionLeave] = useState<number | null>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // shiftType lookup: userId_YYYY-MM-DD → shiftType
  const shiftMap = useMemo(() => {
    const m = new Map<string, ShiftType>();
    (shiftData?.shifts ?? []).forEach(s => {
      m.set(`${s.userId}_${toISO(new Date(s.date))}`, s.shiftType);
    });
    return m;
  }, [shiftData]);

  function nextShift(current: ShiftType | undefined): ShiftType {
    if (!current || current === 'off')     return 'morning';
    if (current === 'morning') return 'evening';
    return 'off';
  }

  async function handleCellClick(userId: number, date: Date) {
    const key     = `${userId}_${toISO(date)}`;
    const current = shiftMap.get(key);
    const next    = nextShift(current);
    setSavingShift(key);
    try {
      await api.put('/team/shifts', { userId, date: toISO(date), shiftType: next });
      refetchShifts();
    } finally {
      setSavingShift(null);
    }
  }

  async function handleLeaveAction(id: number, action: 'approve' | 'reject') {
    setActionLeave(id);
    try {
      await api.put(`/team/leave-requests/${id}`, { action });
      refetchLeave();
    } finally {
      setActionLeave(null);
    }
  }

  const pendingLeave = (leaveRequests ?? []).filter(r => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Hafta navigasyonu */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          className="px-3 py-2 rounded-xl border border-brand-border text-brand-gray hover:bg-brand-lightGray transition-colors text-sm font-semibold"
        >
          ← Önceki
        </button>
        <span className="text-sm font-bold text-brand-black">
          {fmtDate(toISO(weekStart))} – {fmtDate(toISO(addDays(weekStart, 6)))}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className="px-3 py-2 rounded-xl border border-brand-border text-brand-gray hover:bg-brand-lightGray transition-colors text-sm font-semibold"
        >
          Sonraki →
        </button>
        <button
          onClick={() => setWeekStart(getMonday(new Date()))}
          className="px-3 py-2 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-redDark transition-colors ml-auto"
        >
          Bu Hafta
        </button>
      </div>

      <div className="flex gap-4 items-start">
        {/* Vardiya takvimi */}
        <div className="flex-1 min-w-0">
          {shiftsLoading ? (
            <LoadingSpinner label="Vardiyalar yükleniyor..." />
          ) : (
            <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="bg-brand-lightGray border-b border-brand-border">
                    <th className="text-left px-4 py-3 font-semibold text-brand-gray w-36">Personel</th>
                    {weekDays.map((d, i) => {
                      const isToday = toISO(d) === toISO(new Date());
                      return (
                        <th key={i} className={`px-2 py-3 text-center font-semibold w-[13%] ${isToday ? 'text-brand-red' : 'text-brand-gray'}`}>
                          <div>{DAYS_TR[i]}</div>
                          <div className={`text-[10px] font-normal mt-0.5 ${isToday ? 'text-brand-red' : 'text-brand-gray/60'}`}>
                            {d.getDate()}/{d.getMonth() + 1}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {(shiftData?.users ?? []).map(u => (
                    <tr key={u.userId} className="hover:bg-brand-lightGray/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brand-black truncate">{u.fullName}</p>
                        <p className="text-brand-gray/70 text-[10px]">{u.role.roleName}</p>
                      </td>
                      {weekDays.map((d, i) => {
                        const key       = `${u.userId}_${toISO(d)}`;
                        const shiftType = shiftMap.get(key) ?? 'off';
                        const meta      = SHIFT_META[shiftType];
                        const saving    = savingShift === key;
                        return (
                          <td key={i} className="px-2 py-2 text-center">
                            <button
                              onClick={() => handleCellClick(u.userId, d)}
                              disabled={saving}
                              title="Tıkla: Açılış → Kapanış → OFF → Açılış"
                              className={`w-full rounded-xl border py-2 px-1 transition-all font-semibold
                                hover:opacity-80 active:scale-95 disabled:opacity-50 ${meta.color}`}
                            >
                              {saving ? (
                                <span className="text-[10px]">...</span>
                              ) : (
                                <>
                                  <div className="text-[11px]">{meta.label}</div>
                                  {meta.hours && <div className="text-[9px] opacity-70 mt-0.5">{meta.hours}</div>}
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {(shiftData?.users ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-brand-gray text-sm">
                        Mağazada personel bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Legand */}
              <div className="flex gap-4 px-4 py-3 border-t border-brand-border bg-brand-lightGray/50">
                <p className="text-[10px] text-brand-gray font-semibold mr-2">Tıklayarak değiştir:</p>
                {(Object.entries(SHIFT_META) as [ShiftType, typeof SHIFT_META[ShiftType]][]).map(([k, v]) => (
                  <span key={k} className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${v.color}`}>
                    {v.label}{v.hours ? ` ${v.hours}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* İzin talepleri paneli */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
            <div className="px-4 py-3 bg-brand-lightGray border-b border-brand-border flex items-center justify-between">
              <h3 className="text-sm font-bold text-brand-black">📋 İzin Talepleri</h3>
              {pendingLeave.length > 0 && (
                <span className="text-xs font-bold text-white bg-brand-red px-2 py-0.5 rounded-full">
                  {pendingLeave.length}
                </span>
              )}
            </div>

            {leaveLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pendingLeave.length === 0 ? (
              <div className="text-center py-10 text-brand-gray text-sm">
                <p className="text-2xl mb-2">✅</p>
                Bekleyen izin talebi yok
              </div>
            ) : (
              <div className="divide-y divide-brand-border max-h-[480px] overflow-y-auto">
                {pendingLeave.map(lr => (
                  <div key={lr.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand-red/10 flex items-center justify-center text-brand-red font-bold text-sm shrink-0">
                        {lr.user.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-brand-black truncate">{lr.user.fullName}</p>
                        <p className="text-[10px] text-brand-gray">{lr.user.role.roleName}</p>
                      </div>
                    </div>
                    <div className="bg-brand-lightGray rounded-xl px-3 py-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-brand-gray">
                        <span>📅</span>
                        <span className="font-medium">
                          {fmtDate(lr.startDate)} – {fmtDate(lr.endDate)}
                        </span>
                      </div>
                      <p className="text-xs text-brand-black leading-snug">{lr.reason}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLeaveAction(lr.id, 'approve')}
                        disabled={actionLeave === lr.id}
                        className="flex-1 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
                      >
                        ✓ Onayla
                      </button>
                      <button
                        onClick={() => handleLeaveAction(lr.id, 'reject')}
                        disabled={actionLeave === lr.id}
                        className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors disabled:opacity-60"
                      >
                        ✕ Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Geçmiş özeti */}
            {(leaveRequests ?? []).filter(r => r.status !== 'pending').length > 0 && (
              <div className="border-t border-brand-border px-4 py-3 bg-brand-lightGray/50">
                <p className="text-[10px] text-brand-gray font-semibold uppercase tracking-wide mb-2">Sonuçlananlar</p>
                <div className="space-y-1.5">
                  {(leaveRequests ?? [])
                    .filter(r => r.status !== 'pending')
                    .slice(0, 3)
                    .map(lr => (
                      <div key={lr.id} className="flex items-center gap-2 text-[11px]">
                        <span>{lr.status === 'approved' ? '✅' : '❌'}</span>
                        <span className="text-brand-black font-medium truncate">{lr.user.fullName}</span>
                        <span className="text-brand-gray ml-auto shrink-0">{fmtDate(lr.startDate)}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Yardımcı bileşen ─────────────────────────────────────────────────────────

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-gray text-sm">{label}</p>
    </div>
  );
}
