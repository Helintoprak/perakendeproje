import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

interface Notification {
  notifId:   number;
  type:      string;
  message:   string;
  isRead:    boolean;
  createdAt: string;
}

interface Props {
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, onMenuClick, actions }: Props) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [isOpen, setIsOpen]               = useState(false);
  const [loading, setLoading]             = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Okunmamış bildirim sayısını her 30 sn'de bir çek
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count);
    } catch { /* sessiz */ }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Dropdown açıldığında bildirimleri getir
  async function handleToggle() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    setIsOpen(true);
    setLoading(true);
    try {
      const { data } = await api.get<Notification[]>('/notifications');
      setNotifications(data);
    } catch { /* sessiz */ }
    finally { setLoading(false); }
  }

  // Tek bildirimi okundu yap
  async function handleMarkRead(notifId: number) {
    try {
      await api.put(`/notifications/${notifId}/read`);
      setNotifications(prev => prev.map(n => n.notifId === notifId ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* sessiz */ }
  }

  // Tümünü okundu yap
  async function handleMarkAllRead() {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* sessiz */ }
  }

  // Dropdown dışına tıklayınca kapat
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'az önce';
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} sa önce`;
    const days = Math.floor(hours / 24);
    return `${days} gün önce`;
  }

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-brand-border px-4 lg:px-8 py-5 flex items-center gap-4">
      {/* Hamburger (mobil) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2.5 rounded-xl text-brand-gray hover:bg-brand-lightGray transition-all border border-brand-border shadow-sm active:scale-95"
        aria-label="Menü"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Başlık */}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl lg:text-2xl font-black text-brand-black tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-xs lg:text-sm text-brand-gray font-medium mt-0.5">{subtitle}</p>}
      </div>

      {/* Sağ aksiyonlar */}
      <div className="flex items-center gap-3">
        {actions}
        
        {/* Bildirim Zili */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleToggle}
            className={`group relative p-2.5 rounded-xl transition-all duration-300 border shadow-sm active:scale-95 ${
              isOpen
                ? 'bg-brand-red text-white border-brand-redDark shadow-lg'
                : 'text-brand-gray hover:bg-brand-red hover:text-white border-transparent hover:border-brand-redDark hover:shadow-lg'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-brand-red text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 border-2 border-white shadow-md animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {isOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl border border-brand-border shadow-2xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-brand-lightGray">
                <h3 className="text-sm font-bold text-brand-black">🔔 Bildirimler</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-bold text-brand-red hover:text-brand-redDark transition-colors"
                  >
                    Tümünü okundu yap
                  </button>
                )}
              </div>

              {/* İçerik */}
              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-10 text-brand-gray">
                    <p className="text-3xl mb-2">🔕</p>
                    <p className="text-sm font-medium">Henüz bildirim yok</p>
                  </div>
                ) : (
                  <div className="divide-y divide-brand-border">
                    {notifications.map(n => (
                      <button
                        key={n.notifId}
                        onClick={() => !n.isRead && handleMarkRead(n.notifId)}
                        className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${
                          n.isRead
                            ? 'bg-white hover:bg-brand-lightGray/50'
                            : 'bg-brand-red/5 hover:bg-brand-red/10'
                        }`}
                      >
                        {/* Okunmamış göstergesi */}
                        <div className="pt-1.5 shrink-0">
                          {!n.isRead ? (
                            <span className="w-2.5 h-2.5 bg-brand-red rounded-full block shadow-sm" />
                          ) : (
                            <span className="w-2.5 h-2.5 bg-brand-border rounded-full block" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${n.isRead ? 'text-brand-gray' : 'text-brand-black font-semibold'}`}>
                            {n.message}
                          </p>
                          <p className="text-[10px] text-brand-gray/70 mt-1 font-medium">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                        {/* Tip ikonu */}
                        <span className="text-lg shrink-0">
                          {n.type === 'reminder' ? '📚' : n.type === 'leave' ? '📅' : '🔔'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profil Kısa Bilgi (Desktop) */}
        <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-brand-border">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-brand-black leading-none">{user?.fullName.split(' ')[0]}</p>
            <p className="text-[10px] font-bold text-brand-red uppercase tracking-wider mt-1">Mağaza</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-red flex items-center justify-center text-white font-black text-base shadow-md border-2 border-white">
            {user?.fullName.charAt(0)}
          </div>
        </div>
      </div>
    </header>
  );
}
