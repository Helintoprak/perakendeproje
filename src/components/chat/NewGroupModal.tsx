import { useState, useMemo, useEffect } from 'react';
import api from '../../lib/api';

/**
 * NewGroupModal — yöneticiler için "Yeni Grup Sohbeti" oluşturma penceresi.
 *
 * Akış:
 *   1. Açılınca /feedback/store-users çağrılır → yetkili kullanıcı listesi gelir
 *      (Admin → tüm zincir; Müdür → kendi mağazası — backend zaten kısıtlar)
 *   2. Kullanıcı arama + checkbox ile çoklu seçim yapar, gruba ad verir
 *   3. POST /api/chat/groups ile backend kanalı yaratır + üyeleri ekler
 *   4. onCreated(channelId) callback ile parent kanalı aktif edebilir
 */

interface StoreUser {
  userId:   number;
  fullName: string;
  role:     { roleName: string };
  store?:   { storeName?: string } | null;
}

interface CreateGroupResponse {
  channelId:   string;
  channelType: 'messaging';
  name:        string;
  memberCount: number;
}

interface Props {
  onClose:    () => void;
  onCreated: (channelId: string, channelType: 'messaging') => void;
}

export default function NewGroupModal({ onClose, onCreated }: Props) {
  const [users,        setUsers]        = useState<StoreUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError,   setUsersError]   = useState('');

  const [search, setSearch]       = useState('');
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected]   = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  // Açılışta seçilebilecek personeli çek
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setUsersLoading(true);
        const res = await api.get<StoreUser[]>('/feedback/store-users');
        if (!cancelled) setUsers(res.data ?? []);
      } catch (e: any) {
        if (!cancelled) setUsersError(e?.response?.data?.message ?? 'Kullanıcılar yüklenemedi');
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Anlık arama (isim + mağaza + rol)
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    if (!q) return users;
    return users.filter(u =>
      u.fullName.toLocaleLowerCase('tr').includes(q) ||
      (u.store?.storeName ?? '').toLocaleLowerCase('tr').includes(q) ||
      u.role.roleName.toLocaleLowerCase('tr').includes(q)
    );
  }, [users, search]);

  function toggle(userId: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleCreate() {
    setError('');
    if (!groupName.trim()) {
      setError('Lütfen grup için bir ad girin.');
      return;
    }
    if (selected.size === 0) {
      setError('En az bir üye seçmelisiniz.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<CreateGroupResponse>('/chat/groups', {
        name:      groupName.trim(),
        memberIds: [...selected],
      });
      console.log('[NewGroupModal] ✅ Grup oluşturuldu:', res.data);
      onCreated(res.data.channelId, res.data.channelType);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Grup oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUsers = users.filter(u => selected.has(u.userId));

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-border w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border bg-gradient-to-r from-brand-lightGray to-white">
          <div>
            <h2 className="text-base font-extrabold text-brand-black">👥 Yeni Grup Sohbeti</h2>
            <p className="text-xs text-brand-gray mt-0.5">Üye seçin ve gruba ad verin</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-brand-lightGray text-brand-gray text-lg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Grup adı */}
          <div>
            <label className="block text-xs font-bold text-brand-black mb-1.5">
              Grup Adı <span className="text-brand-red">*</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              maxLength={80}
              placeholder="Örn: Q1 Hedef Toplantısı"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-brand-border bg-brand-lightGray
                focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red focus:bg-white"
            />
          </div>

          {/* Seçili üyeler — chip'ler */}
          {selectedUsers.length > 0 && (
            <div>
              <p className="text-xs font-bold text-brand-black mb-1.5">
                Seçili Üyeler <span className="text-brand-gray font-normal">({selectedUsers.length})</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map(u => (
                  <span
                    key={u.userId}
                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-brand-red/10 text-brand-red text-xs font-semibold rounded-md border border-brand-red/20"
                  >
                    {u.fullName}
                    <button
                      type="button"
                      onClick={() => toggle(u.userId)}
                      className="hover:bg-brand-red/20 rounded w-4 h-4 flex items-center justify-center text-[10px]"
                      aria-label="Kaldır"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Arama */}
          <div>
            <label className="block text-xs font-bold text-brand-black mb-1.5">
              Üye Ara
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray text-sm pointer-events-none">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="İsim, mağaza veya rol..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-brand-border bg-brand-lightGray
                  focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red focus:bg-white"
              />
            </div>
          </div>

          {/* Liste */}
          <div className="border border-brand-border rounded-xl overflow-hidden bg-white">
            {usersLoading ? (
              <div className="text-center py-10 text-brand-gray text-sm">
                <div className="w-6 h-6 border-3 border-brand-red border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Yükleniyor...
              </div>
            ) : usersError ? (
              <div className="text-center py-8 text-brand-red text-sm">⚠️ {usersError}</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-brand-gray text-sm">
                Davet edilebilir personel bulunamadı.
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-brand-gray text-sm">
                🔍 Aramanızla eşleşen kullanıcı yok.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-brand-border">
                {filteredUsers.map(u => {
                  const isSelected = selected.has(u.userId);
                  return (
                    <label
                      key={u.userId}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-brand-red/5' : 'hover:bg-brand-lightGray'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(u.userId)}
                        className="w-4 h-4 accent-brand-red shrink-0"
                      />
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-brand-red text-white' : 'bg-brand-lightGray text-brand-gray'
                      }`}>
                        {u.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-brand-black truncate">{u.fullName}</p>
                        <p className="text-[11px] text-brand-gray truncate">
                          {u.role.roleName}
                          {u.store?.storeName && <span> · {u.store.storeName}</span>}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-brand-border bg-brand-lightGray/40">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-brand-border text-sm font-bold text-brand-gray hover:bg-white"
          >
            İptal
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting || !groupName.trim() || selected.size === 0}
            className="px-5 py-2 rounded-xl bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Oluşturuluyor...' : `Grup Oluştur (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
