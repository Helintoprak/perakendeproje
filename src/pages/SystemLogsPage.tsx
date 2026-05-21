import { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface AssignmentLog {
  assignmentId: number;
  assignedDate: string;
  deadline: string | null;
  isMandatory: boolean;
  course: { courseId: number; title: string };
  user: { userId: number; fullName: string; store: { storeId: number; storeName: string } | null };
}

interface FeedbackLog {
  feedbackId: number;
  createdAt: string;
  subject: string;
  rating: number | null;
  evaluator: { userId: number; fullName: string; store: { storeId: number; storeName: string } | null } | null;
  targetUser: { userId: number; fullName: string } | null;
  category: { categoryName: string } | null;
}

interface LogsResponse {
  assignments: AssignmentLog[];
  assignmentsTotal: number;
  feedbacks: FeedbackLog[];
  feedbacksTotal: number;
  page: number;
  limit: number;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function RatingStars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-xs text-brand-gray/40">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`text-xs ${i <= rating ? 'text-amber-400' : 'text-brand-gray/20'}`}>★</span>
      ))}
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function SystemLogsPage() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/home" replace />;

  const [tab,      setTab]      = useState<'assignments' | 'feedback'>('assignments');
  const [search,   setSearch]   = useState('');
  const [storeId,  setStoreId]  = useState<string>('');
  const [page,     setPage]     = useState(1);

  const LIMIT = 30;

  const params = useMemo(() => ({
    type:    tab,
    search:  search.trim(),
    storeId: storeId || undefined,
    page,
    limit:   LIMIT,
  }), [tab, search, storeId, page]);

  const { data, loading } = useApi<LogsResponse>('/logs', params);
  const { data: storesList } = useApi<{ storeId: number; storeName: string }[]>('/performance/stores-list');

  const totalItems = tab === 'assignments'
    ? (data?.assignmentsTotal ?? 0)
    : (data?.feedbacksTotal ?? 0);

  const totalPages = Math.max(1, Math.ceil(totalItems / LIMIT));

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  function handleStore(val: string) {
    setStoreId(val);
    setPage(1);
  }

  function handleTab(t: 'assignments' | 'feedback') {
    setTab(t);
    setPage(1);
    setSearch('');
  }

  return (
    <div className="space-y-6">

      {/* Başlık */}
      <div className="bg-gradient-to-r from-brand-red to-brand-redDark rounded-2xl p-5 lg:p-6 text-white">
        <p className="text-white/70 text-xs font-medium uppercase tracking-wider mb-1">Sistem Yönetimi</p>
        <h2 className="text-xl font-extrabold">📋 Sistem Logları</h2>
        <p className="text-white/70 text-sm mt-0.5">Müdür eğitim atamaları ve geri bildirim geçmişi</p>
      </div>

      {/* Kontroller */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        {/* Tab */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-brand-border shadow-card">
          <button
            onClick={() => handleTab('assignments')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'assignments'
                ? 'bg-brand-red text-white shadow-sm'
                : 'text-brand-gray hover:text-brand-black'
            }`}
          >
            📚 Eğitim Atamaları
            {data && <span className="ml-1.5 opacity-70">({data.assignmentsTotal})</span>}
          </button>
          <button
            onClick={() => handleTab('feedback')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'feedback'
                ? 'bg-brand-red text-white shadow-sm'
                : 'text-brand-gray hover:text-brand-black'
            }`}
          >
            💬 Geri Bildirimler
            {data && <span className="ml-1.5 opacity-70">({data.feedbacksTotal})</span>}
          </button>
        </div>

        {/* Mağaza filtresi */}
        <select
          value={storeId}
          onChange={e => handleStore(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-white shadow-card focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red min-w-[180px]"
        >
          <option value="">Tüm Mağazalar</option>
          {(storesList ?? []).map(s => (
            <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
          ))}
        </select>

        {/* Arama */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray text-sm">🔍</span>
          <input
            type="text"
            placeholder={tab === 'assignments' ? 'Personel veya eğitim ara…' : 'Kişi veya konu ara…'}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-brand-border bg-white shadow-card focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
          />
        </div>
      </div>

      {/* İçerik */}
      {loading ? (
        <LoadingSkeleton />
      ) : tab === 'assignments' ? (
        <AssignmentsTable rows={data?.assignments ?? []} />
      ) : (
        <FeedbackTable rows={data?.feedbacks ?? []} />
      )}

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-brand-gray">
            Sayfa {page} / {totalPages} · Toplam {totalItems} kayıt
          </p>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-brand-border bg-white hover:bg-brand-lightGray disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Önceki
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-8 h-8 text-xs font-bold rounded-lg border transition-colors ${
                    pg === page
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'border-brand-border bg-white hover:bg-brand-lightGray text-brand-gray'
                  }`}
                >
                  {pg}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-brand-border bg-white hover:bg-brand-lightGray disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sonraki →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Eğitim Atamaları Tablosu ─────────────────────────────────────────────────

function AssignmentsTable({ rows }: { rows: AssignmentLog[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-brand-border shadow-card">
        <span className="text-4xl block mb-3">📚</span>
        <p className="font-bold text-brand-black">Eğitim ataması bulunamadı</p>
        <p className="text-sm text-brand-gray mt-1">Farklı filtre veya arama deneyin.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-lightGray">
              <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">#</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Personel</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Mağaza</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Eğitim</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Zorunlu</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Atanma Tarihi</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Son Tarih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {rows.map(row => (
              <tr key={row.assignmentId} className="hover:bg-brand-lightGray/50 transition-colors">
                <td className="px-5 py-3 text-xs text-brand-gray/60">{row.assignmentId}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {row.user.fullName.charAt(0)}
                    </div>
                    <span className="font-semibold text-brand-black text-xs">{row.user.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-brand-gray">{row.user.store?.storeName ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-brand-black">{row.course.title}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {row.isMandatory
                    ? <span className="inline-block px-2 py-0.5 bg-brand-red/10 text-brand-red text-[10px] font-bold rounded-full border border-brand-red/20">Zorunlu</span>
                    : <span className="inline-block px-2 py-0.5 bg-brand-gray/10 text-brand-gray text-[10px] font-semibold rounded-full">İsteğe Bağlı</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-brand-gray whitespace-nowrap">{formatDate(row.assignedDate)}</td>
                <td className="px-4 py-3 text-xs text-brand-gray whitespace-nowrap">
                  {row.deadline ? formatDateShort(row.deadline) : <span className="text-brand-gray/40">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Geri Bildirim Tablosu ────────────────────────────────────────────────────

function FeedbackTable({ rows }: { rows: FeedbackLog[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-brand-border shadow-card">
        <span className="text-4xl block mb-3">💬</span>
        <p className="font-bold text-brand-black">Geri bildirim bulunamadı</p>
        <p className="text-sm text-brand-gray mt-1">Farklı filtre veya arama deneyin.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-lightGray">
              <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">#</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Müdür</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Mağaza</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Personel</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray">Konu</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Kategori</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Puan</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-brand-gray whitespace-nowrap">Tarih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {rows.map(row => (
              <tr key={row.feedbackId} className="hover:bg-brand-lightGray/50 transition-colors">
                <td className="px-5 py-3 text-xs text-brand-gray/60">{row.feedbackId}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {row.evaluator?.fullName.charAt(0) ?? '?'}
                    </div>
                    <span className="font-semibold text-brand-black text-xs">{row.evaluator?.fullName ?? '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-brand-gray">{row.evaluator?.store?.storeName ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-brand-black">{row.targetUser?.fullName ?? '—'}</span>
                </td>
                <td className="px-4 py-3 max-w-[200px]">
                  <p className="text-xs text-brand-black truncate" title={row.subject}>{row.subject}</p>
                </td>
                <td className="px-4 py-3">
                  {row.category
                    ? <span className="inline-block px-2 py-0.5 bg-brand-lightGray text-brand-gray text-[10px] font-semibold rounded-full border border-brand-border">{row.category.categoryName}</span>
                    : <span className="text-xs text-brand-gray/40">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  <RatingStars rating={row.rating} />
                </td>
                <td className="px-4 py-3 text-xs text-brand-gray whitespace-nowrap">{formatDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Yükleniyor ───────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden animate-pulse">
      <div className="px-5 py-3 border-b border-brand-border bg-brand-lightGray h-10" />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-4 px-5 py-3 border-b border-brand-border">
          <div className="h-5 w-8 bg-brand-lightGray rounded" />
          <div className="h-5 w-32 bg-brand-lightGray rounded" />
          <div className="h-5 w-24 bg-brand-lightGray rounded" />
          <div className="h-5 w-40 bg-brand-lightGray rounded" />
          <div className="h-5 w-16 bg-brand-lightGray rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}
