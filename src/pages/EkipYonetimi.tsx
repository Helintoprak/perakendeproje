import { useState, useMemo, useEffect } from 'react';
import { useApi }  from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import api         from '../lib/api';
import ProgressBar from '../components/ui/ProgressBar';
import { PromotionModal } from '../components/promotion/PromotionModal';

// ── Tipler ────────────────────────────────────────────────────────────────────

interface UserItem {
  userId:   number;
  fullName: string;
  email:    string;
  status:   number;
  role:     { roleId: number; roleName: string };
  store:    { storeId: number; storeName: string } | null;
}

interface StoreItem {
  storeId:   number;
  storeName: string;
}

interface RoleItem {
  roleId:   number;
  roleName: string;
}

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

type ProgressFilter = 'all' | 'passed' | 'inProgress' | 'notStarted';

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────

export default function EkipYonetimi() {
  const { isAdmin, isManager, isRegionalManager } = useAuth();

  if (!isAdmin && !isManager && !isRegionalManager) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-brand-gray text-sm">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-black">
          {isAdmin ? 'Merkezi personel yönetimi' : 'Personel eğitim ilerlemesi takibi'}
        </h1>
      </div>

      {isAdmin ? <AdminPanel /> : <ManagerPanel />}
    </div>
  );
}

// ── Admin Paneli ──────────────────────────────────────────────────────────────

function AdminPanel() {
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [promoUser,       setPromoUser]       = useState<UserItem | null>(null);
  const [statusTarget,    setStatusTarget]    = useState<UserItem | null>(null);
  const [actionMenuId,    setActionMenuId]    = useState<number | null>(null);
  const [search,          setSearch]          = useState('');

  const storeParam = selectedStoreId ? { storeId: selectedStoreId } : undefined;
  const { data: users,  loading, error, refetch } = useApi<UserItem[]>('/users', storeParam);
  const { data: stores }                          = useApi<StoreItem[]>('/users/stores');

  // Debug: API'den dönen veriyi kontrol et
  useEffect(() => {
    console.log('[EkipYonetimi] users (storeId=' + (selectedStoreId ?? 'all') + '):',
      users, '| loading:', loading, '| error:', error);
  }, [users, loading, error, selectedStoreId]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(
      u => u.fullName.toLowerCase().includes(q) ||
           u.email.toLowerCase().includes(q) ||
           u.role.roleName.toLowerCase().includes(q) ||
           (u.store?.storeName ?? 'mağazasız').toLowerCase().includes(q)
    );
  }, [users, search]);

  const activeCount   = users?.filter(u => u.status === 1).length ?? 0;
  const inactiveCount = users?.filter(u => u.status === 0).length ?? 0;

  return (
    <div className="space-y-4">

      {/* Üst toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Mağaza filtresi */}
          <select
            value={selectedStoreId ?? ''}
            onChange={e => setSelectedStoreId(e.target.value ? Number(e.target.value) : null)}
            className="px-4 py-2 text-sm rounded-xl border border-brand-border bg-white shadow-sm
              focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red min-w-[200px]"
          >
            <option value="">🏢 Tüm Mağazalar</option>
            {(stores ?? []).map(s => (
              <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
            ))}
          </select>

          {/* Arama */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="İsim, e-posta veya rol ara..."
            className="px-4 py-2 text-sm rounded-xl border border-brand-border bg-white shadow-sm
              focus:outline-none focus:ring-2 focus:ring-brand-red/30 min-w-[220px]"
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-red hover:bg-brand-redDark text-white
            text-sm font-bold rounded-xl transition-colors shadow-md whitespace-nowrap"
        >
          <span>+</span> Yeni Personel Ekle
        </button>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Toplam Personel" value={(users?.length ?? 0).toString()} icon="👥" />
        <SummaryCard label="Aktif"           value={activeCount.toString()}           icon="✅" color="text-green-600" />
        <SummaryCard label="Pasif"           value={inactiveCount.toString()}         icon="⛔" color="text-brand-gray" />
      </div>

      {/* Personel tablosu */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
          <h3 className="font-bold text-brand-black">Personel Listesi</h3>
          {loading && <span className="text-xs text-brand-gray animate-pulse">Yükleniyor...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-lightGray text-brand-gray text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Personel</th>
                <th className="text-left px-5 py-3 font-semibold">Mağaza</th>
                <th className="text-left px-5 py-3 font-semibold">Rol</th>
                <th className="text-center px-5 py-3 font-semibold">Durum</th>
                <th className="px-5 py-3 font-semibold text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-brand-gray">
                    {loading ? 'Yükleniyor...' : 'Personel bulunamadı.'}
                  </td>
                </tr>
              ) : filtered.map(u => (
                <UserRow
                  key={u.userId}
                  user={u}
                  isMenuOpen={actionMenuId === u.userId}
                  onMenuToggle={() => setActionMenuId(actionMenuId === u.userId ? null : u.userId)}
                  onPromote={() => { setPromoUser(u); setActionMenuId(null); }}
                  onStatusChange={() => { setStatusTarget(u); setActionMenuId(null); }}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modallar */}
      {showAddModal && (
        <AddUserModal
          stores={stores ?? []}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); refetch(); }}
        />
      )}

      {promoUser && (
        <PromotionModal
          staff={{ userId: promoUser.userId, fullName: promoUser.fullName, role: promoUser.role.roleName }}
          onClose={() => setPromoUser(null)}
          onSuccess={() => { setPromoUser(null); refetch(); }}
        />
      )}

      {statusTarget && (
        <StatusConfirmModal
          user={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSuccess={() => { setStatusTarget(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ── Tablo Satırı ──────────────────────────────────────────────────────────────

function UserRow({ user, isMenuOpen, onMenuToggle, onPromote, onStatusChange }: {
  user: UserItem;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onPromote: () => void;
  onStatusChange: () => void;
}) {
  const isActive = user.status === 1;

  return (
    <tr className={`transition-colors hover:bg-brand-lightGray/50 ${!isActive ? 'opacity-60' : ''}`}>
      {/* Personel */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
            isActive ? 'bg-brand-red' : 'bg-brand-gray'
          }`}>
            {user.fullName.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-brand-black">{user.fullName}</p>
            <p className="text-xs text-brand-gray">{user.email}</p>
          </div>
        </div>
      </td>

      {/* Mağaza — güncel mağaza (en son performans kaydından türetilmiştir) */}
      <td className="px-5 py-4">
        {user.store?.storeName ? (
          <span className="text-sm text-brand-black">{user.store.storeName}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
            ⚠️ Mağazasız
          </span>
        )}
      </td>

      {/* Rol */}
      <td className="px-5 py-4">
        <RoleBadge roleName={user.role.roleName} />
      </td>

      {/* Durum */}
      <td className="px-5 py-4 text-center">
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
          isActive
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-gray-100 text-gray-500 border-gray-200'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
          {isActive ? 'Aktif' : 'Pasif'}
        </span>
      </td>

      {/* İşlemler */}
      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
        <AdminActionMenu
          isOpen={isMenuOpen}
          isActive={isActive}
          onToggle={onMenuToggle}
          onPromote={onPromote}
          onStatusChange={onStatusChange}
        />
      </td>
    </tr>
  );
}

// ── Admin İşlemler Menüsü ─────────────────────────────────────────────────────

function AdminActionMenu({ isOpen, isActive, onToggle, onPromote, onStatusChange }: {
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  onPromote: () => void;
  onStatusChange: () => void;
}) {
  return (
    <div className="relative inline-block">
      <button
        onClick={onToggle}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-brand-lightGray
          transition-colors text-brand-gray hover:text-brand-black"
        title="İşlemler"
      >
        ⚙️
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-brand-border
          rounded-xl shadow-xl py-1.5 min-w-[220px]">
          <button
            onClick={onPromote}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-brand-black
              hover:bg-brand-lightGray transition-colors flex items-center gap-3"
          >
            <span>🔄</span>
            <div>
              <p className="font-bold">Rolü Değiştir / Terfi Ettir</p>
              <p className="text-[10px] text-brand-gray font-normal">Personelin rolünü güncelle</p>
            </div>
          </button>

          <div className="mx-3 my-1 border-t border-brand-border" />

          <button
            onClick={onStatusChange}
            className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors flex items-center gap-3 ${
              isActive
                ? 'text-red-600 hover:bg-red-50'
                : 'text-green-700 hover:bg-green-50'
            }`}
          >
            <span>{isActive ? '⛔' : '✅'}</span>
            <div>
              <p className="font-bold">{isActive ? 'Hesabı Pasife Al' : 'Hesabı Aktifleştir'}</p>
              <p className="text-[10px] font-normal opacity-70">
                {isActive ? 'Veriler korunur, giriş engellenir' : 'Kullanıcı tekrar giriş yapabilir'}
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Yeni Personel Ekleme Modalı ───────────────────────────────────────────────

function AddUserModal({ stores, onClose, onSuccess }: {
  stores: StoreItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: roles } = useApi<RoleItem[]>('/users/roles');

  const [form, setForm] = useState({
    fullName: '',
    email:    '',
    password: '',
    roleId:   0,
    storeId:  0,
  });
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [created,     setCreated]     = useState<{ fullName: string; tempPassword: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  function set(field: keyof typeof form, value: string | number) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.fullName.trim() || !form.email.trim() || !form.roleId) {
      setError('Ad Soyad, E-posta ve Rol zorunludur.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api.post<{ fullName: string; tempPassword: string }>('/users', {
        fullName: form.fullName.trim(),
        email:    form.email.trim(),
        roleId:   form.roleId,
        storeId:  form.storeId || undefined,
        password: form.password.trim() || undefined,
      });
      setCreated(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Kullanıcı oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <ModalShell title="Personel Oluşturuldu" onClose={onSuccess}>
        <div className="space-y-4">
          <div className="flex items-center justify-center py-4">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center text-3xl">
              🎉
            </div>
          </div>
          <p className="text-center font-semibold text-brand-black">
            {created.fullName} sisteme eklendi!
          </p>
          <div className="bg-brand-lightGray rounded-xl p-4 border border-brand-border">
            <p className="text-xs font-bold text-brand-gray mb-1.5">Geçici Şifre (bir kez gösterilir)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono font-bold text-brand-black bg-white px-3 py-2 rounded-lg border border-brand-border">
                {created.tempPassword}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(created.tempPassword)}
                className="text-xs px-3 py-2 rounded-lg border border-brand-border bg-white hover:bg-brand-lightGray transition-colors font-semibold"
              >
                Kopyala
              </button>
            </div>
          </div>
          <p className="text-xs text-brand-gray text-center">
            Bu şifreyi personelle paylaşın. İlk girişte değiştirmesini önerin.
          </p>
        </div>
        <ModalFooter onClose={onSuccess} closeLabel="Tamam" hideSave />
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Yeni Personel Ekle" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Ad Soyad" required>
          <input
            type="text"
            value={form.fullName}
            onChange={e => set('fullName', e.target.value)}
            placeholder="Ahmet Yılmaz"
            className={inputCls}
          />
        </Field>

        <Field label="E-posta Adresi" required>
          <input
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="ahmet@sporthink.com"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rol" required>
            <select
              value={form.roleId}
              onChange={e => set('roleId', Number(e.target.value))}
              className={inputCls}
            >
              <option value={0}>Seçin</option>
              {(roles ?? []).map(r => (
                <option key={r.roleId} value={r.roleId}>{r.roleName}</option>
              ))}
            </select>
          </Field>

          <Field label="Mağaza">
            <select
              value={form.storeId}
              onChange={e => set('storeId', Number(e.target.value))}
              className={inputCls}
            >
              <option value={0}>Merkez / Belirsiz</option>
              {stores.map(s => (
                <option key={s.storeId} value={s.storeId}>{s.storeName}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Şifre" hint="Boş bırakırsanız otomatik oluşturulur">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Otomatik oluştur"
              className={inputCls + ' pr-10'}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray hover:text-brand-black text-xs"
            >
              {showPassword ? 'Gizle' : 'Göster'}
            </button>
          </div>
        </Field>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
            <span>⚠️</span> {error}
          </div>
        )}
      </div>

      <ModalFooter
        onClose={onClose}
        onSave={handleSubmit}
        saveLabel={saving ? 'Oluşturuluyor...' : 'Personel Ekle'}
        disabled={saving}
      />
    </ModalShell>
  );
}

// ── Durum Değiştir Onay Modalı ────────────────────────────────────────────────

function StatusConfirmModal({ user, onClose, onSuccess }: {
  user: UserItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const newStatus = user.status === 1 ? 0 : 1;
  const isDeactivating = newStatus === 0;

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/users/${user.userId}/status`, { status: newStatus });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'İşlem gerçekleştirilemedi.');
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={isDeactivating ? 'Hesabı Pasife Al' : 'Hesabı Aktifleştir'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className={`rounded-xl p-4 border ${
          isDeactivating ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isDeactivating ? '⛔' : '✅'}</span>
            <div>
              <p className={`font-bold text-sm ${isDeactivating ? 'text-red-700' : 'text-green-700'}`}>
                {user.fullName}
              </p>
              <p className="text-xs text-brand-gray mt-0.5">
                {isDeactivating
                  ? 'Bu personelin hesabı pasife alınacak. Tüm geçmiş veriler korunur.'
                  : 'Bu personelin hesabı yeniden aktifleştirilecek.'}
              </p>
            </div>
          </div>
        </div>

        {isDeactivating && (
          <p className="text-xs text-brand-gray bg-brand-lightGray rounded-xl px-4 py-3 border border-brand-border">
            ℹ️ KPI verileri, geri bildirimler ve performans kayıtları <strong>silinmeyecek</strong>. Sadece sistem girişi engellenecek.
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
            <span>⚠️</span> {error}
          </div>
        )}
      </div>

      <ModalFooter
        onClose={onClose}
        onSave={handleConfirm}
        saveLabel={saving ? 'İşleniyor...' : (isDeactivating ? 'Pasife Al' : 'Aktifleştir')}
        saveStyle={isDeactivating ? 'danger' : 'success'}
        disabled={saving}
      />
    </ModalShell>
  );
}

// ── Manager / Deputy Paneli ───────────────────────────────────────────────────

function ManagerPanel() {
  const { data: staff, loading, error } = useApi<StaffMember[]>('/team/progress');
  const [filter,       setFilter]       = useState<ProgressFilter>('all');
  const [expanded,     setExpanded]     = useState<number | null>(null);
  const [reminding,    setReminding]    = useState<number | null>(null);
  const [reminded,     setReminded]     = useState<Set<number>>(new Set());

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
      setReminded(prev => new Set([...prev, userId]));
    } finally {
      setReminding(null);
    }
  }

  if (loading) return <Spinner label="Eğitim verileri yükleniyor..." />;
  if (error)   return <ErrorBox title="Veriler yüklenemedi" message={error} />;

  const counts = {
    all:        staff?.length ?? 0,
    passed:     staff?.filter(s => s.courses.some(c => c.lastQuizPassed === true)).length ?? 0,
    inProgress: staff?.filter(s => s.overallRate > 0 && s.overallRate < 100).length ?? 0,
    notStarted: staff?.filter(s => s.overallRate === 0).length ?? 0,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          { key: 'all',        label: 'Tümü',                count: counts.all,        color: 'bg-gray-100 text-gray-700 border-gray-300'    },
          { key: 'passed',     label: '✅ Quizi Geçenler',   count: counts.passed,     color: 'bg-green-100 text-green-700 border-green-300' },
          { key: 'inProgress', label: '🔄 Yarım Bırakanlar', count: counts.inProgress, color: 'bg-amber-100 text-amber-700 border-amber-300' },
          { key: 'notStarted', label: '⏳ Başlamayanlar',    count: counts.notStarted, color: 'bg-red-100 text-red-700 border-red-300'       },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
              filter === f.key
                ? f.color + ' shadow-sm'
                : 'bg-white text-brand-gray border-brand-border hover:bg-brand-lightGray'
            }`}
          >
            {f.label}
            <span className="bg-white/60 px-1.5 py-0.5 rounded-md text-xs font-bold">{f.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-brand-border text-brand-gray text-sm">
          {staff?.length === 0 ? '👥 Bu mağazaya henüz personel eklenmemiş.' : 'Bu filtreyle eşleşen personel bulunamadı.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-brand-border shadow-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-lightGray border-b border-brand-border text-brand-gray text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3 font-semibold">Personel</th>
                <th className="text-left px-5 py-3 font-semibold">Genel İlerleme</th>
                <th className="text-left px-5 py-3 font-semibold">Eğitim</th>
                <th className="text-left px-5 py-3 font-semibold">Son Quiz</th>
                <th className="px-5 py-3 font-semibold text-right">İşlemler</th>
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

                    <td className="px-5 py-4">
                      <span className="text-brand-black font-medium">
                        {s.courses.filter(c => c.status === 'completed').length}
                        <span className="text-brand-gray">/{s.courses.length}</span>
                      </span>
                      <p className="text-xs text-brand-gray">tamamlandı</p>
                    </td>

                    <td className="px-5 py-4">
                      {(() => {
                        const best = s.courses.find(c => c.lastQuizPassed === true)
                          ?? s.courses.find(c => c.lastQuizScore !== null);
                        if (!best) return <span className="text-brand-gray text-xs">—</span>;
                        return (
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${
                            best.lastQuizPassed ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'
                          }`}>
                            {best.lastQuizPassed ? '✅' : '❌'} {best.lastQuizScore}/{best.lastQuizTotal}
                          </span>
                        );
                      })()}
                    </td>

                    <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-brand-gray/40 text-xs cursor-pointer" onClick={() => setExpanded(expanded === s.userId ? null : s.userId)}>
                          {expanded === s.userId ? '▲' : '▼'}
                        </span>
                        {s.overallRate < 100 && (
                          <button
                            onClick={() => handleRemind(s.userId)}
                            disabled={reminding === s.userId || reminded.has(s.userId)}
                            className={`text-xs font-bold text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap ${
                              reminded.has(s.userId) ? 'bg-green-600' : 'bg-brand-red hover:bg-brand-redDark'
                            }`}
                          >
                            {reminding === s.userId ? '...' : reminded.has(s.userId) ? '✓ Gönderildi' : '🔔 Hatırlat'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expanded === s.userId && (
                    <tr key={`${s.userId}-detail`}>
                      <td colSpan={5} className="bg-brand-lightGray/60 px-5 py-4">
                        {s.courses.length === 0 ? (
                          <p className="text-xs text-brand-gray">Henüz atanmış eğitim yok.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {s.courses.map(c => (
                              <div key={c.courseId} className="bg-white rounded-xl border border-brand-border p-4">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <p className="text-xs font-semibold text-brand-black leading-snug flex-1">{c.title}</p>
                                  {c.isMandatory && (
                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md shrink-0">Zorunlu</span>
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
                        )}
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

// ── Yardımcı UI Bileşenleri ───────────────────────────────────────────────────

function RoleBadge({ roleName }: { roleName: string }) {
  const cfg: Record<string, string> = {
    'Admin':                    'bg-purple-100 text-purple-700 border-purple-200',
    'Mağaza Müdürü':            'bg-brand-red/10 text-brand-red border-brand-red/20',
    'Mağaza Müdür Yardımcısı':  'bg-orange-100 text-orange-700 border-orange-200',
    'Satış Danışmanı':          'bg-blue-100 text-blue-700 border-blue-200',
  };
  const cls = cfg[roleName] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${cls}`}>
      {roleName}
    </span>
  );
}

function SummaryCard({ label, value, icon, color = 'text-brand-black' }: {
  label: string; value: string; icon: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-brand-border shadow-sm px-4 py-3 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div>
        <p className={`text-lg font-extrabold ${color}`}>{value}</p>
        <p className="text-xs text-brand-gray">{label}</p>
      </div>
    </div>
  );
}

function ModalShell({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-border w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-border bg-gradient-to-r from-brand-lightGray to-white">
          <h2 className="text-lg font-extrabold text-brand-black">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-brand-lightGray transition-colors text-brand-gray text-lg">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ onClose, onSave, closeLabel = 'İptal', saveLabel = 'Kaydet', disabled = false, hideSave = false, saveStyle = 'primary' }: {
  onClose: () => void;
  onSave?: () => void;
  closeLabel?: string;
  saveLabel?: string;
  disabled?: boolean;
  hideSave?: boolean;
  saveStyle?: 'primary' | 'danger' | 'success';
}) {
  const btnCls: Record<string, string> = {
    primary: 'bg-brand-red hover:bg-brand-redDark',
    danger:  'bg-red-600 hover:bg-red-700',
    success: 'bg-green-600 hover:bg-green-700',
  };

  return (
    <div className="flex items-center justify-end gap-3 mt-6">
      <button
        onClick={onClose}
        className="px-5 py-2.5 rounded-xl border border-brand-border text-sm font-bold text-brand-gray hover:bg-brand-lightGray transition-colors"
      >
        {closeLabel}
      </button>
      {!hideSave && onSave && (
        <button
          onClick={onSave}
          disabled={disabled}
          className={`px-6 py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md ${btnCls[saveStyle]}`}
        >
          {saveLabel}
        </button>
      )}
    </div>
  );
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-brand-black mb-1.5">
        {label} {required && <span className="text-brand-red">*</span>}
        {hint && <span className="text-brand-gray font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="w-8 h-8 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-gray text-sm">{label}</p>
    </div>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="text-center py-12 bg-red-50 rounded-xl border border-red-200 px-6">
      <p className="text-3xl mb-2">⚠️</p>
      <p className="text-red-700 font-bold">{title}</p>
      <p className="text-red-600 text-sm mt-1">{message}</p>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red focus:bg-white';
