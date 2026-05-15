/**
 * Otomatik kapak çıkarıcı — PDF / Video → JPEG Blob
 *
 * Kullanım:
 *   const cover = await extractCoverFromFile(file);
 *   if (cover) formData.append('coverImage', cover, 'cover.jpg');
 *
 * Mantık:
 *   • PDF       → pdfjs-dist ile sayfa #1 canvas'a render → JPEG
 *   • Video     → HTMLVideoElement → 1. saniyede seek → canvas → JPEG
 *   • Diğer     → null (cover üretilmez, backend default davranış)
 *
 * Performans: 1280px max genişlik, 0.85 JPEG kalitesi → ~50-200KB tipik kapak
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Worker'ı global olarak bir kez ayarla (idempotent)
if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.85;

export async function extractCoverFromFile(file: File): Promise<Blob | null> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractFromPdf(file);
  }
  if (file.type.startsWith('video/')) {
    return extractFromVideo(file);
  }
  // PPTX vb. — tarayıcıda render edemiyoruz, backend'in default davranışına bırak
  return null;
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

async function extractFromPdf(file: File): Promise<Blob | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf  = await loadingTask.promise;
    const page = await pdf.getPage(1);

    // Sayfanın doğal boyutunu al, max-width'e ölçekle
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_WIDTH / baseViewport.width, 2); // 2x üstüne çıkma
    const viewport = page.getViewport({ scale });

    const canvas  = document.createElement('canvas');
    canvas.width  = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context alınamadı');

    // pdfjs v4+ render API: { canvasContext, viewport, canvas }
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

    return await canvasToBlob(canvas);
  } catch (e) {
    console.warn('[extractCover] PDF kapak üretilemedi:', e);
    return null;
  }
}

// ─── Video ────────────────────────────────────────────────────────────────────

async function extractFromVideo(file: File): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src         = url;
    video.crossOrigin = 'anonymous';
    video.muted       = true;
    video.playsInline = true;
    video.preload     = 'auto';

    const cleanup = () => URL.revokeObjectURL(url);
    const fail    = (reason: string) => { console.warn('[extractCover] Video frame:', reason); cleanup(); resolve(null); };

    video.addEventListener('loadeddata', () => {
      // 1. saniyeye seek — siyah/blank giriş frame'ini atla
      try { video.currentTime = Math.min(1, video.duration / 2); }
      catch { fail('seek desteklenmiyor'); }
    });

    video.addEventListener('seeked', async () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return fail('boş frame');
        const scale = Math.min(MAX_WIDTH / w, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.floor(w * scale);
        canvas.height = Math.floor(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail('canvas context');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await canvasToBlob(canvas);
        cleanup();
        resolve(blob);
      } catch (e) {
        fail(String(e));
      }
    });

    video.addEventListener('error', () => fail('video yükleme hatası'));

    video.load();
  });
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY);
  });
}
