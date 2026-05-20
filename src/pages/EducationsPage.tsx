import { useState, useRef, FormEvent, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface StoreUser {
  userId: number;
  fullName: string;
  role: { roleName: string };
  store?: { storeId: number; storeName: string } | null; // Admin için
}

interface AssignedUser {
  userId: number;
  fullName: string;
  role: { roleName: string };
}

interface Assignment {
  isMandatory: boolean;
  user: AssignedUser;
}

interface EducationAdmin {
  id: number;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploader: { fullName: string };
  assignments: Assignment[];
}

interface EducationUser {
  id: number;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploader: { fullName: string };
  isMandatory: boolean;
  assignmentId: number;
  viewedAt: string | null;
}

interface StoreCompletion {
  storeId: number;
  storeName: string;
  staffCount: number;
  totalAssignments: number;
  viewedCount: number;
  completionRate: number;
}

const FILE_ICONS: Record<string, string> = { pdf: '📄', pptx: '📊', ppt: '📊' };
const fileIcon = (name: string) => FILE_ICONS[name.split('.').pop()?.toLowerCase() ?? ''] ?? '📁';
const fileExt  = (name: string) => (name.split('.').pop() ?? '').toUpperCase();

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function EducationsPage() {
  const { isManager, isRegionalManager, isAdmin: isSysAdmin } = useAuth();
  const isManagerOrDeputy = isManager || isRegionalManager;
  const canManage  = isSysAdmin || isManagerOrDeputy;
  const canDelete  = isSysAdmin || isManager; // Yardımcı silemez

  // Admin: sadece 'uploaded' görünümü (öğrenci modu yok)
  // Manager/Deputy: iki sekme arası geçiş
  const [adminView, setAdminView] = useState<'uploaded' | 'assigned'>('uploaded');
  const effectiveView = isSysAdmin ? 'uploaded' : adminView;

  const endpoint = canManage
    ? (effectiveView === 'uploaded' ? '/educations/all' : '/educations')
    : '/educations';

  const { data: educations, loading, refetch } = useApi<any[]>(endpoint);
  const { data: storeUsers } = useApi<StoreUser[]>(canManage ? '/educations/store-users' : '');
  const { data: storeCompletion } = useApi<StoreCompletion[]>(isSysAdmin ? '/educations/stores-completion' : '');

  const [showUpload, setShowUpload]       = useState(false);
  const [file, setFile]                   = useState<File | null>(null);
  const [selectedIds, setSelectedIds]     = useState<Set<number>>(new Set());
  const [mandatoryIds, setMandatoryIds]   = useState<Set<number>>(new Set());
  const [search, setSearch]               = useState('');
  const [roleFilter, setRoleFilter]       = useState('');
  const [storeFilter, setStoreFilter]     = useState<number | ''>(''); // Admin mağaza filtresi
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [deleting, setDeleting]           = useState<number | null>(null);
  const [filterTab, setFilterTab]         = useState<'all' | 'mandatory' | 'optional'>('all');
  const [viewedIds, setViewedIds]         = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allEdu = educations ?? [];

  // Görüntülenmiş materyalleri başlangıçta işaretle (kullanıcı görünümü için)
  useMemo(() => {
    if (!canManage && educations) {
      const ids = new Set(
        (educations as EducationUser[]).filter((e) => e.viewedAt).map((e) => e.id)
      );
      setViewedIds(ids);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [educations]);

  const users = storeUsers ?? [];

  // Admin için benzersiz mağaza listesi (upload formunda filtre)
  const storeOptions = useMemo(() => {
    if (!isSysAdmin) return [];
    const map = new Map<number, string>();
    users.forEach((u) => { if (u.store) map.set(u.store.storeId, u.store.storeName); });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
      .map(([id, name]) => ({ storeId: id, storeName: name }));
  }, [users, isSysAdmin]);

  // Benzersiz roller
  const roleOptions = useMemo(
    () => [...new Set(users.map((u) => u.role.roleName))].sort(),
    [users]
  );

  // Kullanıcı filtresi: mağaza (Admin) + arama + rol
  const filteredUsers = useMemo(() => users.filter((u) => {
    const matchStore = !isSysAdmin || !storeFilter || u.store?.storeId === storeFilter;
    const matchName  = u.fullName.toLowerCase().includes(search.toLowerCase());
    const matchRole  = !roleFilter || u.role.roleName === roleFilter;
    return matchStore && matchName && matchRole;
  }), [users, search, roleFilter, storeFilter, isSysAdmin]);

  // showUserView: Normal kullanıcı VEYA Manager'ın "Bana Atananlar" sekmesi
  const showUserView = !canManage || (isManagerOrDeputy && effectiveView === 'assigned');

  const filteredEdu = useMemo(() => {
    if (!showUserView || filterTab === 'all') return allEdu;
    return allEdu.filter((e: EducationUser) =>
      filterTab === 'mandatory' ? e.isMandatory : !e.isMandatory
    );
  }, [allEdu, filterTab, showUserView]);

  const mandatoryCount = showUserView ? allEdu.filter((e: EducationUser) => e.isMandatory).length : 0;
  const optionalCount  = showUserView ? allEdu.filter((e: EducationUser) => !e.isMandatory).length : 0;

  // Toplu seçim
  function toggleAll() {
    const allSelected = filteredUsers.every((u) => selectedIds.has(u.userId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => allSelected ? next.delete(u.userId) : next.add(u.userId));
      return next;
    });
  }

  function toggleUser(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (!selectedIds.has(id)) return;
    setMandatoryIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function toggleMandatory(id: number) {
    setMandatoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRole(roleName: string) {
    const roleUsers = filteredUsers.filter((u) => u.role.roleName === roleName);
    const allSel = roleUsers.every((u) => selectedIds.has(u.userId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      roleUsers.forEach((u) => allSel ? next.delete(u.userId) : next.add(u.userId));
      return next;
    });
    if (allSel) {
      setMandatoryIds((prev) => {
        const next = new Set(prev);
        roleUsers.forEach((u) => next.delete(u.userId));
        return next;
      });
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || selectedIds.size === 0) return;
    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userIds', JSON.stringify([...selectedIds]));
    formData.append('mandatoryIds', JSON.stringify([...mandatoryIds]));

    try {
      const { data } = await api.post('/educations/upload', formData);
      setUploadSuccess(data.message);
      setFile(null);
      setSelectedIds(new Set());
      setMandatoryIds(new Set());
      setSearch('');
      setRoleFilter('');
      setStoreFilter('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowUpload(false);
      refetch();
      setTimeout(() => setUploadSuccess(''), 5000);
    } catch (err: any) {
      setUploadError(err.response?.data?.message ?? 'Yükleme başarısız.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`"${title}" dosyasını silmek istediğinize emin misiniz?`)) return;
    setDeleting(id);
    try {
      await api.delete(`/educations/${id}`);
      refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Silme işlemi başarısız oldu.');
    } finally {
      setDeleting(null);
    }
  }

  async function handleView(educationId: number, fileUrl: string) {
    window.open(fileUrl, '_blank', 'noreferrer');
    if (viewedIds.has(educationId)) return;
    try {
      await api.patch(`/educations/${educationId}/view`);
      setViewedIds((prev) => new Set(prev).add(educationId));
    } catch { /* sessiz hata — kullanıcı deneyimini bozmaz */ }
  }

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.has(u.userId));

  return (
    <div className="space-y-6">

      {/* Başlık */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-black">Eğitim Materyalleri</h1>
          <p className="text-sm text-brand-gray mt-0.5">
            {canManage && effectiveView === 'uploaded'
              ? `${allEdu.length} materyal yüklendi`
              : `${allEdu.length} materyal · ${mandatoryCount} zorunlu · ${optionalCount} isteğe bağlı`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Yalnızca Manager/Deputy için "Yüklenenler / Bana Atananlar" sekmeleri */}
          {isManagerOrDeputy && (
            <div className="flex gap-1 bg-brand-lightGray rounded-xl p-1 border border-brand-border">
              <button
                onClick={() => { setAdminView('uploaded'); setShowUpload(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  adminView === 'uploaded'
                    ? 'bg-white text-brand-red shadow-sm border border-brand-border'
                    : 'text-brand-gray hover:text-brand-black'
                }`}
              >
                📤 Yüklenenler
              </button>
              <button
                onClick={() => { setAdminView('assigned'); setShowUpload(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  adminView === 'assigned'
                    ? 'bg-white text-brand-red shadow-sm border border-brand-border'
                    : 'text-brand-gray hover:text-brand-black'
                }`}
              >
                👤 Bana Atananlar
              </button>
            </div>
          )}
          {canManage && effectiveView === 'uploaded' && (
            <button
              onClick={() => { setShowUpload((s) => !s); setUploadError(''); }}
              className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold
                px-4 py-2.5 rounded-xl transition-colors shadow-[0_2px_8px_rgba(212,43,43,0.3)]"
            >
              {showUpload ? '✕ İptal' : '+ Dosya Ekle'}
            </button>
          )}
        </div>
      </div>

      {/* Başarı banner */}
      {uploadSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          ✅ {uploadSuccess}
        </div>
      )}

      {/* ─── Yükleme Formu ─── */}
      {showUpload && (
        <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-5">
          <h3 className="font-bold text-brand-black flex items-center gap-2">
            <span>📤</span> Yeni Eğitim Materyali Yükle
            {isSysAdmin && (
              <span className="ml-auto text-xs font-medium text-brand-gray bg-brand-lightGray px-2 py-1 rounded-lg">
                Tüm mağazalara atayabilirsiniz
              </span>
            )}
          </h3>

          <form onSubmit={handleUpload} className="space-y-5">

            {/* Dosya seçimi */}
            <div>
              <label className="block text-xs font-semibold text-brand-black mb-2">
                Dosya <span className="text-brand-red">*</span>
                <span className="ml-1 font-normal text-brand-gray">(PDF veya PPTX)</span>
              </label>
              <label className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                file ? 'border-brand-red bg-brand-redLight' : 'border-brand-border bg-brand-lightGray hover:border-brand-red'
              }`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <span className="text-2xl">{file ? fileIcon(file.name) : '📁'}</span>
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
                    onClick={(e) => { e.preventDefault(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-brand-gray hover:text-brand-red text-lg shrink-0">✕
                  </button>
                )}
              </label>
            </div>

            {/* Kullanıcı seçici */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-brand-black">
                  Kullanıcılar <span className="text-brand-red">*</span>
                  {selectedIds.size > 0 && (
                    <span className="ml-2 bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {selectedIds.size} seçildi
                    </span>
                  )}
                  {mandatoryIds.size > 0 && (
                    <span className="ml-1 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {mandatoryIds.size} zorunlu
                    </span>
                  )}
                </label>
                <button type="button" onClick={() => { setSelectedIds(new Set()); setMandatoryIds(new Set()); }}
                  className="text-xs text-brand-gray hover:text-brand-red transition-colors">
                  Seçimi temizle
                </button>
              </div>

              {/* Filtreler: Mağaza (yalnızca Admin) + Arama + Rol */}
              <div className="flex gap-2 mb-3 flex-wrap">
                {isSysAdmin && (
                  <select
                    value={storeFilter}
                    onChange={(e) => {
                      setStoreFilter(e.target.value ? parseInt(e.target.value) : '');
                      setSelectedIds(new Set());
                      setMandatoryIds(new Set());
                    }}
                    className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                      focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                  >
                    <option value="">🏢 Tüm Mağazalar</option>
                    {storeOptions.map((s) => (
                      <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  placeholder="İsim ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                    focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                    focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                >
                  <option value="">Tüm Roller</option>
                  {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {/* Rol bazlı hızlı seçim */}
              {!roleFilter && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {roleOptions.map((roleName) => {
                    const roleUsers = filteredUsers.filter((u) => u.role.roleName === roleName);
                    if (roleUsers.length === 0) return null;
                    const allSel = roleUsers.every((u) => selectedIds.has(u.userId));
                    return (
                      <button key={roleName} type="button" onClick={() => toggleRole(roleName)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                          allSel
                            ? 'bg-brand-red text-white border-brand-red'
                            : 'bg-white text-brand-gray border-brand-border hover:border-brand-red hover:text-brand-red'
                        }`}>
                        {roleName} ({roleUsers.length})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Kullanıcı listesi */}
              <div className="border border-brand-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2 bg-brand-lightGray border-b border-brand-border">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                    className="w-4 h-4 accent-brand-red cursor-pointer" />
                  <span className="text-xs font-semibold text-brand-gray">
                    {allFilteredSelected ? 'Tümünü kaldır' : 'Tümünü seç'}
                    {filteredUsers.length !== users.length && ` (${filteredUsers.length})`}
                  </span>
                  <span className="text-xs font-semibold text-amber-600">Zorunlu</span>
                  <span className="w-4" />
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-brand-border">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-brand-gray text-center py-6">Kullanıcı bulunamadı</p>
                  ) : (
                    filteredUsers.map((u) => {
                      const checked     = selectedIds.has(u.userId);
                      const isMandatory = mandatoryIds.has(u.userId);
                      return (
                        <div key={u.userId}
                          className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors ${
                            checked ? 'bg-brand-redLight' : 'bg-white hover:bg-brand-lightGray'
                          }`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleUser(u.userId)}
                            className="w-4 h-4 accent-brand-red cursor-pointer shrink-0" />
                          <label onClick={() => toggleUser(u.userId)} className="flex items-center gap-2 cursor-pointer min-w-0">
                            <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {u.fullName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-brand-black truncate">{u.fullName}</p>
                              <p className="text-xs text-brand-gray truncate">
                                {u.role.roleName}
                                {isSysAdmin && u.store && (
                                  <span className="ml-1 text-brand-gray/60">· {u.store.storeName}</span>
                                )}
                              </p>
                            </div>
                          </label>
                          <button type="button"
                            disabled={!checked}
                            onClick={() => toggleMandatory(u.userId)}
                            title={isMandatory ? 'Zorunlu — tıkla isteğe bağlı yap' : 'İsteğe bağlı — tıkla zorunlu yap'}
                            className={`w-8 h-5 rounded-full transition-all shrink-0 ${
                              !checked ? 'opacity-30 cursor-not-allowed bg-brand-border' :
                              isMandatory ? 'bg-amber-500' : 'bg-brand-border'
                            }`}>
                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform mx-0.5 ${isMandatory ? 'translate-x-3' : 'translate-x-0'}`} />
                          </button>
                          {checked && <span className="text-brand-red text-sm shrink-0">✓</span>}
                          {!checked && <span className="w-4" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              {mandatoryIds.size > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  🔔 {mandatoryIds.size} kişi için zorunlu olarak işaretlendi
                </p>
              )}
            </div>

            {uploadError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                ⚠️ {uploadError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={uploading || !file || selectedIds.size === 0}
                className="bg-brand-red hover:bg-brand-redDark text-white font-bold px-6 py-2.5 rounded-xl
                  transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                {uploading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Yükleniyor...</>
                ) : `📤 ${selectedIds.size > 0 ? `${selectedIds.size} Kişiye Yükle` : 'Yükle'}`}
              </button>
              <button type="button"
                onClick={() => { setShowUpload(false); setFile(null); setSelectedIds(new Set()); setMandatoryIds(new Set()); setUploadError(''); }}
                className="text-brand-gray hover:text-brand-black font-medium px-4 py-2.5 rounded-xl hover:bg-brand-lightGray transition-colors">
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Admin: Mağaza Bazlı Tamamlama Oranları ─── */}
      {isSysAdmin && !showUpload && storeCompletion && storeCompletion.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-brand-border">
            <h2 className="text-sm font-black text-brand-black">Mağaza Bazlı Eğitim Tamamlama</h2>
            <p className="text-xs text-brand-gray mt-0.5">{storeCompletion.length} mağaza izleniyor</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-lightGray border-b border-brand-border text-xs font-black uppercase tracking-wider text-brand-gray">
                  <th className="text-left px-5 py-3">Mağaza</th>
                  <th className="text-center px-4 py-3">Personel</th>
                  <th className="text-center px-4 py-3">Atanan</th>
                  <th className="text-center px-4 py-3">Tamamlanan</th>
                  <th className="text-center px-4 py-3">Oran</th>
                </tr>
              </thead>
              <tbody>
                {storeCompletion.map((s, i) => (
                  <tr key={s.storeId} className={`border-b border-brand-border/50 ${i % 2 === 0 ? '' : 'bg-brand-lightGray/40'}`}>
                    <td className="px-5 py-3 font-bold text-brand-black">{s.storeName}</td>
                    <td className="px-4 py-3 text-center text-brand-gray">{s.staffCount}</td>
                    <td className="px-4 py-3 text-center text-brand-gray">{s.totalAssignments}</td>
                    <td className="px-4 py-3 text-center text-brand-gray">{s.viewedCount}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                        s.completionRate >= 80 ? 'bg-green-100 text-green-700'
                        : s.completionRate >= 50 ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-brand-red'
                      }`}>
                        %{s.completionRate}
                      </span>
                    </td>
                  </tr>
                ))}
                {storeCompletion.every((s) => s.totalAssignments === 0) && (
                  <tr>
                    <td colSpan={5} className="text-center py-6 text-brand-gray text-sm">
                      Henüz hiçbir mağazaya eğitim atanmamış.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kullanıcı / Bana Atananlar için filtre tab'ları */}
      {showUserView && allEdu.length > 0 && (
        <div className="flex gap-1 bg-white rounded-xl border border-brand-border p-1 shadow-card w-fit">
          {([
            { key: 'all',       label: 'Tümü',         count: allEdu.length },
            { key: 'mandatory', label: 'Zorunlu',      count: mandatoryCount },
            { key: 'optional',  label: 'İsteğe Bağlı', count: optionalCount },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => setFilterTab(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                filterTab === key
                  ? 'bg-brand-red text-white shadow-sm'
                  : 'text-brand-gray hover:text-brand-black hover:bg-brand-lightGray'
              }`}>
              {key === 'mandatory' && '🔔'}
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-md ${filterTab === key ? 'bg-white/20' : 'bg-brand-border'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ─── Liste ─── */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-brand-border p-5 animate-pulse h-36" />
          ))}
        </div>
      ) : filteredEdu.length === 0 ? (
        <EmptyState isAdmin={canManage && effectiveView === 'uploaded'} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEdu.map((edu) => (
            canManage && effectiveView === 'uploaded'
              ? <EducationCardAdmin key={edu.id} edu={edu as EducationAdmin} deleting={deleting === edu.id} onDelete={() => handleDelete(edu.id, edu.title)} canDelete={canDelete} />
              : <EducationCardUser  key={edu.id} edu={edu as EducationUser} isViewed={viewedIds.has(edu.id)} onView={handleView} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Müdür / Admin Kartı ──────────────────────────────────────────────────────

function EducationCardAdmin({ edu, deleting, onDelete, canDelete }: {
  edu: EducationAdmin; deleting: boolean; onDelete: () => void; canDelete: boolean;
}) {
  const [showAssignees, setShowAssignees] = useState(false);
  const ext = fileExt(edu.title);
  const isPdf = ext === 'PDF';
  const bgExt  = isPdf ? 'bg-red-50 border-red-200'    : 'bg-orange-50 border-orange-200';
  const txtExt = isPdf ? 'text-red-600'                 : 'text-orange-600';
  const mandatoryCount = edu.assignments.filter((a) => a.isMandatory).length;

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-card hover:shadow-cardHover transition-shadow p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${bgExt}`}>
          <span className="text-2xl">{fileIcon(edu.title)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-brand-black leading-snug truncate" title={edu.title}>{edu.title}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${bgExt} ${txtExt}`}>{ext}</span>
            <button onClick={() => setShowAssignees((s) => !s)}
              className="text-xs text-brand-gray bg-brand-lightGray hover:bg-brand-border px-2 py-0.5 rounded-md transition-colors">
              👤 {edu.assignments.length} kişi
            </button>
            {mandatoryCount > 0 && (
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                🔔 {mandatoryCount} zorunlu
              </span>
            )}
          </div>
          <p className="text-xs text-brand-gray mt-1.5">
            {new Date(edu.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{edu.uploader.fullName}
          </p>
        </div>
      </div>

      {showAssignees && edu.assignments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-brand-border">
          <p className="text-xs font-semibold text-brand-gray mb-2">Atanan Kullanıcılar</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {edu.assignments.map((a) => (
              <div key={a.user.userId} className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-brand-red flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {a.user.fullName.charAt(0)}
                </div>
                <span className="text-xs text-brand-black truncate flex-1">{a.user.fullName}</span>
                {a.isMandatory && (
                  <span className="text-xs font-semibold text-amber-600 shrink-0">Zorunlu</span>
                )}
                <span className="text-xs text-brand-gray shrink-0">{a.user.role.roleName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4 pt-3 border-t border-brand-border mt-auto">
        <a href={edu.fileUrl} target="_blank" rel="noreferrer"
          className="flex-1 text-center text-xs font-bold text-brand-red border border-brand-redMid
            bg-brand-redLight hover:bg-brand-red hover:text-white px-3 py-2 rounded-lg transition-colors">
          👁 Görüntüle
        </a>
        <a href={edu.fileUrl} download
          className="flex-1 text-center text-xs font-bold text-brand-gray border border-brand-border
            bg-brand-lightGray hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors">
          ⬇ İndir
        </a>
        {canDelete && (
          <button onClick={onDelete} disabled={deleting}
            className="text-xs font-bold text-red-500 border border-red-200 bg-red-50
              hover:bg-red-100 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            {deleting ? '...' : '🗑'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Kullanıcı Kartı ──────────────────────────────────────────────────────────

function EducationCardUser({ edu, isViewed, onView }: {
  edu: EducationUser;
  isViewed: boolean;
  onView: (educationId: number, fileUrl: string) => void;
}) {
  const ext = fileExt(edu.title);
  const isPdf = ext === 'PDF';
  const bgExt  = isPdf ? 'bg-red-50 border-red-200'    : 'bg-orange-50 border-orange-200';
  const txtExt = isPdf ? 'text-red-600'                 : 'text-orange-600';

  return (
    <div className={`bg-white rounded-2xl border shadow-card hover:shadow-cardHover transition-shadow p-5 flex flex-col ${
      edu.isMandatory ? 'border-amber-300' : 'border-brand-border'
    }`}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {edu.isMandatory && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            🔔 Zorunlu Eğitim
          </div>
        )}
        {isViewed && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
            ✓ Tamamlandı
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${bgExt}`}>
          <span className="text-2xl">{fileIcon(edu.title)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm text-brand-black leading-snug truncate" title={edu.title}>{edu.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${bgExt} ${txtExt}`}>{ext}</span>
          </div>
          <p className="text-xs text-brand-gray mt-1.5">
            {new Date(edu.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{edu.uploader.fullName}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-brand-border mt-auto">
        <button
          onClick={() => onView(edu.id, edu.fileUrl)}
          className={`flex-1 text-center text-xs font-bold border px-3 py-2 rounded-lg transition-colors ${
            isViewed
              ? 'text-green-700 border-green-300 bg-green-50 hover:bg-green-100'
              : 'text-brand-red border-brand-redMid bg-brand-redLight hover:bg-brand-red hover:text-white'
          }`}
        >
          {isViewed ? '✓ Tekrar Görüntüle' : '👁 Görüntüle'}
        </button>
        <a href={edu.fileUrl} download
          className="flex-1 text-center text-xs font-bold text-brand-gray border border-brand-border
            bg-brand-lightGray hover:bg-gray-200 px-3 py-2 rounded-lg transition-colors">
          ⬇ İndir
        </a>
      </div>
    </div>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="text-center py-16">
      <span className="text-5xl block mb-3">📂</span>
      <p className="font-bold text-brand-black">Henüz materyal yüklenmemiş</p>
      <p className="text-sm text-brand-gray mt-1">
        {isAdmin
          ? '"+ Dosya Ekle" ile kullanıcıları seçip PDF/PPTX yükleyebilirsiniz.'
          : 'Müdürünüz size materyal atadığında burada görünecek.'}
      </p>
    </div>
  );
}
