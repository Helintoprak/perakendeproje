import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/':            { title: 'Anasayfa',          subtitle: 'Genel bakış ve performans özeti' },
  '/home':        { title: 'Anasayfa',          subtitle: 'Genel bakış ve performans özeti' },
  '/courses':     { title: 'Eğitimlerim',       subtitle: 'Atanmış ve devam eden kurslar' },
  '/profile':     { title: 'Gelişim Dosyam',    subtitle: 'Tamamlanan eğitimler ve KPI geçmişi' },
  '/performance': { title: 'Performans Takibi', subtitle: 'KPI hedefleri ve gerçekleşmeler' },
  '/feedback':    { title: 'Geri Bildirim',     subtitle: 'Mağaza operasyonları ve süreç bildirimleri' },
  '/pulse':       { title: 'Nabız Anketi',      subtitle: 'Aylık motivasyon ve mağaza operasyon ölçümü' },
  '/community':   { title: 'Topluluk',          subtitle: 'Sporthink ailesi ile etkileşim' },
  '/team':        { title: 'Ekip Yönetimi' },
  '/meeting':     { title: 'Toplantı',          subtitle: 'Toplantı sırasında gerçek zamanlı sohbet' },
};

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] || PAGE_META['/'];

  return (
    <div className="flex min-h-screen bg-white">
      {/* Sabit Sidebar - Desktop için yer tutucu */}
      <div className="hidden lg:block w-72 shrink-0" />
      
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
