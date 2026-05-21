
import React, { useState, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

interface StoreUser {
  userId: number;
  fullName: string;
  role: { roleName: string };
  store?: { storeName: string };
}

interface Category {
  categoryId: number;
  categoryName: string;
  description?: string | null;
}

interface FeedbackItem {
  feedbackId: number;
  subject: string;
  message: string;
  createdAt: string;
  category: Category | null;
  user: { fullName: string; role: { roleName: string } } | null;
  targetUser: { fullName: string; role: { roleName: string } } | null;
  fileUrl?: string;
  fileName?: string;
}

function getCatColor(name: string) {
  const n = (name || '').toLowerCase();

  // Pozitif → Yeşil
  if (n.includes('pozitif') || n.includes('tebrik')) {
    return { dot: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', btnActive: 'bg-green-600 text-white border-green-600' };
  }
  // Yapıcı → Sarı/Turuncu (amber)
  if (n.includes('yapıcı') || n.includes('yapici')) {
    return { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', btnActive: 'bg-amber-500 text-white border-amber-500' };
  }
  // Odaklanmış → Mavi
  if (n.includes('odakl')) {
    return { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', btnActive: 'bg-blue-600 text-white border-blue-600' };
  }
  // Geriye dönük uyum
  if (n.includes('uyarı') || n.includes('negatif')) {
    return { dot: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', btnActive: 'bg-red-600 text-white border-red-600' };
  }
  if (n.includes('eğitim')) {
    return { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', btnActive: 'bg-blue-600 text-white border-blue-600' };
  }
  return { dot: 'bg-brand-gray', bg: 'bg-brand-lightGray', text: 'text-brand-gray', border: 'border-brand-border', btnActive: 'bg-brand-black text-white border-brand-black' };
}

function getTemplateMessage(categoryName: string): string {
  const n = (categoryName || '').toLowerCase();

  if (n.includes('pozitif') || n.includes('tebrik')) {
    return 'Göstermiş olduğunuz başarılı performans, özverili çalışma ve mağazaya kattığınız pozitif enerji için teşekkür ederiz. Başarılarınızın devamını dilerim!';
  }
  if (n.includes('yapıcı') || n.includes('yapici')) {
    return 'Mevcut çalışmalarınız gayet iyi, ancak operasyonel süreçlerin daha verimli ilerlemesi adına eksik görülen noktaların tamamlanmasını ve süreç takibine biraz daha dikkat edilmesini rica ederim.';
  }
  if (n.includes('odakl')) {
    return 'Bu dönem belirlenen öncelikli hedeflere, süreç takibine ve mağaza içi kritik operasyonlara tam odaklanma göstermenizi bekliyorum. Çalışmalarınızda kolaylıklar.';
  }
  return '';
}

function FileAttachment({ url, name }: { url: string; name: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-brand-lightGray rounded border border-brand-border text-[10px] font-bold text-brand-red hover:bg-brand-red/5 transition-colors">
      <span>📎</span> {name}
    </a>
  );
}

function ReceivedPanel({ feedbacks }: { feedbacks: FeedbackItem[] | null }) {
  return (
    <div className="bg-white rounded-xl border border-brand-border shadow-md overflow-hidden">
      <div className="px-6 py-4 bg-brand-lightGray border-b border-brand-border flex items-center justify-between">
        <h3 className="font-bold text-brand-black flex items-center gap-2"><span>📥</span> Bana Gelen Geri Bildirimler</h3>
        <p className="text-[10px] text-brand-gray font-bold uppercase tracking-wider">Yönetimden Gelenler</p>
      </div>
      {!feedbacks || feedbacks.length === 0 ? (
        <div className="py-16 text-center text-brand-gray">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-sm font-semibold">Henüz size iletilmiş bir geri bildirim bulunmuyor.</p>
        </div>
      ) : (
        <div className="divide-y divide-brand-border">
          {feedbacks.map(fb => {
            const catColor = getCatColor(fb.category?.categoryName || '');
            return (
              <div key={fb.feedbackId} className="p-5 hover:bg-brand-lightGray/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-red/10 flex items-center justify-center text-sm font-bold text-brand-red border border-brand-red/20">
                      {fb.user?.fullName?.charAt(0) || 'Y'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-black">{fb.user?.fullName || 'Yönetici'}</p>
                      <p className="text-[10px] text-brand-gray font-bold uppercase">{fb.user?.role?.roleName || 'Yönetim'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {fb.category && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${catColor.dot}`} />{fb.category.categoryName}
                      </span>
                    )}
                    <span className="text-[10px] text-brand-gray">
                      {new Date(fb.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
                <div className="pl-12">
                  <p className="text-sm font-semibold text-brand-black">{fb.subject}</p>
                  <p className="text-xs text-brand-gray mt-1 line-clamp-2">{fb.message}</p>
                  {fb.fileUrl && fb.fileName && <FileAttachment url={fb.fileUrl} name={fb.fileName} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FeedbackPage() {
  const { isManager, isRegionalManager, isAdmin } = useAuth();
  const canSend = isAdmin || isManager || isRegionalManager;

  // All hooks called unconditionally (React rules of hooks)
  const { data: storeUsers }                        = useApi<StoreUser[]>(canSend ? '/feedback/store-users' : '');
  const { data: categories }                        = useApi<Category[]>('/feedback/categories');
  const { data: sentFeedbacks, refetch: refetchSent } = useApi<FeedbackItem[]>(canSend ? '/feedback/sent' : '');
  const { data: receivedFeedbacks }                 = useApi<FeedbackItem[]>('/feedback/received');

  const [activeTab, setActiveTab]         = useState<'send' | 'received'>('send');
  const [categoryId, setCategoryId]       = useState<number | null>(null);
  const [subject, setSubject]             = useState('');
  const [message, setMessage]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [file, setFile]                   = useState<{ name: string; url: string } | null>(null);
  const [selectedUser, setSelectedUser]   = useState<StoreUser | null>(null);
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [storeFilter, setStoreFilter]     = useState<string>('');

  const users = storeUsers || [];
  const cats  = categories || [];

  // Admin için benzersiz mağaza listesi
  const storeOptions = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, string>();
    users.forEach(u => { if (u.store?.storeName) map.set(u.store.storeName, u.store.storeName); });
    return [...map.keys()].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [users, isAdmin]);

  const searchPlaceholder = isAdmin ? 'Personel ara...' : 'Personel ara...';

  const filteredUsers = useMemo(() => {
    const q = personnelSearch.trim().toLocaleLowerCase('tr');
    return users.filter(u => {
      if (isAdmin && storeFilter && u.store?.storeName !== storeFilter) return false;
      if (q && !u.fullName.toLocaleLowerCase('tr').includes(q)) return false;
      return true;
    });
  }, [users, personnelSearch, storeFilter, isAdmin]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const selectedFile = e.target.files[0];
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    try {
      const res = await api.post('/feedback/upload', formData);
      setFile({ name: res.data.fileName, url: res.data.fileUrl });
      toast.success('Dosya yüklendi');
    } catch {
      toast.error('Dosya yüklenemedi');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !categoryId || !subject || !message) {
      toast.error('Lütfen tüm alanları doldurun');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/feedback', {
        targetUserId: selectedUser.userId,
        categoryId,
        subject,
        message,
        direction: 'down',
        fileUrl:   file?.url,
        fileName:  file?.name,
      });
      toast.success('Geri bildirim başarıyla gönderildi');
      setSubject(''); setMessage(''); setCategoryId(null); setFile(null); setSelectedUser(null);
      refetchSent();
    } catch {
      toast.error('Geri bildirim gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Satış Danışmanı: sadece gelen bildirimler ────────────────────────────────
  if (!canSend) {
    return (
      <div className="space-y-6">
        <ReceivedPanel feedbacks={receivedFeedbacks} />
      </div>
    );
  }

  // ─── Admin / Müdür: tam gönderim arayüzü ─────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Tab Navigation
          Admin: "Bana Gelenler" gizli — Admin'e geri bildirim gönderen üst rol yok,
                 doğrudan tek görünüm (gönderim) gösterilir.
          Diğer roller (Müdür, Bölge Müdürü): her iki sekme de görünür. */}
      {!isAdmin && (
        <div className="flex items-center gap-2 p-1 bg-brand-lightGray rounded-2xl w-fit border border-brand-border shadow-sm">
          <button
            onClick={() => setActiveTab('send')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'send' ? 'bg-white text-brand-red shadow-md' : 'text-brand-gray hover:text-brand-black'}`}
          >
            📤 Ekibim (Geri Bildirim Yaz)
          </button>
          <button
            onClick={() => setActiveTab('received')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'received' ? 'bg-white text-brand-red shadow-md' : 'text-brand-gray hover:text-brand-black'}`}
          >
            📥 Bana Gelenler{receivedFeedbacks && receivedFeedbacks.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-brand-red text-white text-[10px] rounded-full">{receivedFeedbacks.length}</span>
            )}
          </button>
        </div>
      )}

      {/* Received Tab — Admin için hiçbir koşulda render edilmez */}
      {!isAdmin && activeTab === 'received' && <ReceivedPanel feedbacks={receivedFeedbacks} />}

      {/* Send Tab — Admin için her zaman aktif (sekme yok), diğer roller için seçime bağlı */}
      {(isAdmin || activeTab === 'send') && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Personel Listesi */}
            <div className="lg:w-80 shrink-0">
              <div className="bg-white rounded-xl border border-brand-border shadow-md overflow-hidden">
                <div className="px-4 py-3 bg-brand-lightGray border-b border-brand-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-brand-black">👥 Personel Listesi</h3>
                    <span className="text-[10px] font-bold text-brand-gray bg-white border border-brand-border px-2 py-0.5 rounded-full">
                      {filteredUsers.length}/{users.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-brand-gray mt-0.5">Geri bildirim göndermek için bir personel seçin</p>
                  {isAdmin && storeOptions.length > 0 && (
                    <select
                      value={storeFilter}
                      onChange={e => { setStoreFilter(e.target.value); setSelectedUser(null); }}
                      className="mt-2 w-full px-2 py-1.5 text-xs rounded-lg border border-brand-border bg-white text-brand-black
                        focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                    >
                      <option value="">🏢 Tüm Mağazalar</option>
                      {storeOptions.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Canlı arama — isim, mağaza veya rol ile anlık filtreleme */}
                <div className="px-3 py-2.5 border-b border-brand-border bg-white">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray text-sm pointer-events-none">
                      🔍
                    </span>
                    <input
                      type="text"
                      value={personnelSearch}
                      onChange={e => setPersonnelSearch(e.target.value)}
                      placeholder={searchPlaceholder}
                      className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-brand-border bg-brand-lightGray text-brand-black placeholder-brand-gray
                        focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red focus:bg-white transition-colors"
                    />
                    {personnelSearch && (
                      <button
                        type="button"
                        onClick={() => setPersonnelSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-brand-gray hover:text-brand-red hover:bg-brand-red/5 transition-colors"
                        aria-label="Aramayı temizle"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-[480px] overflow-y-auto divide-y divide-brand-border">
                  {users.length === 0 ? (
                    <div className="text-center py-10 text-brand-gray text-sm">
                      <p className="text-2xl mb-2">👥</p>Personel bulunamadı
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-10 px-4 text-brand-gray text-sm">
                      <p className="text-2xl mb-2">🔍</p>
                      <p className="font-semibold text-brand-black">Sonuç yok</p>
                      <p className="text-xs mt-1">Aradığınız kriterlere uygun personel bulunamadı.</p>
                      <button
                        onClick={() => setPersonnelSearch('')}
                        className="mt-3 text-xs font-bold text-brand-red hover:underline"
                      >
                        Aramayı temizle
                      </button>
                    </div>
                  ) : filteredUsers.map(u => (
                    <button
                      key={u.userId}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all ${
                        selectedUser?.userId === u.userId
                          ? 'bg-brand-red/5 border-l-4 border-brand-red'
                          : 'hover:bg-brand-lightGray border-l-4 border-transparent'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 shadow-sm ${
                        selectedUser?.userId === u.userId ? 'bg-brand-red text-white' : 'bg-brand-lightGray text-brand-gray'
                      }`}>
                        {u.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold truncate ${selectedUser?.userId === u.userId ? 'text-brand-red' : 'text-brand-black'}`}>
                          {u.fullName}
                        </p>
                        <p className="text-[11px] text-brand-gray truncate">
                          {u.role.roleName}
                          {u.store?.storeName && <span className="text-brand-gray/70"> · {u.store.storeName}</span>}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Geri Bildirim Formu */}
            <div className="flex-1">
              {!selectedUser ? (
                <div className="bg-white rounded-xl border border-brand-border shadow-md flex items-center justify-center py-20">
                  <div className="text-center text-brand-gray">
                    <p className="text-4xl mb-3">💬</p>
                    <p className="font-bold text-brand-black">Personel Seçin</p>
                    <p className="text-sm mt-1">Listeden bir personel seçerek geri bildirim gönderebilirsiniz.</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-brand-border shadow-md p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-brand-red flex items-center justify-center text-white font-bold shadow-sm">
                      {selectedUser.fullName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-brand-black">{selectedUser.fullName}</h3>
                      <p className="text-xs text-brand-gray">{selectedUser.role.roleName} · Personelime bildirim gönder</p>
                    </div>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-brand-black mb-2">
                        Kategori <span className="text-brand-red">*</span>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {cats.map(cat => {
                          const colors = getCatColor(cat.categoryName);
                          const isActive = categoryId === cat.categoryId;
                          return (
                            <button
                              key={cat.categoryId}
                              type="button"
                              onClick={() => {
                                if (isActive) {
                                  setCategoryId(null);
                                  setMessage('');
                                } else {
                                  setCategoryId(cat.categoryId);
                                  setMessage(getTemplateMessage(cat.categoryName));
                                }
                              }}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                                isActive ? (colors.btnActive) : 'bg-white text-brand-gray border-brand-border hover:bg-brand-lightGray'
                              }`}
                              title={cat.description ?? ''}
                            >
                              <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-white/60' : colors.dot}`} />
                              {cat.categoryName}
                            </button>
                          );
                        })}
                      </div>
                      {/* Seçili kategorinin açıklaması — müdürün doğru tonu yakalamasına yardım eder */}
                      {(() => {
                        const sel = cats.find(c => c.categoryId === categoryId);
                        if (!sel?.description) return null;
                        const colors = getCatColor(sel.categoryName);
                        return (
                          <p className={`mt-2 text-xs px-3 py-2 rounded-lg border ${colors.bg} ${colors.text} ${colors.border}`}>
                            ℹ️ {sel.description}
                          </p>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-black mb-1.5">
                        Konu <span className="text-brand-red">*</span>
                      </label>
                      <input
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="Geri bildirim konusu"
                        required
                        className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-lightGray text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-brand-black mb-1.5">
                        Mesaj <span className="text-brand-red">*</span>
                      </label>
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="Detaylı geri bildirim yazın..."
                        required
                        rows={5}
                        className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-lightGray text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer w-fit text-brand-gray hover:text-brand-red transition-colors">
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                        <span className="text-xl">📎</span>
                        <span className="text-xs font-bold">{uploading ? 'Yükleniyor...' : 'Dosya Ekle'}</span>
                      </label>
                      {file && (
                        <div className="flex items-center gap-2 bg-brand-lightGray border border-brand-border rounded-lg px-3 py-1.5 w-fit">
                          <span className="text-xs font-bold text-brand-black truncate max-w-[200px]">{file.name}</span>
                          <button type="button" onClick={() => setFile(null)} className="text-brand-red font-bold text-sm">✕</button>
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || uploading || !subject.trim() || !message.trim() || !categoryId}
                      className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(179,0,0,0.2)]"
                    >
                      {submitting ? 'Gönderiliyor...' : '📨 Gönder'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* Gönderim Geçmişi */}
          <div className="bg-white rounded-xl border border-brand-border shadow-md overflow-hidden">
            <div className="px-6 py-4 bg-brand-lightGray border-b border-brand-border flex items-center justify-between">
              <h3 className="font-bold text-brand-black flex items-center gap-2"><span>📋</span> Gönderilen Geri Bildirimler</h3>
              <span className="text-[10px] font-bold text-brand-gray uppercase tracking-wider">Son 20 Kayıt</span>
            </div>
            <div className="divide-y divide-brand-border max-h-[600px] overflow-y-auto">
              {!sentFeedbacks || sentFeedbacks.length === 0 ? (
                <div className="py-12 text-center text-brand-gray">
                  <p className="text-3xl mb-2">📄</p>
                  <p className="text-sm">Henüz kayıt bulunmuyor.</p>
                </div>
              ) : sentFeedbacks.map(fb => {
                const catColor = getCatColor(fb.category?.categoryName || '');
                return (
                  <div key={fb.feedbackId} className="p-5 hover:bg-brand-lightGray/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-lightGray flex items-center justify-center text-xs font-bold text-brand-gray">
                          {fb.targetUser?.fullName.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-brand-black">{fb.targetUser?.fullName || '—'}</p>
                          <p className="text-[10px] text-brand-gray">{fb.targetUser?.role.roleName || ''}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {fb.category && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${catColor.bg} ${catColor.text} ${catColor.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${catColor.dot}`} />{fb.category.categoryName}
                          </span>
                        )}
                        <span className="text-[10px] text-brand-gray">
                          {new Date(fb.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                    <div className="pl-11">
                      <p className="text-sm font-semibold text-brand-black">{fb.subject}</p>
                      <p className="text-xs text-brand-gray mt-1 line-clamp-2">{fb.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
