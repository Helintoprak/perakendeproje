import axios from 'axios';

/**
 * API base URL stratejisi:
 *
 *   • Dev: VITE_API_BASE_URL tanımsız → '/api' (Vite dev proxy 5000'e iletir)
 *   • Prod: VITE_API_BASE_URL = 'https://api.sporthink.com' (Render backend URL'i)
 *           → '/api' otomatik append edilir (yani değer SONUNDA /api olmasın)
 *
 * .env.example'da VITE_API_BASE_URL boş tutulur — dev'de proxy yeterli.
 */
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const API_BASE = RAW_BASE ? `${RAW_BASE}/api` : '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
