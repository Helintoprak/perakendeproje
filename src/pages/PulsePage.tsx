import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

// ─── Tipler ───────────────────────────────────────────────────────────────────

type QuestionType = 'emoji' | 'rating';

interface SurveyQuestion {
  key:   string;
  label: string;
  type:  QuestionType;
}

interface SurveyListItem {
  surveyId:    number;
  title:       string;
  description: string;
  questions:   SurveyQuestion[];
  createdBy:   string;
  createdAt:   string;
  completed:   boolean;
}

interface SurveyDetail extends SurveyListItem {
  ratings: Record<string, number> | null;
}

interface StatSurvey {
  surveyId:       number;
  title:          string;
  description:    string;
  isActive:       boolean;
  createdBy:      string;
  createdAt:      string;
  totalResponses: number;
  avgByQuestion:  { key: string; label: string; avg: number | null; count: number }[];
}

interface AdminStatSurvey extends StatSurvey {
  storeName: string;
  storeBreakdown: { storeName: string; count: number; avgRating: number }[];
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const EMOJI_SCALE = [
  { value: 1, emoji: '😞', label: 'Çok Kötü' },
  { value: 2, emoji: '😕', label: 'Kötü'      },
  { value: 3, emoji: '😐', label: 'Orta'      },
  { value: 4, emoji: '🙂', label: 'İyi'       },
  { value: 5, emoji: '😄', label: 'Harika'    },
];

function ratingColor(v: number) {
  if (v >= 4.5) return 'text-green-600';
  if (v >= 3.5) return 'text-amber-500';
  return 'text-brand-red';
}

function ratingBg(v: number) {
  if (v >= 4.5) return 'bg-green-500';
  if (v >= 3.5) return 'bg-amber-400';
  return 'bg-brand-red';
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function PulsePage() {
  const { isManager, isRegionalManager, isAdmin } = useAuth();
  const isMgr = isManager || isRegionalManager;

  const [activeTab, setActiveTab] = useState<'list' | 'manage' | 'admin'>( isAdmin ? 'admin' : 'list');
  const [openSurveyId, setOpenSurveyId] = useState<number | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  const { data: surveys, refetch: refetchSurveys } = useApi<SurveyListItem[]>(isAdmin ? '' : '/pulse/surveys');
  const { data: stats,   refetch: refetchStats    } = useApi<StatSurvey[]>(isMgr ? '/pulse/stats' : '');
  const adminParams = selectedStoreId ? { storeId: selectedStoreId } : {};
  const { data: adminStats, refetch: refetchAdminStats } = useApi<AdminStatSurvey[]>(isAdmin ? '/pulse/admin/stats' : '', adminParams);
  const { data: storesList } = useApi<{ storeId: number; storeName: string }[]>(isAdmin ? '/pulse/stores-list' : '');

  if (openSurveyId !== null) {
    return <SurveyFormView surveyId={openSurveyId} onBack={() => { setOpenSurveyId(null); refetchSurveys(); }} />;
  }

  return (
    <div className="space-y-6">

      {/* Admin Başlık */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-2xl p-5 text-white">
          <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">Merkezi Denetim Paneli</p>
          <h2 className="text-xl font-extrabold">Nabız Anketi Yönetimi</h2>
          <p className="text-white/70 text-sm mt-1">Tüm mağazalardaki anket sonuçlarını izleyin, yeni anketler oluşturun.</p>
        </div>
      )}

      {/* Tabs */}
      {(isMgr || isAdmin) && (
        <div className="flex gap-1 bg-white rounded-xl border border-brand-border p-1 shadow-card w-fit">
          {isAdmin ? (
            <>
              <button onClick={() => setActiveTab('admin')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'admin' ? 'bg-brand-red text-white shadow-sm' : 'text-brand-gray hover:bg-brand-lightGray'}`}>
                📊 Sonuçlar
              </button>
              <button onClick={() => setActiveTab('manage')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'manage' ? 'bg-brand-red text-white shadow-sm' : 'text-brand-gray hover:bg-brand-lightGray'}`}>
                + Anket Oluştur
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setActiveTab('list')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'list' ? 'bg-brand-red text-white shadow-sm' : 'text-brand-gray hover:bg-brand-lightGray'}`}>
                Anketler
              </button>
              <button onClick={() => setActiveTab('manage')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'manage' ? 'bg-brand-red text-white shadow-sm' : 'text-brand-gray hover:bg-brand-lightGray'}`}>
                Yönetim
              </button>
            </>
          )}
        </div>
      )}

      {/* Admin: Mağaza Filtresi */}
      {isAdmin && activeTab === 'admin' && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-brand-black">🏪 Mağaza:</label>
          <select value={selectedStoreId ?? ''} onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-white shadow-card focus:outline-none focus:ring-2 focus:ring-brand-red/30 min-w-[220px]">
            <option value="">Tüm Mağazalar</option>
            {(storesList ?? []).map(s => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
          </select>
        </div>
      )}

      {activeTab === 'list' && !isAdmin && (
        <SurveyList surveys={surveys} onOpen={id => setOpenSurveyId(id)} />
      )}

      {activeTab === 'manage' && isAdmin && (
        <AdminCreatePanel storesList={storesList ?? []} onCreated={() => { refetchAdminStats(); }} />
      )}

      {activeTab === 'manage' && isMgr && !isAdmin && (
        <ManagerPanel stats={stats} onCreated={() => { refetchStats(); refetchSurveys(); }}
          onToggle={async (id, isActive) => { await api.patch(`/pulse/surveys/${id}`, { isActive }); refetchStats(); refetchSurveys(); }} />
      )}

      {activeTab === 'admin' && isAdmin && (
        <AdminStatsPanel stats={adminStats} onToggle={async (id, isActive) => { await api.patch(`/pulse/surveys/${id}`, { isActive }); refetchAdminStats(); }} />
      )}
    </div>
  );
}

// ─── Anket Listesi ────────────────────────────────────────────────────────────

function SurveyList({
  surveys,
  onOpen,
}: {
  surveys: SurveyListItem[] | null | undefined;
  onOpen:  (id: number) => void;
}) {
  if (!surveys) return <SkeletonList />;

  if (surveys.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-brand-border shadow-card p-12 text-center">
        <span className="text-5xl block mb-4">📋</span>
        <p className="font-bold text-brand-black">Henüz anket yok</p>
        <p className="text-sm text-brand-gray mt-1">Müdürünüz henüz bir Nabız Anketi oluşturmamış.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-xs text-brand-gray font-semibold uppercase tracking-wide">
        {surveys.length} Anket
      </p>
      {surveys.map(s => (
        <div
          key={s.surveyId}
          className="bg-white rounded-2xl border border-brand-border shadow-card p-5 flex items-start gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-bold text-brand-black text-sm">{s.title}</h3>
              {s.completed && (
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                  ✓ Tamamlandı
                </span>
              )}
            </div>
            <p className="text-xs text-brand-gray line-clamp-2 mb-2">{s.description}</p>
            <p className="text-[10px] text-brand-gray/50">
              {s.createdBy} · {new Date(s.createdAt).toLocaleDateString('tr-TR')} · {s.questions.length} soru
            </p>
          </div>

          {s.completed ? (
            <div className="shrink-0 w-20 h-9 flex items-center justify-center rounded-xl bg-green-50 border border-green-200">
              <span className="text-xs font-semibold text-green-600">Tamamlandı</span>
            </div>
          ) : (
            <button
              onClick={() => onOpen(s.surveyId)}
              className="shrink-0 px-4 py-2 bg-brand-red text-white text-xs font-semibold rounded-xl
                hover:bg-brand-redDark transition-colors shadow-[0_2px_6px_rgba(212,43,43,0.3)]"
            >
              Katıl
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Anket Doldurma Formu ─────────────────────────────────────────────────────

function SurveyFormView({
  surveyId,
  onBack,
}: {
  surveyId: number;
  onBack:   () => void;
}) {
  const { data: survey } = useApi<SurveyDetail>(`/pulse/surveys/${surveyId}`);
  const [ratings, setRatings]   = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState('');

  if (!survey) return <SkeletonForm />;

  if (survey.completed || done) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <span className="text-6xl block">✅</span>
        <h3 className="text-xl font-extrabold text-brand-black">Anket Tamamlandı</h3>
        <p className="text-brand-gray text-sm">
          Bu anketi zaten tamamladınız. Katılımınız için teşekkürler!
        </p>
        <button
          onClick={onBack}
          className="mt-4 px-5 py-2 text-sm font-semibold text-brand-red border border-brand-red rounded-xl hover:bg-brand-redLight transition-colors"
        >
          Anket Listesine Dön
        </button>
      </div>
    );
  }

  const allAnswered = survey.questions.every(q => ratings[q.key] !== undefined);

  async function handleSubmit() {
    if (!allAnswered) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/pulse/surveys/${surveyId}/respond`, { ratings });
      setDone(true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Geri */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-brand-gray font-semibold hover:text-brand-black transition-colors"
      >
        ← Anket Listesi
      </button>

      {/* Başlık */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-2xl p-5 text-white">
        <h2 className="text-lg font-extrabold">{survey.title}</h2>
        <p className="text-white/60 text-xs mt-0.5">
          {survey.createdBy} · {new Date(survey.createdAt).toLocaleDateString('tr-TR')}
        </p>
      </div>

      {/* Müdür Açıklaması */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-amber-700 mb-1">Anket Açıklaması</p>
        <p className="text-sm text-amber-900 leading-relaxed">{survey.description}</p>
      </div>

      {/* Sorular */}
      {survey.questions.map((q, idx) => (
        <div key={q.key} className="bg-white rounded-2xl border border-brand-border shadow-card p-5">
          <p className="font-bold text-brand-black mb-4 text-sm">
            {idx + 1}. {q.label}
          </p>

          {q.type === 'emoji' ? (
            <div className="flex justify-between gap-2">
              {EMOJI_SCALE.map(({ value, emoji, label }) => (
                <button
                  key={value}
                  onClick={() => setRatings(r => ({ ...r, [q.key]: value }))}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                    ratings[q.key] === value
                      ? 'border-brand-red bg-brand-redLight shadow-sm scale-105'
                      : 'border-brand-border hover:border-brand-redMid hover:bg-brand-lightGray'
                  }`}
                >
                  <span className="text-3xl">{emoji}</span>
                  <span className={`text-[11px] font-semibold ${ratings[q.key] === value ? 'text-brand-red' : 'text-brand-gray'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(v => (
                  <button
                    key={v}
                    onClick={() => setRatings(r => ({ ...r, [q.key]: v }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                      ratings[q.key] === v
                        ? 'bg-brand-red text-white border-brand-red shadow-sm'
                        : ratings[q.key] && v <= ratings[q.key]
                          ? 'bg-brand-redLight text-brand-red border-brand-redMid'
                          : 'border-brand-border text-brand-gray hover:border-brand-redMid hover:bg-brand-lightGray'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-brand-gray/60 mt-1 px-0.5">
                <span>Çok Düşük</span><span>Çok Yüksek</span>
              </div>
            </>
          )}
        </div>
      ))}

      {error && (
        <p className="text-sm text-brand-red bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting}
        className="w-full bg-brand-red hover:bg-brand-redDark text-white font-bold text-sm
          py-3 rounded-xl transition-colors shadow-[0_2px_8px_rgba(212,43,43,0.3)]
          disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Gönderiliyor...' : 'Anketi Gönder'}
      </button>
    </div>
  );
}

// ─── Müdür Paneli ─────────────────────────────────────────────────────────────

function ManagerPanel({
  stats,
  onCreated,
  onToggle,
}: {
  stats:     StatSurvey[] | null | undefined;
  onCreated: () => void;
  onToggle:  (id: number, isActive: boolean) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">

      {/* Yeni Anket Oluştur */}
      {showCreate ? (
        <CreateSurveyForm
          onCreated={() => { setShowCreate(false); onCreated(); }}
          onCancel={() => setShowCreate(false)}
        />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white text-sm font-bold
            rounded-xl hover:bg-brand-redDark transition-colors shadow-[0_2px_8px_rgba(212,43,43,0.3)]"
        >
          + Yeni Anket Oluştur
        </button>
      )}

      {/* Anket Listesi / İstatistikler */}
      {!stats ? (
        <SkeletonList />
      ) : stats.length === 0 ? (
        <div className="bg-white rounded-2xl border border-brand-border shadow-card p-10 text-center">
          <p className="text-brand-gray text-sm">Henüz anket oluşturulmamış.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stats.map(s => (
            <StatCard key={s.surveyId} survey={s} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Anket Oluşturma Formu ────────────────────────────────────────────────────

interface DraftQuestion {
  key:   string;
  label: string;
  type:  QuestionType;
}

function CreateSurveyForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel:  () => void;
}) {
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [questions, setQuestions]   = useState<DraftQuestion[]>([
    { key: 'q1', label: '', type: 'emoji' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  function addQuestion() {
    setQuestions(qs => [...qs, { key: `q${qs.length + 1}`, label: '', type: 'rating' }]);
  }

  function removeQuestion(idx: number) {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  }

  async function handleCreate() {
    if (!title.trim() || !description.trim()) {
      setError('Başlık ve açıklama zorunludur.');
      return;
    }
    if (questions.some(q => !q.label.trim())) {
      setError('Tüm soru metinleri doldurulmalıdır.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/pulse/surveys', { title, description, questions });
      onCreated();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-brand-black">Yeni Nabız Anketi</h3>
        <button onClick={onCancel} className="text-xs text-brand-gray hover:text-brand-black">İptal</button>
      </div>

      {/* Başlık */}
      <div>
        <label className="block text-xs font-semibold text-brand-black mb-1.5">Anket Başlığı</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="örn: Mayıs Ayı Nabız Anketi"
          className="w-full px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
            focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
        />
      </div>

      {/* Açıklama */}
      <div>
        <label className="block text-xs font-semibold text-brand-black mb-1.5">
          Anket Açıklaması
          <span className="text-brand-gray font-normal ml-1">(Personele gösterilir)</span>
        </label>
        <textarea
          value={description}
          onChange={e => setDesc(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Bu anketin amacını veya personelin neye dikkat etmesi gerektiğini yazın..."
          className="w-full px-4 py-3 text-sm rounded-xl border border-brand-border bg-brand-lightGray
            focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red resize-none"
        />
        <p className="text-[10px] text-brand-gray/50 text-right mt-0.5">{description.length}/500</p>
      </div>

      {/* Sorular */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-brand-black">Sorular</p>
        {questions.map((q, idx) => (
          <div key={idx} className="flex items-center gap-2 p-3 rounded-xl bg-brand-lightGray border border-brand-border">
            <span className="text-xs font-bold text-brand-gray shrink-0 w-5 text-center">{idx + 1}</span>
            <input
              value={q.label}
              onChange={e => updateQuestion(idx, { label: e.target.value })}
              placeholder="Soru metni"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-brand-border bg-white
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            />
            <select
              value={q.type}
              onChange={e => updateQuestion(idx, { type: e.target.value as QuestionType })}
              className="px-2 py-2 text-xs rounded-lg border border-brand-border bg-white
                focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            >
              <option value="emoji">😊 Emoji</option>
              <option value="rating">1-5 Puan</option>
            </select>
            {questions.length > 1 && (
              <button
                onClick={() => removeQuestion(idx)}
                className="shrink-0 text-brand-gray hover:text-brand-red transition-colors text-sm"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addQuestion}
          className="text-xs text-brand-red font-semibold hover:underline"
        >
          + Soru Ekle
        </button>
      </div>

      {error && (
        <p className="text-sm text-brand-red bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>
      )}

      <button
        onClick={handleCreate}
        disabled={submitting}
        className="w-full bg-brand-red hover:bg-brand-redDark text-white font-bold text-sm
          py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {submitting ? 'Oluşturuluyor...' : 'Anketi Yayınla'}
      </button>
    </div>
  );
}

// ─── İstatistik Kartı ─────────────────────────────────────────────────────────

function StatCard({
  survey,
  onToggle,
}: {
  survey:   StatSurvey;
  onToggle: (id: number, isActive: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
      {/* Başlık satırı */}
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-brand-lightGray transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-brand-black text-sm">{survey.title}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              survey.isActive ? 'bg-green-100 text-green-700' : 'bg-brand-lightGray text-brand-gray'
            }`}>
              {survey.isActive ? 'Aktif' : 'Kapalı'}
            </span>
          </div>
          <p className="text-[11px] text-brand-gray mt-0.5">
            {new Date(survey.createdAt).toLocaleDateString('tr-TR')} · {survey.totalResponses} yanıt
          </p>
        </div>

        <button
          onClick={e => { e.stopPropagation(); onToggle(survey.surveyId, !survey.isActive); }}
          className={`shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            survey.isActive
              ? 'border-brand-gray/30 text-brand-gray hover:border-brand-red hover:text-brand-red'
              : 'border-green-300 text-green-600 hover:bg-green-50'
          }`}
        >
          {survey.isActive ? 'Kapat' : 'Aç'}
        </button>

        <span className="text-brand-gray text-sm">{open ? '▲' : '▼'}</span>
      </div>

      {/* Detaylar */}
      {open && (
        <div className="border-t border-brand-border px-5 py-4 space-y-4">
          {/* Açıklama */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-amber-700 mb-0.5">Anket Açıklaması</p>
            <p className="text-xs text-amber-900 leading-relaxed">{survey.description}</p>
          </div>

          {/* Katılım + Ortalamalar */}
          {survey.totalResponses === 0 ? (
            <p className="text-xs text-brand-gray text-center py-4">Henüz yanıt yok.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {survey.avgByQuestion.map(q => (
                <div key={q.key} className="bg-brand-lightGray rounded-xl p-3">
                  <p className="text-[10px] text-brand-gray mb-1 leading-snug">{q.label}</p>
                  {q.avg !== null ? (
                    <>
                      <p className={`text-2xl font-extrabold ${ratingColor(q.avg)}`}>{q.avg.toFixed(1)}</p>
                      <p className="text-[10px] text-brand-gray/60">/5 · {q.count} yanıt</p>
                      <div className="mt-1.5 h-1 bg-brand-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ratingBg(q.avg)}`}
                          style={{ width: `${(q.avg / 5) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-lg text-brand-gray/40 font-bold">—</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Admin: Anket Oluşturma Paneli ────────────────────────────────────────────

function AdminCreatePanel({ storesList, onCreated }: { storesList: { storeId: number; storeName: string }[]; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDesc] = useState('');
  const [targetType, setTargetType] = useState<'chain' | 'store'>('chain');
  const [targetStoreIds, setTargetStoreIds] = useState<number[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ key: 'q1', label: '', type: 'emoji' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function addQuestion() { setQuestions(qs => [...qs, { key: `q${qs.length + 1}`, label: '', type: 'rating' }]); }
  function removeQuestion(idx: number) { setQuestions(qs => qs.filter((_, i) => i !== idx)); }
  function updateQuestion(idx: number, patch: Partial<DraftQuestion>) { setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q)); }

  async function handleCreate() {
    if (!title.trim() || !description.trim()) { setError('Başlık ve açıklama zorunludur.'); return; }
    if (questions.some(q => !q.label.trim())) { setError('Tüm soru metinleri doldurulmalıdır.'); return; }
    if (targetType === 'store' && targetStoreIds.length === 0) { setError('En az bir mağaza seçmelisiniz.'); return; }
    setSubmitting(true); setError('');
    try {
      await api.post('/pulse/admin/surveys', { title, description, questions, targetType, targetStoreIds: targetType === 'store' ? targetStoreIds : undefined });
      setSuccess('Anket başarıyla oluşturuldu!');
      setTitle(''); setDesc(''); setQuestions([{ key: 'q1', label: '', type: 'emoji' }]); setTargetStoreIds([]);
      onCreated();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message ?? 'Bir hata oluştu.');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-5 max-w-2xl">
      <h3 className="font-bold text-brand-black">📋 Yeni Nabız Anketi Oluştur</h3>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">✅ {success}</div>}

      {/* Hedef Kitle */}
      <div>
        <label className="block text-xs font-semibold text-brand-black mb-2">Hedef Kitle</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setTargetType('chain')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${targetType === 'chain' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-brand-gray border-brand-border hover:bg-brand-lightGray'}`}>
            🌐 Zincir Geneli
          </button>
          <button type="button" onClick={() => setTargetType('store')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${targetType === 'store' ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-brand-gray border-brand-border hover:bg-brand-lightGray'}`}>
            🏪 Mağaza Bazlı
          </button>
        </div>
      </div>

      {targetType === 'store' && (
        <div>
          <label className="block text-xs font-semibold text-brand-black mb-1.5">Mağaza Seçimi</label>
          <div className="flex flex-wrap gap-2">
            {storesList.map(s => (
              <button key={s.storeId} type="button"
                onClick={() => setTargetStoreIds(ids => ids.includes(s.storeId) ? ids.filter(id => id !== s.storeId) : [...ids, s.storeId])}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${targetStoreIds.includes(s.storeId) ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-brand-gray border-brand-border hover:bg-brand-lightGray'}`}>
                {s.storeName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-brand-black mb-1.5">Anket Başlığı</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="örn: Mayıs Ayı Nabız Anketi"
          className="w-full px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-brand-black mb-1.5">Anket Açıklaması</label>
        <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} maxLength={500} placeholder="Açıklama..."
          className="w-full px-4 py-3 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red resize-none" />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-brand-black">Sorular</p>
        {questions.map((q, idx) => (
          <div key={idx} className="flex items-center gap-2 p-3 rounded-xl bg-brand-lightGray border border-brand-border">
            <span className="text-xs font-bold text-brand-gray shrink-0 w-5 text-center">{idx + 1}</span>
            <input value={q.label} onChange={e => updateQuestion(idx, { label: e.target.value })} placeholder="Soru metni"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-brand-border bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/30" />
            <select value={q.type} onChange={e => updateQuestion(idx, { type: e.target.value as QuestionType })}
              className="px-2 py-2 text-xs rounded-lg border border-brand-border bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/30">
              <option value="emoji">😊 Emoji</option>
              <option value="rating">1-5 Puan</option>
            </select>
            {questions.length > 1 && <button onClick={() => removeQuestion(idx)} className="shrink-0 text-brand-gray hover:text-brand-red text-sm">✕</button>}
          </div>
        ))}
        <button onClick={addQuestion} className="text-xs text-brand-red font-semibold hover:underline">+ Soru Ekle</button>
      </div>

      {error && <p className="text-sm text-brand-red bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}
      <button onClick={handleCreate} disabled={submitting}
        className="w-full bg-brand-red hover:bg-brand-redDark text-white font-bold text-sm py-3 rounded-xl transition-colors disabled:opacity-50">
        {submitting ? 'Oluşturuluyor...' : 'Anketi Yayınla'}
      </button>
    </div>
  );
}

// ─── Admin: Sonuçlar Paneli ───────────────────────────────────────────────────

function AdminStatsPanel({ stats, onToggle }: { stats: AdminStatSurvey[] | null | undefined; onToggle: (id: number, isActive: boolean) => void }) {
  if (!stats) return <SkeletonList />;
  if (stats.length === 0) return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-10 text-center">
      <p className="text-4xl mb-3">📊</p>
      <p className="font-bold text-brand-black">Henüz anket sonucu yok</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {stats.map(s => (
        <AdminStatCard key={s.surveyId} survey={s} onToggle={onToggle} />
      ))}
    </div>
  );
}

function AdminStatCard({ survey, onToggle }: { survey: AdminStatSurvey; onToggle: (id: number, isActive: boolean) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-brand-lightGray transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-brand-black text-sm">{survey.title}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${survey.isActive ? 'bg-green-100 text-green-700' : 'bg-brand-lightGray text-brand-gray'}`}>
              {survey.isActive ? 'Aktif' : 'Kapalı'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">
              📍 {survey.storeName}
            </span>
          </div>
          <p className="text-[11px] text-brand-gray mt-0.5">
            {new Date(survey.createdAt).toLocaleDateString('tr-TR')} · {survey.totalResponses} yanıt · {survey.createdBy}
          </p>
        </div>
        <button onClick={e => { e.stopPropagation(); onToggle(survey.surveyId, !survey.isActive); }}
          className={`shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${survey.isActive ? 'border-brand-gray/30 text-brand-gray hover:border-brand-red hover:text-brand-red' : 'border-green-300 text-green-600 hover:bg-green-50'}`}>
          {survey.isActive ? 'Kapat' : 'Aç'}
        </button>
        <span className="text-brand-gray text-sm">{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="border-t border-brand-border px-5 py-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-amber-700 mb-0.5">Anket Açıklaması</p>
            <p className="text-xs text-amber-900 leading-relaxed">{survey.description}</p>
          </div>

          {survey.totalResponses === 0 ? (
            <p className="text-xs text-brand-gray text-center py-4">Henüz yanıt yok.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {survey.avgByQuestion.map(q => (
                  <div key={q.key} className="bg-brand-lightGray rounded-xl p-3">
                    <p className="text-[10px] text-brand-gray mb-1 leading-snug">{q.label}</p>
                    {q.avg !== null ? (
                      <>
                        <p className={`text-2xl font-extrabold ${ratingColor(q.avg)}`}>{q.avg.toFixed(1)}</p>
                        <p className="text-[10px] text-brand-gray/60">/5 · {q.count} yanıt</p>
                        <div className="mt-1.5 h-1 bg-brand-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${ratingBg(q.avg)}`} style={{ width: `${(q.avg / 5) * 100}%` }} />
                        </div>
                      </>
                    ) : <p className="text-lg text-brand-gray/40 font-bold">—</p>}
                  </div>
                ))}
              </div>

              {/* Mağaza Bazlı Kırılım */}
              {survey.storeBreakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-brand-black mb-2">🏪 Mağaza Bazlı Kırılım</p>
                  <div className="space-y-2">
                    {survey.storeBreakdown.sort((a, b) => b.avgRating - a.avgRating).map(sb => (
                      <div key={sb.storeName} className="flex items-center gap-3 bg-brand-lightGray rounded-xl px-4 py-2.5">
                        <span className="text-xs font-semibold text-brand-black flex-1">{sb.storeName}</span>
                        <span className="text-[10px] text-brand-gray">{sb.count} yanıt</span>
                        <span className={`text-sm font-bold ${ratingColor(sb.avgRating)}`}>{sb.avgRating.toFixed(1)}</span>
                        <div className="w-20 h-1.5 bg-brand-border rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${ratingBg(sb.avgRating)}`} style={{ width: `${(sb.avgRating / 5) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton'lar ─────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="space-y-3 max-w-2xl">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-brand-border p-5 h-20 animate-pulse" />
      ))}
    </div>
  );
}

function SkeletonForm() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="h-10 bg-white rounded-2xl border border-brand-border animate-pulse" />
      <div className="h-24 bg-white rounded-2xl border border-brand-border animate-pulse" />
      <div className="h-40 bg-white rounded-2xl border border-brand-border animate-pulse" />
    </div>
  );
}
