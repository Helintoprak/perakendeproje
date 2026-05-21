import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import SporthinkLogo from '../ui/SporthinkLogo';

interface NavItem {
  path: string;
  label: string;
  managerOnly?: boolean;
  hideForAdmin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/home',        label: 'Anasayfa' },
  { path: '/courses',     label: 'Eğitimlerim' },
  { path: '/profile',     label: 'Gelişim Dosyam', hideForAdmin: true },
  { path: '/performance', label: 'Performans Takibi' },
  { path: '/feedback',    label: 'Geri Bildirim' },
  { path: '/pulse',       label: 'Nabız Anketi' },
  { path: '/community',   label: 'Topluluk' },
  { path: '/meeting',     label: 'Toplantı' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { user, logout, isManager, isRegionalManager, isAdmin } = useAuth();
  const location = useLocation();

  const roleLabel: Record<string, string> = {
    'Müdür': 'Mağaza Müdürü',
    'Bölge Müdürü': 'Bölge Müdürü',
    'Satış Danışmanı': 'Satış Danışmanı',
    'Eğitim Uzmanı': 'Eğitim Uzmanı',
    'Admin': 'Sistem Yöneticisi',
  };

  return (
    <>
      {/* Mobil overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-screen w-72 bg-brand-red text-white shadow-2xl z-50
        flex flex-col transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:z-auto
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo alanı */}
        <div className="px-6 pt-6 pb-4 border-b border-white/10">
          <SporthinkLogo variant="light" size="sm" />
          <p className="text-[10px] text-white/60 mt-1.5 tracking-[0.2em] uppercase font-medium">
            spor düşün, pozitif yaşa...
          </p>
        </div>

        {/* Kullanıcı bilgisi */}
        <div className="px-6 py-3 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white text-brand-red flex items-center justify-center font-black text-lg shadow-lg shrink-0">
              {user?.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate leading-tight">{user?.fullName}</p>
              <p className="text-[11px] text-white/70 font-medium mt-0.5">
                {roleLabel[user?.role ?? ''] ?? user?.role}
              </p>
            </div>
          </div>
          {user?.store && (
            <div className="mt-2 flex items-center gap-2 text-xs text-white/80 bg-black/20 rounded-lg px-2.5 py-1.5 border border-white/5">
              <span className="truncate font-medium">{user.store}</span>
            </div>
          )}
        </div>

        {/* Navigasyon */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto no-scrollbar">
          {NAV_ITEMS.filter(item => (!item.managerOnly || isManager || isRegionalManager) && !(item.hideForAdmin && isAdmin)).map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold
                  transition-all duration-200
                  ${active
                    ? 'bg-white text-brand-red shadow-xl scale-[1.02]'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'}
                `}
              >
                <span>{item.label}</span>
                {active && <span className="ml-auto w-2 h-2 rounded-full bg-brand-red" />}
              </NavLink>
            );
          })}

          {/* Müdür özel bölüm */}
          {(isManager || isRegionalManager) && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  Yönetim
                </p>
              </div>
              <NavLink
                to="/team"
                onClick={onClose}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold
                  transition-all duration-200
                  ${isActive
                    ? 'bg-white text-brand-red shadow-xl scale-[1.02]'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'}
                `}
              >
                <span>Ekip Yönetimi</span>
                {location.pathname.startsWith('/team') && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-brand-red" />
                )}
              </NavLink>
            </>
          )}

          {/* Admin özel bölüm */}
          {isAdmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  Sistem Yönetimi
                </p>
              </div>
              {[
                { path: '/admin', label: 'Merkezi Yönetim' },
                { path: '/team',  label: 'Ekip Yönetimi' },
                { path: '/logs',  label: 'Sistem Logları' },
              ].map(item => {
                const active = location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold
                      transition-all duration-200
                      ${active
                        ? 'bg-white text-brand-red shadow-xl scale-[1.02]'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'}
                    `}
                  >
                    <span>{item.label}</span>
                    {active && <span className="ml-auto w-2 h-2 rounded-full bg-brand-red" />}
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        {/* Alt çıkış butonu */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-white/80 hover:bg-white hover:text-brand-red transition-all duration-300 group shadow-sm hover:shadow-xl"
          >
            <span>Çıkış Yap</span>
          </button>
        </div>
      </aside>
    </>
  );
}
