import { useState, FormEvent, useEffect } from 'react';
import SporthinkLogo from '../components/ui/SporthinkLogo';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Password field'ını temizle (browser auto-fill olmasın)
  useEffect(() => {
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    if (passwordInput) {
      passwordInput.value = '';
    }
  }, []);


  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('E-posta ve şifre zorunludur.'); return; }
    setLoading(true);
    try {
      // Direct API call — AuthContext wraps window navigation
      const { default: api } = await import('../lib/api');
      const { data } = await api.post('/auth/login', { email: email.trim().toLowerCase(), password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/home';
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Giriş başarısız. Bilgilerinizi kontrol edin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sol / Üst — kırmızı marka alanı */}
      <div className="bg-brand-red lg:w-[45%] flex flex-col items-center justify-center p-8 lg:p-16 min-h-[240px] lg:min-h-screen relative overflow-hidden">
        {/* Dekoratif daireler */}
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-white/5 rounded-full" />
        <div className="absolute top-1/3 right-4 w-20 h-20 bg-white/5 rounded-full" />

        <div className="relative z-10 text-center">
          <SporthinkLogo variant="light" size="lg" className="mx-auto" />
          <p className="text-white/75 mt-3 text-sm tracking-wide">spor düşün, pozitif yaşa...</p>

          <div className="mt-10 hidden lg:block">
            <div className="space-y-4 text-left">
              {[
                { icon: '📚', text: 'Kişiselleştirilmiş eğitim içerikleri' },
                { icon: '📊', text: 'Gerçek zamanlı performans takibi' },
                { icon: '🏅', text: 'Gelişim dosyanız her an hazır' },
                { icon: '💬', text: 'Anlık geri bildirim sistemi' },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-3 text-white/90">
                  <span className="text-xl">{f.icon}</span>
                  <span className="text-sm font-medium">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sağ / Alt — form alanı */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-16 bg-white">
        <div className="w-full max-w-sm">
          <h2 className="text-3xl font-extrabold text-brand-black mb-1">Hoş Geldiniz</h2>
          <p className="text-brand-gray text-sm mb-8">Hesabınıza giriş yapın</p>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-brand-black mb-1.5" htmlFor="email">
                E-posta
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@sporthink.com"
                className="w-full px-4 py-3 rounded-xl border border-brand-border bg-brand-lightGray
                  text-brand-black text-sm placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red
                  transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-black mb-1.5" htmlFor="password">
                Şifre
              </label>
              <input
                id="password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-brand-border bg-brand-lightGray
                  text-brand-black text-sm placeholder-gray-400
                  focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red
                  transition-colors"
              />
            </div>

            {error && (
              <div className="bg-brand-redLight border border-brand-redMid text-brand-red text-sm rounded-xl px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-red hover:bg-brand-redDark text-white font-bold py-3.5 rounded-xl
                shadow-[0_4px_14px_0_rgba(212,43,43,0.35)] hover:shadow-[0_6px_20px_0_rgba(212,43,43,0.45)]
                transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Giriş yapılıyor...
                </span>
              ) : 'Giriş Yap'}
            </button>
          </form>

          <p className="text-center text-xs text-brand-gray/60 mt-6">
            © {new Date().getFullYear()} Sporthink — Tüm hakları saklıdır
          </p>
        </div>
      </div>
    </div>
  );
}
