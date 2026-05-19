import { useState, useRef, FormEvent, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

interface StoreUser {
  userId: number;
  fullName: string;
  role: { roleName: string };
  store?: { storeId: number; storeName: string } | null;
}

interface Assignment {
  isMandatory: boolean;
  user: { userId: number; fullName: string; role: { roleName: string } };
}

interface EducationLibrary {
  id: number;
  title: string;
  fileUrl: string;
  createdAt: string;
  uploader: { fullName: string };
  assignments: Assignment[];
}

interface EducationAssigned {
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

export default function EducationsPage() {
  const { isManager, isRegionalManager, isAdmin: isSysAdmin } = useAuth();
  const isManagerOrDeputy = isManager || isRegionalManager;
  const canManage = isSysAdmin || isManagerOrDeputy;

  // Manager/Deputy: two tabs; Admin: library only
  const [managerView, setManagerView] = useState<'library' | 'assigned'>('library');
  const effectiveView = isSysAdmin ? 'library' : managerView;

  const endpoint = canManage
    ? (effectiveView === 'library' ? '/educations/all' : '/educations')
    : '/educations';

  const { data: educations, loading, refetch } = useApi<any[]>(endpoint);
  const { data: storeUsers } = useApi<StoreUser[]>(canManage ? '/educations/store-users' : '');
  const { data: storeCompletion } = useApi<StoreCompletion[]>(isSysAdmin ? '/educations/stores-completion' : '');

  // ─── Step 1: Kütüphaneye Yükleme ───────────────────────────────────────────
  const [showStep1, setShowStep1] = useState(false);
  const [step1File, setStep1File] = useState<File | null>(null);
  const [step1Uploading, setStep1Uploading] = useState(false);
  const [step1Error, setStep1Error] = useState('');
  const [step1Success, setStep1Success] = useState('');
  const step1FileInputRef = useRef<HTMLInputElement>(null);

  // ─── Step 2: Kütüphaneden Atama ────────────────────────────────────────────
  const [showStep2, setShowStep2] = useState(false);
  const [step2SelectedEducationId, setStep2SelectedEducationId] = useState<number | null>(null);
  const [step2Search, setStep2Search] = useState('');
  const [step2SelectedIds, setStep2SelectedIds] = useState<Set<number>>(new Set());
  const [step2MandatoryIds, setStep2MandatoryIds] = useState<Set<number>>(new Set());
  const [step2SearchName, setStep2SearchName] = useState('');
  const [step2RoleFilter, setStep2RoleFilter] = useState('');
  const [step2StoreFilter, setStep2StoreFilter] = useState<number | ''>('');
  const [step2Assigning, setStep2Assigning] = useState(false);
  const [step2Error, setStep2Error] = useState('');
  const [step2Success, setStep2Success] = useState('');

  // ─── Shared UI State ───────────────────────────────────────────────────────
  const [filterTab, setFilterTab] = useState<'all' | 'mandatory' | 'optional'>('all');
  const [viewedIds, setViewedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);

  const allEdu = educations ?? [];
  const users = storeUsers ?? [];

  // Mark viewed educations for user view
  useMemo(() => {
    if (!canManage && educations) {
      const ids = new Set(
        (educations as EducationAssigned[]).filter((e) => e.viewedAt).map((e) => e.id)
      );
      setViewedIds(ids);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [educations]);

  const library: EducationLibrary[] = useMemo(
    () => (canManage && effectiveView === 'library' ? (allEdu as EducationLibrary[]) : []),
    [canManage, effectiveView, allEdu]
  );

  const filteredLibraryForStep2 = useMemo(() => {
    const q = step2Search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((e) => e.title.toLowerCase().includes(q));
  }, [library, step2Search]);

  const selectedEducationForStep2 = useMemo(
    () => library.find((e) => e.id === step2SelectedEducationId) ?? null,
    [library, step2SelectedEducationId]
  );

  const alreadyAssignedInStep2 = useMemo(
    () => new Set((selectedEducationForStep2?.assignments ?? []).map((a) => a.user.userId)),
    [selectedEducationForStep2]
  );

  const storeOptions = useMemo(() => {
    if (!isSysAdmin) return [];
    const map = new Map<number, string>();
    users.forEach((u) => { if (u.store) map.set(u.store.storeId, u.store.storeName); });
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
      .map(([id, name]) => ({ storeId: id, storeName: name }));
  }, [users, isSysAdmin]);

  const roleOptions = useMemo(
    () => [...new Set(users.map((u) => u.role.roleName))].sort(),
    [users]
  );

  const filteredUsersStep2 = useMemo(() => users.filter((u) => {
    const matchStore = !isSysAdmin || !step2StoreFilter || u.store?.storeId === step2StoreFilter;
    const matchName  = u.fullName.toLowerCase().includes(step2SearchName.toLowerCase());
    const matchRole  = !step2RoleFilter || u.role.roleName === step2RoleFilter;
    return matchStore && matchName && matchRole;
  }), [users, step2SearchName, step2RoleFilter, step2StoreFilter, isSysAdmin]);

  const showUserView = !canManage || (isManagerOrDeputy && effectiveView === 'assigned');

  const filteredEdu = useMemo(() => {
    if (!showUserView || filterTab === 'all') return allEdu;
    return allEdu.filter((e: EducationAssigned) =>
      filterTab === 'mandatory' ? e.isMandatory : !e.isMandatory
    );
  }, [allEdu, filterTab, showUserView]);

  const mandatoryCount = showUserView ? allEdu.filter((e: EducationAssigned) => e.isMandatory).length : 0;
  const optionalCount = showUserView ? allEdu.filter((e: EducationAssigned) => !e.isMandatory).length : 0;

  // ─── Step 1 Handlers ───────────────────────────────────────────────────────
  function resetStep1() {
    setStep1File(null);
    setStep1Error('');
    if (step1FileInputRef.current) step1FileInputRef.current.value = '';
  }

  async function handleStep1Upload(e: FormEvent) {
    e.preventDefault();
    if (!step1File) return;

    setStep1Uploading(true);
    setStep1Error('');

    try {
      const formData = new FormData();
      formData.append('file', step1File);
      const { data } = await api.post('/educations', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setStep1Success(data.message);
      resetStep1();
      setShowStep1(false);
      refetch();
      setTimeout(() => setStep1Success(''), 5000);
    } catch (err: any) {
      setStep1Error(err.response?.data?.message ?? 'Yükleme başarısız.');
    } finally {
      setStep1Uploading(false);
    }
  }

  // ─── Step 2 Handlers ───────────────────────────────────────────────────────
  function toggleStep2User(id: number) {
    setStep2SelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (!step2SelectedIds.has(id)) return;
    setStep2MandatoryIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function toggleStep2Mandatory(id: number) {
    setStep2MandatoryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleStep2All() {
    const allSelected = filteredUsersStep2.every((u) => step2SelectedIds.has(u.userId));
    setStep2SelectedIds((prev) => {
      const next = new Set(prev);
      filteredUsersStep2.forEach((u) => allSelected ? next.delete(u.userId) : next.add(u.userId));
      return next;
    });
  }

  function toggleStep2Role(roleName: string) {
    const roleUsers = filteredUsersStep2.filter((u) => u.role.roleName === roleName);
    const allSel = roleUsers.every((u) => step2SelectedIds.has(u.userId));
    setStep2SelectedIds((prev) => {
      const next = new Set(prev);
      roleUsers.forEach((u) => allSel ? next.delete(u.userId) : next.add(u.userId));
      return next;
    });
    if (allSel) {
      setStep2MandatoryIds((prev) => {
        const next = new Set(prev);
        roleUsers.forEach((u) => next.delete(u.userId));
        return next;
      });
    }
  }

  function resetStep2() {
    setStep2SelectedIds(new Set());
    setStep2MandatoryIds(new Set());
    setStep2SearchName('');
    setStep2RoleFilter('');
    setStep2StoreFilter('');
    setStep2SelectedEducationId(null);
    setStep2Search('');
    setStep2Error('');
  }

  async function handleStep2Assign(e: FormEvent) {
    e.preventDefault();
    if (step2SelectedIds.size === 0 || step2SelectedEducationId === null) return;

    setStep2Assigning(true);
    setStep2Error('');

    try {
      const { data } = await api.post(`/educations/${step2SelectedEducationId}/assign`, {
        userIds: [...step2SelectedIds],
        mandatoryIds: [...step2MandatoryIds],
      });

      setStep2Success(data.message);
      resetStep2();
      setShowStep2(false);
      refetch();
      setTimeout(() => setStep2Success(''), 5000);
    } catch (err: any) {
      setStep2Error(err.response?.data?.message ?? 'Atama başarısız.');
    } finally {
      setStep2Assigning(false);
    }
  }

  async function handleDelete(id: number, title: string) {
    if (!confirm(`"${title}" dosyasını silmek istediğinize emin misiniz?`)) return;
    setDeleting(id);
    try { await api.delete(`/educations/${id}`); refetch(); }
    finally { setDeleting(null); }
  }

  async function handleView(educationId: number, fileUrl: string) {
    window.open(fileUrl, '_blank', 'noreferrer');
    if (viewedIds.has(educationId)) return;
    try {
      await api.patch(`/educations/${educationId}/view`);
      setViewedIds((prev) => new Set(prev).add(educationId));
    } catch { /* silent error */ }
  }

  const step2AllFilteredSelected = filteredUsersStep2.length > 0 && filteredUsersStep2.every((u) => step2SelectedIds.has(u.userId));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-black">Eğitim Materyalleri</h1>
          <p className="text-sm text-brand-gray mt-0.5">
            {canManage && effectiveView === 'library'
              ? `${allEdu.length} materyal kütüphanede`
              : `${allEdu.length} materyal · ${mandatoryCount} zorunlu · ${optionalCount} isteğe bağlı`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManagerOrDeputy && (
            <div className="flex gap-1 bg-brand-lightGray rounded-xl p-1 border border-brand-border">
              <button
                onClick={() => { setManagerView('library'); setShowStep1(false); setShowStep2(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  managerView === 'library'
                    ? 'bg-white text-brand-red shadow-sm border border-brand-border'
                    : 'text-brand-gray hover:text-brand-black'
                }`}
              >
                📚 Kütüphane
              </button>
              <button
                onClick={() => { setManagerView('assigned'); setShowStep1(false); setShowStep2(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  managerView === 'assigned'
                    ? 'bg-white text-brand-red shadow-sm border border-brand-border'
                    : 'text-brand-gray hover:text-brand-black'
                }`}
              >
                👤 Bana Atananlar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success banners */}
      {step1Success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          ✅ {step1Success}
        </div>
      )}
      {step2Success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          ✅ {step2Success}
        </div>
      )}

      {/* ─── STEP 1: Kütüphaneye Eğitim Yükleme ─── */}
      {canManage && effectiveView === 'library' && (
        <div className="flex gap-3 mb-2">
          <button
            onClick={() => { setShowStep1((s) => !s); setShowStep2(false); }}
            className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-[0_2px_8px_rgba(212,43,43,0.3)]"
          >
            {showStep1 ? '✕ İptal' : '📤 Step 1: Kütüphaneye Yükle'}
          </button>
          <button
            onClick={() => { setShowStep2((s) => !s); setShowStep1(false); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-[0_2px_8px_rgba(37,99,235,0.3)]"
          >
            {showStep2 ? '✕ İptal' : '📚 Step 2: Kütüphaneden Ata'}
          </button>
        </div>
      )}

      {/* Step 1 Form */}
      {showStep1 && (
        <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-5">
          <h3 className="font-bold text-brand-black flex items-center gap-2 text-lg">
            <span>📤</span> Adım 1: Kütüphaneye Eğitim Yükle
            <p className="ml-auto text-xs font-normal text-brand-gray">Sadece dosya yükleme, atama sonra.</p>
          </h3>

          <form onSubmit={handleStep1Upload} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-brand-black mb-2">
                Dosya <span className="text-brand-red">*</span>
                <span className="ml-1 font-normal text-brand-gray">(PDF veya PPTX)</span>
              </label>
              <label className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                step1File ? 'border-brand-red bg-brand-redLight' : 'border-brand-border bg-brand-lightGray hover:border-brand-red'
              }`}>
                <input
                  ref={step1FileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  className="hidden"
                  onChange={(e) => setStep1File(e.target.files?.[0] ?? null)}
                />
                <span className="text-2xl">{step1File ? fileIcon(step1File.name) : '📁'}</span>
                <div className="flex-1 min-w-0">
                  {step1File ? (
                    <>
                      <p className="text-sm font-semibold text-brand-black truncate">{step1File.name}</p>
                      <p className="text-xs text-brand-gray">{(step1File.size / 1024 / 1024).toFixed(2)} MB</p>
                    </>
                  ) : (
                    <p className="text-sm text-brand-gray">Dosya seçmek için tıklayın</p>
                  )}
                </div>
                {step1File && (
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); resetStep1(); }}
                    className="text-brand-gray hover:text-brand-red text-lg shrink-0">✕
                  </button>
                )}
              </label>
            </div>

            {step1Error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                ⚠️ {step1Error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!step1File || step1Uploading}
                className="bg-brand-red hover:bg-brand-redDark text-white font-bold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {step1Uploading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Yükleniyor...
                  </>
                ) : (
                  <>📤 Yükle</>
                )}
              </button>
              <button type="button"
                onClick={() => { resetStep1(); setShowStep1(false); }}
                className="text-brand-gray hover:text-brand-black font-medium px-4 py-2.5 rounded-xl hover:bg-brand-lightGray transition-colors">
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 2 Form */}
      {showStep2 && (
        <div className="bg-white rounded-2xl border border-brand-border shadow-card p-6 space-y-5">
          <h3 className="font-bold text-brand-black flex items-center gap-2 text-lg">
            <span>📚</span> Adım 2: Kütüphaneden Eğitimi Atama
            <p className="ml-auto text-xs font-normal text-brand-gray">Kütüphanedeki eğitimi personele ata.</p>
          </h3>

          <form onSubmit={handleStep2Assign} className="space-y-5">
            {/* Education selection */}
            <div>
              <label className="block text-xs font-semibold text-brand-black mb-2">
                Eğitim <span className="text-brand-red">*</span>
                <span className="ml-1 font-normal text-brand-gray">
                  ({library.length > 0 ? `${library.length} kütüphanede` : 'kütüphane boş'})
                </span>
              </label>

              <input
                type="text"
                placeholder="🔍 Eğitim ara..."
                value={step2Search}
                onChange={(e) => setStep2Search(e.target.value)}
                disabled={library.length === 0}
                className="w-full px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-500 mb-2 disabled:opacity-50"
              />

              <div className="border border-brand-border rounded-xl overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-brand-border">
                  {library.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-brand-gray bg-brand-lightGray/50">
                      Kütüphanede henüz eğitim yok.
                    </div>
                  ) : filteredLibraryForStep2.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-brand-gray">
                      "{step2Search}" için sonuç yok
                    </div>
                  ) : (
                    filteredLibraryForStep2.map((edu) => (
                      <button
                        key={edu.id}
                        type="button"
                        onClick={() => setStep2SelectedEducationId(edu.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-4 ${
                          step2SelectedEducationId === edu.id
                            ? 'bg-blue-50 border-l-blue-500'
                            : 'bg-white hover:bg-brand-lightGray border-l-transparent'
                        }`}
                      >
                        <span className="text-2xl shrink-0">{fileIcon(edu.title)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand-black truncate">{edu.title}</p>
                          <p className="text-xs text-brand-gray">
                            {fileExt(edu.title)} · {new Date(edu.createdAt).toLocaleDateString('tr-TR')}
                          </p>
                        </div>
                        {step2SelectedEducationId === edu.id && <span className="text-blue-600 text-sm shrink-0">✓</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {selectedEducationForStep2 && alreadyAssignedInStep2.size > 0 && (
                <p className="text-xs text-brand-gray mt-2">
                  ℹ️ Bu eğitim zaten {alreadyAssignedInStep2.size} kişiye atanmış. Aşağıdaki listede <strong>✓ Atanmış</strong> gösterilir.
                </p>
              )}
            </div>

            {/* User selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-brand-black">
                  Personel <span className="text-brand-red">*</span>
                  {step2SelectedIds.size > 0 && (
                    <span className="ml-2 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {step2SelectedIds.size} seçildi
                    </span>
                  )}
                </label>
                <button type="button" onClick={() => { setStep2SelectedIds(new Set()); setStep2MandatoryIds(new Set()); }}
                  className="text-xs text-brand-gray hover:text-brand-red transition-colors">
                  Temizle
                </button>
              </div>

              <div className="flex gap-2 mb-3 flex-wrap">
                {isSysAdmin && (
                  <select
                    value={step2StoreFilter}
                    onChange={(e) => { setStep2StoreFilter(e.target.value ? parseInt(e.target.value) : ''); }}
                    className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-blue-300"
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
                  value={step2SearchName}
                  onChange={(e) => setStep2SearchName(e.target.value)}
                  className="flex-1 min-w-[140px] px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <select
                  value={step2RoleFilter}
                  onChange={(e) => setStep2RoleFilter(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="">Tüm Roller</option>
                  {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {!step2RoleFilter && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {roleOptions.map((roleName) => {
                    const roleUsers = filteredUsersStep2.filter((u) => u.role.roleName === roleName);
                    if (roleUsers.length === 0) return null;
                    const allSel = roleUsers.every((u) => step2SelectedIds.has(u.userId));
                    return (
                      <button key={roleName} type="button" onClick={() => toggleStep2Role(roleName)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                          allSel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-brand-gray border-brand-border hover:border-blue-500'
                        }`}>
                        {roleName} ({roleUsers.length})
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="border border-brand-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2 bg-brand-lightGray border-b">
                  <input type="checkbox" checked={step2AllFilteredSelected} onChange={toggleStep2All}
                    className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  <span className="text-xs font-semibold text-brand-gray">
                    {step2AllFilteredSelected ? 'Tümünü kaldır' : 'Tümünü seç'} ({filteredUsersStep2.length})
                  </span>
                  <span className="text-xs font-semibold text-amber-600">Zorunlu</span>
                  <span className="w-4" />
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-brand-border">
                  {filteredUsersStep2.length === 0 ? (
                    <p className="text-sm text-brand-gray text-center py-6">Personel bulunamadı</p>
                  ) : (
                    filteredUsersStep2.map((u) => {
                      const checked = step2SelectedIds.has(u.userId);
                      const isMandatory = step2MandatoryIds.has(u.userId);
                      const isAlreadyAssigned = alreadyAssignedInStep2.has(u.userId);
                      return (
                        <div key={u.userId}
                          className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 transition-colors ${
                            checked ? 'bg-blue-50' : 'bg-white hover:bg-brand-lightGray'
                          }`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleStep2User(u.userId)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer shrink-0" />
                          <label onClick={() => toggleStep2User(u.userId)} className="flex items-center gap-2 cursor-pointer min-w-0">
                            <div className="w-7 h-7 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold shrink-0">
                              {u.fullName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-brand-black truncate flex items-center gap-1">
                                {u.fullName}
                                {isAlreadyAssigned && (
                                  <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded shrink-0">
                                    ✓ Atanmış
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-brand-gray">{u.role.roleName}</p>
                            </div>
                          </label>
                          <button type="button"
                            disabled={!checked}
                            onClick={() => toggleStep2Mandatory(u.userId)}
                            className={`w-8 h-5 rounded-full transition-all shrink-0 ${
                              !checked ? 'opacity-30 cursor-not-allowed bg-brand-border' :
                              isMandatory ? 'bg-amber-500' : 'bg-brand-border'
                            }`}>
                            <span className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform mx-0.5 ${isMandatory ? 'translate-x-3' : 'translate-x-0'}`} />
                          </button>
                          {checked && <span className="text-blue-600 text-sm shrink-0">✓</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {step2Error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                ⚠️ {step2Error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={step2SelectedIds.size === 0 || step2SelectedEducationId === null || step2Assigning}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {step2Assigning ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Atanıyor...
                  </>
                ) : (
                  <>📚 {step2SelectedIds.size > 0 ? `${step2SelectedIds.size} Kişiye Ata` : 'Ata'}</>
                )}
              </button>
              <button type="button"
                onClick={() => { resetStep2(); setShowStep2(false); }}
                className="text-brand-gray hover:text-brand-black font-medium px-4 py-2.5 rounded-xl hover:bg-brand-lightGray transition-colors">
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Store completion table for Admin */}
      {isSysAdmin && !showStep1 && !showStep2 && storeCompletion && storeCompletion.length > 0 && (
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

      {/* Filter tabs for user view */}
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

      {/* Education list */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-brand-border p-5 animate-pulse h-36" />
          ))}
        </div>
      ) : filteredEdu.length === 0 ? (
        <EmptyState isAdmin={canManage && effectiveView === 'library'} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEdu.map((edu) => (
            canManage && effectiveView === 'library'
              ? <EducationCardAdmin key={edu.id} edu={edu as EducationLibrary} deleting={deleting === edu.id} onDelete={() => handleDelete(edu.id, edu.title)} />
              : <EducationCardUser  key={edu.id} edu={edu as EducationAssigned} isViewed={viewedIds.has(edu.id)} onView={handleView} />
          ))}
        </div>
      )}
    </div>
  );
}

function EducationCardAdmin({ edu, deleting, onDelete }: {
  edu: EducationLibrary; deleting: boolean; onDelete: () => void;
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
        <button onClick={onDelete} disabled={deleting}
          className="text-xs font-bold text-red-500 border border-red-200 bg-red-50
            hover:bg-red-100 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
          {deleting ? '...' : '🗑'}
        </button>
      </div>
    </div>
  );
}

function EducationCardUser({ edu, isViewed, onView }: {
  edu: EducationAssigned;
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
      <p className="font-bold text-brand-black">Henüz materyal yok</p>
      <p className="text-sm text-brand-gray mt-1">
        {isAdmin
          ? 'Step 1 ile kütüphaneye eğitim yükleyin, sonra Step 2 ile personele atayın.'
          : 'Müdürünüz size eğitim atadığında burada görünecek.'}
      </p>
    </div>
  );
}
