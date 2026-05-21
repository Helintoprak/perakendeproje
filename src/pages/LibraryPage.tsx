import { useState, useRef, FormEvent } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface LibraryItem {
  id: number;
  title: string;
  fileUrl: string;
  fileType: string;
  createdAt: string;
  uploader: { userId: number; fullName: string };
}

interface LibraryResponse {
  items: LibraryItem[];
  total: number;
  page: number;
  limit: number;
}

const FILE_ICONS: Record<string, string> = {
  pdf:   '📄',
  pptx:  '📊',
  ppt:   '📊',
  video: '🎬',
  mp4:   '🎬',
  webm:  '🎬',
  mov:   '🎬',
};

function fileIcon(type: string) {
  return FILE_ICONS[type.toLowerCase()] ?? '📁';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LibraryPage() {
  const { isAdmin, isManager, isRegionalManager } = useAuth();
  const canManage = isAdmin || isManager || isRegionalManager;

  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage]           = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const query = new URLSearchParams({
    page:     String(page),
    limit:    '20',
    ...(search     ? { search }            : {}),
    ...(typeFilter ? { fileType: typeFilter } : {}),
  }).toString();

  const { data, loading, refetch } = useApi<LibraryResponse>(`/library?${query}`);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  function handleTypeFilter(val: string) {
    setTypeFilter(val);
    setPage(1);
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`"${title}" dosyasını kütüphaneden silmek istediğinize emin misiniz?`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/library/${id}`);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Silme başarısız.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-brand-black tracking-tight">
            Eğitim Kütüphanesi
          </h1>
          <p className="text-sm lg:text-base text-brand-gray font-medium mt-1">
            Merkezi eğitim dokümanları — {total} dosya
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowUpload(s => !s)}
            className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold
              px-6 py-3 rounded-2xl transition-all shadow-lg hover:shadow-xl active:scale-95
              flex items-center justify-center gap-2"
          >
            {showUpload ? '✕ İptal' : <><span className="text-xl">+</span> Dosya Yükle</>}
          </button>
        )}
      </div>

      {/* Yükleme formu */}
      {showUpload && canManage && (
        <UploadForm onSuccess={() => { setShowUpload(false); refetch(); }} />
      )}

      {/* Arama + filtre */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Dosya adı ara..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-white
            focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
        />
        <select
          value={typeFilter}
          onChange={e => handleTypeFilter(e.target.value)}
          className="px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-white
            focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
        >
          <option value="">Tüm Tipler</option>
          <option value="pdf">PDF</option>
          <option value="pptx">PPTX</option>
          <option value="video">Video</option>
        </select>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-5xl block mb-3">📚</span>
            <p className="font-bold text-brand-black">Kütüphane boş</p>
            <p className="text-sm text-brand-gray mt-1">
              {canManage ? '"Dosya Yükle" ile ilk dokümanı ekleyin.' : 'Henüz doküman eklenmemiş.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-lightGray border-b border-brand-border text-xs font-black uppercase tracking-wider text-brand-gray">
                    <th className="text-left px-5 py-3">Dosya</th>
                    <th className="text-left px-4 py-3">Tip</th>
                    <th className="text-left px-4 py-3">Yükleyen</th>
                    <th className="text-left px-4 py-3">Tarih</th>
                    <th className="text-center px-4 py-3">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id}
                      className={`border-b border-brand-border/50 ${i % 2 === 0 ? '' : 'bg-brand-lightGray/40'}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{fileIcon(item.fileType)}</span>
                          <span className="font-semibold text-brand-black truncate max-w-[280px]">{item.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="uppercase text-xs font-bold text-brand-gray bg-brand-lightGray px-2 py-0.5 rounded-md">
                          {item.fileType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-brand-gray">{item.uploader.fullName}</td>
                      <td className="px-4 py-3 text-brand-gray">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <a
                            href={item.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-bold text-brand-red border border-brand-red/30 bg-brand-redLight hover:bg-brand-red hover:text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Görüntüle
                          </a>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(item.id, item.title)}
                              disabled={deletingId === item.id}
                              className="inline-flex items-center gap-1 text-xs font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {deletingId === item.id
                                ? <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                : '🗑'} Sil
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sayfalama */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-brand-border">
                <p className="text-xs text-brand-gray">{total} dosyadan {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} arası</p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-brand-border disabled:opacity-40 hover:bg-brand-lightGray transition-colors"
                  >
                    ← Önceki
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-brand-border disabled:opacity-40 hover:bg-brand-lightGray transition-colors"
                  >
                    Sonraki →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Yükleme Formu ───────────────────────────────────────────────────────────

function UploadForm({ onSuccess }: { onSuccess: () => void }) {
  const [title, setTitle]   = useState('');
  const [file, setFile]     = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file)        { setError('Lütfen bir dosya seçin.');      return; }
    if (!title.trim()) { setError('Lütfen bir başlık girin.');     return; }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file',  file);
      fd.append('title', title.trim());
      await api.post('/library', fd);
      setSuccess('Dosya kütüphaneye eklendi.');
      setTimeout(() => { setSuccess(''); onSuccess(); }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Yükleme başarısız.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-4">
      <h3 className="font-bold text-brand-black flex items-center gap-2">
        <span>📁</span> Kütüphaneye Dosya Yükle
      </h3>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-brand-red rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-brand-black mb-1.5">
            Başlık <span className="text-brand-red">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="ör. Ürün Bilgisi — Sonbahar 2025"
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
              focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-black mb-1.5">
            Dosya <span className="text-brand-red">*</span>
            <span className="ml-1 font-normal text-brand-gray">(PDF, PPTX veya Video)</span>
          </label>
          <label className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            file ? 'border-brand-red bg-brand-redLight' : 'border-brand-border bg-brand-lightGray hover:border-brand-red'
          }`}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.pptx,.ppt,.mp4,.webm,.mov,video/*"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-2xl">
              {file ? (file.name.endsWith('.pdf') ? '📄' : file.type.startsWith('video/') ? '🎬' : '📊') : '📁'}
            </span>
            <div className="flex-1 min-w-0">
              {file ? (
                <>
                  <p className="text-sm font-semibold text-brand-black truncate">{file.name}</p>
                  <p className="text-xs text-brand-gray">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <p className="text-sm text-brand-gray">Dosya seçmek için tıklayın</p>
              )}
            </div>
            {file && (
              <button type="button"
                onClick={e => { e.preventDefault(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-brand-gray hover:text-brand-red text-lg shrink-0">✕
              </button>
            )}
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold px-8 py-2.5 rounded-xl
              transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2"
          >
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Yükleniyor...' : 'Kütüphaneye Ekle'}
          </button>
        </div>
      </form>
    </div>
  );
}
