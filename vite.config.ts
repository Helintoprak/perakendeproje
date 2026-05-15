import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // pdfjs-dist'i Vite'ın pre-bundler'ından (esbuild) hariç tut.
  // Aksi takdirde worker dosyası yanlış resolve edilir ve PDF render olmaz.
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },

  // ─── Production build ─────────────────────────────────────────────────────
  build: {
    outDir:    'dist',
    sourcemap: false,             // prod'da sourcemap kapalı (boyut + IP)
    target:    'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1500,  // pdfjs + stream-chat ağır chunk'lar
    rollupOptions: {
      output: {
        // Vendor chunk'ları ayır — long-term cache için cache-bust riski azalır
        manualChunks: {
          react:      ['react', 'react-dom', 'react-router-dom'],
          recharts:   ['recharts'],
          streamchat: ['stream-chat', 'stream-chat-react'],
          pdfjs:      ['pdfjs-dist', 'react-pdf'],
        },
      },
    },
  },

  // ─── Geliştirme sunucusu (prod build'i etkilemez) ─────────────────────────
  server: {
    port:       9000,
    strictPort: true,
    proxy: {
      '/api': {
        target:       'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 30 * 60 * 1000,
        timeout:      30 * 60 * 1000,
      },
      '/uploads': {
        target:       'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 30 * 60 * 1000,
        timeout:      30 * 60 * 1000,
      },
    },
  },

  // Vercel build cache'inde "preview" output önizleme için
  preview: {
    port: 9000,
  },
});
