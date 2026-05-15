import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export function useApi<T>(url: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setData(null);   // stale verinin yanlış tipte render edilmesini önle
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url, { params });
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [url, JSON.stringify(params)]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
