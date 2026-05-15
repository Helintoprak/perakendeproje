import { useState, useEffect, useRef } from 'react';
import { useApi } from '../../hooks/useApi';
import api from '../../lib/api';

export interface StaffBasic {
  userId: number;
  fullName: string;
  role: string;
}

interface RoleItem {
  roleId: number;
  roleName: string;
}

interface PromotionLogItem {
  id: number;
  oldRole: { roleName: string };
  newRole: { roleName: string };
  promoter: { fullName: string };
  note: string | null;
  createdAt: string;
}

export function ActionMenu({ isOpen, onToggle, onPromote }: {
  isOpen: boolean;
  onToggle: () => void;
  onPromote: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (isOpen) onToggle();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-brand-lightGray transition-colors text-brand-gray hover:text-brand-black"
        title="İşlemler"
      >
        <span className="text-lg">⚙️</span>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-brand-border rounded-xl shadow-xl py-1.5 min-w-[220px]">
          <button
            onClick={onPromote}
            className="w-full text-left px-4 py-2.5 text-sm font-semibold text-brand-black hover:bg-brand-lightGray transition-colors flex items-center gap-3"
          >
            <span className="text-base">🔄</span>
            <div>
              <p className="font-bold">Rolü Değiştir / Terfi Ettir</p>
              <p className="text-[10px] text-brand-gray font-normal">Personelin rolünü güncelle</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

export function PromotionModal({ staff, onClose, onSuccess }: {
  staff: StaffBasic;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { data: roles }        = useApi<RoleItem[]>('/users/roles');
  const { data: promoHistory } = useApi<PromotionLogItem[]>(`/users/${staff.userId}/promotions`);

  const [newRoleId,   setNewRoleId]   = useState<number | null>(null);
  const [note,        setNote]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [successMsg,  setSuccessMsg]  = useState('');

  const currentRole   = roles?.find(r => r.roleName === staff.role);
  const selectedRole  = roles?.find(r => r.roleId === newRoleId);

  async function handleSubmit() {
    if (!newRoleId) return;
    setSubmitting(true);
    setError('');
    try {
      await api.put(`/users/${staff.userId}/role`, { newRoleId, note: note.trim() || undefined });
      setSuccessMsg(`${staff.fullName} başarıyla "${selectedRole?.roleName}" rolüne atandı. 🎉`);
      setTimeout(() => { onSuccess(); }, 1800);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Terfi işlemi başarısız oldu.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-border w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-6 py-5 border-b border-brand-border bg-gradient-to-r from-brand-lightGray to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-red to-brand-redDark flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {staff.fullName.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-brand-black">Terfi / Rol Değiştir</h2>
                <p className="text-xs text-brand-gray">{staff.fullName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-brand-lightGray transition-colors text-brand-gray hover:text-brand-black text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Mevcut Rol */}
          <div className="flex items-center gap-3 p-4 bg-brand-lightGray rounded-xl border border-brand-border">
            <div className="w-10 h-10 rounded-xl bg-brand-black/10 flex items-center justify-center">
              <span className="text-lg">👤</span>
            </div>
            <div>
              <p className="text-[10px] text-brand-gray font-bold uppercase tracking-wider">Mevcut Rol</p>
              <p className="text-sm font-bold text-brand-black">{staff.role}</p>
            </div>
          </div>

          {/* Yeni Rol Seçimi */}
          <div>
            <label className="block text-xs font-bold text-brand-black mb-2">
              Yeni Rol Seçin <span className="text-brand-red">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2">
              {roles?.filter(r => r.roleId !== currentRole?.roleId).map(r => (
                <button
                  key={r.roleId}
                  type="button"
                  onClick={() => setNewRoleId(r.roleId)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    newRoleId === r.roleId
                      ? 'border-brand-red bg-brand-red/5 shadow-sm'
                      : 'border-brand-border bg-white hover:bg-brand-lightGray'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    newRoleId === r.roleId
                      ? 'border-brand-red bg-brand-red'
                      : 'border-brand-gray'
                  }`} />
                  <p className={`text-sm font-semibold ${newRoleId === r.roleId ? 'text-brand-red' : 'text-brand-black'}`}>
                    {r.roleName}
                  </p>
                  {newRoleId === r.roleId && (
                    <span className="ml-auto text-brand-red text-xs font-bold">✓ Seçildi</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Terfi Notu */}
          <div>
            <label className="block text-xs font-bold text-brand-black mb-1.5">
              Terfi Notu <span className="text-brand-gray font-normal">(opsiyonel)</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Terfi sebebi veya kariyer notu yazın..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-lightGray text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
            />
          </div>

          {/* Başarı */}
          {successMsg && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold">
              <span>🎉</span> {successMsg}
            </div>
          )}

          {/* Hata */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Kariyer Geçmişi */}
          {promoHistory && promoHistory.length > 0 && (
            <div>
              <p className="text-xs font-bold text-brand-black mb-2 flex items-center gap-1.5">
                <span>📋</span> Kariyer Geçmişi
              </p>
              <div className="space-y-2 max-h-[180px] overflow-y-auto">
                {promoHistory.map(log => (
                  <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 bg-brand-lightGray rounded-lg border border-brand-border">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs">🎉</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-brand-black">
                        {log.oldRole.roleName} <span className="text-brand-gray">→</span> {log.newRole.roleName}
                      </p>
                      <p className="text-[10px] text-brand-gray mt-0.5">
                        {log.promoter.fullName} tarafından · {new Date(log.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {log.note && (
                        <p className="text-[10px] text-brand-gray mt-1 italic">"{log.note}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-brand-border bg-brand-lightGray/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-brand-border text-sm font-bold text-brand-gray hover:bg-white transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newRoleId || submitting}
            className="px-6 py-2.5 rounded-xl bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(179,0,0,0.2)]"
          >
            {submitting ? 'İşleniyor...' : '🎉 Terfi Et'}
          </button>
        </div>
      </div>
    </div>
  );
}
