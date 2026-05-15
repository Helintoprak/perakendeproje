import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import api from '../lib/api';

// ─── pdf.js worker — Vite 5 + react-pdf v10 uyumlu ──────────────────────────
// ?url suffix ile Vite doğru dosya yolunu bundlar
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface CoursePart {
  partId:     number;
  partNumber: number;
  title:      string;
  startPage?: number | null;
  endPage?:   number | null;
}

interface CoursePartViewerProps {
  courseId:       number;
  title:          string;
  contentUrl:     string | null;
  totalParts:     number;
  parts:          CoursePart[];
  completedParts: number[];
  onClose:        () => void;
  onUpdate:       () => void;
}

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export default function CoursePartViewer({
  courseId,
  title,
  contentUrl,
  totalParts,
  parts,
  completedParts: initialCompleted,
  onClose,
  onUpdate,
}: CoursePartViewerProps) {
  const partList = effectiveParts(parts, totalParts);

  const [completed,    setCompleted]    = useState<Set<number>>(new Set(initialCompleted));
  const [seenEnds,     setSeenEnds]     = useState<Set<number>>(new Set(initialCompleted));
  const [saving,       setSaving]       = useState<number | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [activePart,   setActivePart]   = useState<number>(() => {
    const first = partList.find(p => !initialCompleted.includes(p.partNumber));
    return first ? first.partNumber : (partList[0]?.partNumber ?? 1);
  });

  const ext    = contentUrl ? (contentUrl.split('.').pop() ?? '').toLowerCase() : '';
  const isPdf  = ext === 'pdf';
  const isPptx = ext === 'pptx' || ext === 'ppt';

  // ESC ile kapat
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function isLocked(partNum: number): boolean {
    if (partNum <= 1) return false;
    return !completed.has(partNum - 1);
  }

  const handleEndReached = useCallback((partNum: number) => {
    setSeenEnds(prev => new Set(prev).add(partNum));
  }, []);

  async function handleComplete(partNum: number) {
    if (completed.has(partNum) || saving !== null) return;
    setSaving(partNum);
    try {
      await api.post(`/courses/${courseId}/parts/${partNum}/complete`);
      setCompleted(prev => new Set(prev).add(partNum));
      setSeenEnds(prev => new Set(prev).add(partNum));
      onUpdate();
      const next = partList.find(p => p.partNumber > partNum && !completed.has(p.partNumber));
      if (next && !isLocked(next.partNumber)) setActivePart(next.partNumber);
    } catch { /* sessiz */ }
    finally { setSaving(null); }
  }

  const completedCount  = completed.size;
  const progress        = totalParts > 0 ? Math.min(100, Math.round((completedCount / totalParts) * 100)) : 0;
  const allDone         = completedCount >= totalParts;
  const progressColor   = allDone ? 'bg-green-500' : progress >= 50 ? 'bg-amber-400' : 'bg-brand-red';

  const currentPart     = partList.find(p => p.partNumber === activePart);
  const isDoneCurrent   = completed.has(activePart);
  const isLockedCurrent = isLocked(activePart);
  const isSavingCurrent = saving === activePart;
  const hasPageRange    = !!(currentPart?.startPage && currentPart?.endPage);
  const canComplete     = !isLockedCurrent && !isDoneCurrent && (!hasPageRange || seenEnds.has(activePart));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900" role="dialog" aria-modal="true">

      {/* ── Üst çubuk ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-950 border-b border-gray-800 shrink-0">
        <button
          onClick={() => setSidebarOpen(s => !s)}
          className="lg:hidden text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
        >☰</button>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors shrink-0"
          title="Kapat (Esc)"
        >✕</button>

        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap font-mono">{completedCount}/{totalParts} bölüm · %{progress}</span>
          </div>
        </div>

        {allDone && (
          <span className="shrink-0 text-xs font-bold text-green-400 bg-green-900/40 border border-green-700 px-3 py-1.5 rounded-lg">
            ✓ Tamamlandı
          </span>
        )}
      </div>

      {/* ── İçerik: Sidebar + Ana alan ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sol Sidebar ── */}
        <aside className={`bg-gray-950 border-r border-gray-800 flex flex-col shrink-0 transition-all duration-200 ${
          sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'
        } lg:w-72`}>
          <div className="px-4 py-3 border-b border-gray-800 shrink-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Bölümler</p>
            <p className="text-xs text-gray-600 mt-0.5">{completedCount} / {totalParts} tamamlandı</p>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {partList.map((part) => {
              const done     = completed.has(part.partNumber);
              const locked   = isLocked(part.partNumber);
              const active   = activePart === part.partNumber;
              const hasRange = !!(part.startPage && part.endPage);

              return (
                <button
                  key={part.partNumber}
                  onClick={() => !locked && setActivePart(part.partNumber)}
                  disabled={locked}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors flex items-start gap-3 ${
                    locked ? 'opacity-40 cursor-not-allowed' :
                    active ? 'bg-gray-800' : 'hover:bg-gray-800/50 cursor-pointer'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                    done   ? 'bg-green-600 text-white' :
                    locked ? 'bg-gray-700 text-gray-500' :
                    active ? 'bg-brand-red text-white' :
                    'bg-gray-700 text-gray-400'
                  }`}>
                    {done ? '✓' : locked ? '🔒' : part.partNumber}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      done ? 'text-green-400' : active ? 'text-white' : locked ? 'text-gray-600' : 'text-gray-300'
                    }`}>{part.title}</p>

                    {hasRange && (
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        s. {part.startPage}–{part.endPage}
                      </p>
                    )}

                    <p className="text-xs mt-0.5">
                      {done   ? <span className="text-green-600">Tamamlandı</span> :
                       locked ? <span className="text-gray-600">Önceki bölümü tamamla</span> :
                       active ? <span className="text-brand-red">Okunuyor</span> :
                       <span className="text-gray-600">Bekliyor</span>}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Sağ: Döküman ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-800">

          {/* Bölüm başlığı + Tamamla butonu */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-700 shrink-0 gap-4">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 font-medium">
                Bölüm {activePart} / {totalParts}
                {currentPart?.startPage && currentPart?.endPage && (
                  <span className="ml-2 text-gray-600 font-mono">
                    · s. {currentPart.startPage}–{currentPart.endPage}
                  </span>
                )}
              </p>
              <p className="text-white font-semibold text-sm truncate">{currentPart?.title ?? ''}</p>
            </div>

            {isDoneCurrent ? (
              <span className="shrink-0 text-xs font-bold text-green-400 bg-green-900/30 border border-green-800 px-3 py-1.5 rounded-lg">
                ✓ Tamamlandı
              </span>
            ) : isLockedCurrent ? (
              <span className="shrink-0 text-xs text-gray-500 bg-gray-700 px-3 py-1.5 rounded-lg">
                🔒 Önceki bölümü tamamla
              </span>
            ) : (
              <button
                onClick={() => handleComplete(activePart)}
                disabled={!canComplete || isSavingCurrent}
                title={
                  !canComplete && hasPageRange
                    ? `Bölümü tamamlamak için ${currentPart?.endPage}. sayfaya kadar okuyun`
                    : 'Bu bölümü tamamlandı olarak işaretle'
                }
                className={`shrink-0 text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
                  canComplete
                    ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                } disabled:opacity-60`}
              >
                {isSavingCurrent ? (
                  <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Kaydediliyor...</>
                ) : canComplete ? (
                  '✓ Okudum / Tamamladım'
                ) : (
                  `🔒 ${currentPart?.endPage}. sayfaya ulaş`
                )}
              </button>
            )}
          </div>

          {/* Döküman içerik alanı */}
          <div className="flex-1 overflow-hidden">
            {!contentUrl ? (
              <NoContent />
            ) : isPdf ? (
              <PartPdfViewer
                key={`pdf-part-${activePart}`}
                contentUrl={contentUrl}
                startPage={currentPart?.startPage ?? null}
                endPage={currentPart?.endPage ?? null}
                alreadyDone={isDoneCurrent}
                onEndReached={() => handleEndReached(activePart)}
              />
            ) : isPptx ? (
              <PptxViewer contentUrl={contentUrl} courseTitle={title} />
            ) : (
              <NoContent />
            )}
          </div>

          {/* Gezinti */}
          <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-t border-gray-700 shrink-0">
            <button
              onClick={() => {
                const prev = [...partList].reverse().find(p => p.partNumber < activePart);
                if (prev) setActivePart(prev.partNumber);
              }}
              disabled={activePart <= (partList[0]?.partNumber ?? 1)}
              className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-30
                px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:cursor-not-allowed"
            >← Önceki</button>

            <span className="text-xs text-gray-600 font-mono">{activePart} / {totalParts}</span>

            <button
              onClick={() => {
                const next = partList.find(p => p.partNumber > activePart && !isLocked(p.partNumber));
                if (next) setActivePart(next.partNumber);
              }}
              disabled={!partList.find(p => p.partNumber > activePart && !isLocked(p.partNumber))}
              className="text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-30
                px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:cursor-not-allowed"
            >Sonraki →</button>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── PDF Sayfa Aralığı Viewer ─────────────────────────────────────────────────

interface PartPdfViewerProps {
  contentUrl:   string;
  startPage:    number | null;
  endPage:      number | null;
  alreadyDone:  boolean;
  onEndReached: () => void;
}

const LOAD_TIMEOUT_MS = 5000;

function PartPdfViewer({ contentUrl, startPage, endPage, alreadyDone, onEndReached }: PartPdfViewerProps) {
  // containerWidth: sayfanın render edilmesi için yeterli genişlik
  // Başlangıç değeri 800 — ResizeObserver tetiklenmeden önce de sayfalar görünür
  const [numDocPages,    setNumDocPages]    = useState(0);
  const [containerWidth, setContainerWidth] = useState(800);
  const [loadError,      setLoadError]      = useState('');
  const [timedOut,       setTimedOut]       = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastPageRef  = useRef<HTMLDivElement>(null);
  const endFiredRef  = useRef(alreadyDone);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Gerçek container genişliğini ölç ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // İlk ölçüm — getBoundingClientRect anlık sonuç verir
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setContainerWidth(Math.floor(initial));

    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── 5 saniyelik yükleme zaman aşımı ──
  useEffect(() => {
    // PDF zaten yüklendiyse veya hata olduysa timer'a gerek yok
    if (numDocPages > 0 || loadError) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      setTimedOut(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [numDocPages, loadError]);

  // ── Zaten tamamlandıysa "son sayfa görüldü" olarak işaretle ──
  useEffect(() => {
    if (alreadyDone && !endFiredRef.current) {
      endFiredRef.current = true;
      onEndReached();
    }
  }, [alreadyDone, onEndReached]);

  // ── Son sayfa viewport'a girince "Tamamla" aktifleşsin ──
  useEffect(() => {
    const el = lastPageRef.current;
    if (!el || endFiredRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !endFiredRef.current) {
          endFiredRef.current = true;
          onEndReached();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numDocPages, onEndReached]);

  // ── Kısa içerik: scroll gerekmiyorsa hemen "görüldü" say ──
  useEffect(() => {
    if (numDocPages === 0 || endFiredRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      if (el.scrollHeight <= el.clientHeight + 10 && !endFiredRef.current) {
        endFiredRef.current = true;
        onEndReached();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [numDocPages, onEndReached]);

  // ── Sayfa aralığı hesapla ──
  const effectiveStart = Math.max(1, startPage ?? 1);
  const effectiveEnd   = numDocPages > 0
    ? Math.min(numDocPages, endPage ?? numDocPages)
    : (endPage ?? 0);
  const pageNumbers    = numDocPages > 0 && effectiveEnd >= effectiveStart
    ? Array.from({ length: effectiveEnd - effectiveStart + 1 }, (_, i) => effectiveStart + i)
    : [];

  // ── Zaman aşımı: yükleme 5s içinde gerçekleşmediyse fallback göster ──
  if (timedOut && numDocPages === 0 && !loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-900/30 border border-amber-700 flex items-center justify-center">
          <span className="text-4xl">⏱</span>
        </div>
        <div>
          <p className="text-white font-semibold text-lg">Döküman yüklenemedi</p>
          <p className="text-gray-400 text-sm mt-1">
            PDF 5 saniye içinde yüklenemedi. Bağlantı sorunu veya büyük dosya boyutu olabilir.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={() => { setTimedOut(false); setLoadError(''); setNumDocPages(0); }}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            🔄 Tekrar Dene
          </button>
          <a
            href={contentUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            ↗ Yeni Sekmede Aç
          </a>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto overflow-x-hidden bg-gray-800">

      {/* ── Hata durumu ── */}
      {loadError ? (
        <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700 flex items-center justify-center">
            <span className="text-4xl">⚠️</span>
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Döküman yüklenemedi</p>
            <p className="text-gray-400 text-sm mt-1">
              Dosyaya erişilemiyor veya bozuk olabilir.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => { setLoadError(''); setNumDocPages(0); setTimedOut(false); }}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              🔄 Tekrar Dene
            </button>
            <a
              href={contentUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              ↗ Yeni Sekmede Aç
            </a>
          </div>
        </div>

      ) : (
        <div className="flex flex-col items-center py-4 gap-2">

          <Document
            file={contentUrl}
            onLoadSuccess={({ numPages }) => {
              setNumDocPages(numPages);
              setTimedOut(false);
            }}
            onLoadError={(e) => {
              console.error('[PDF Load Error]', e);
              setLoadError(e.message || 'Bilinmeyen hata');
            }}
            loading={<PdfLoading message="PDF bağlanıyor..." />}
            error={null /* onLoadError ile handle ediyoruz */}
            options={{
              cMapUrl:    'cmaps/',
              cMapPacked: true,
              // CORS sorunlarını engellemek için withCredentials false
              withCredentials: false,
            }}
          >
            {pageNumbers.map((pageNum, idx) => (
              // Page wrapper:
              //  • w-full: kapsayıcının tam genişliği (max-w-4xl kaldırıldı; Page width
              //    hesabıyla aynı eksende olmadığı için sağ kenarı kestiriyordu)
              //  • px-3: hafif sağ/sol nefes (ana container ile uyumlu kenar boşluğu)
              //  • flex + justify-center: <Page> canvas'ı her zaman merkezli
              <div
                key={pageNum}
                ref={idx === pageNumbers.length - 1 ? lastPageRef : null}
                className="w-full px-3 py-1 flex flex-col items-center"
              >
                <Page
                  pageNumber={pageNum}
                  width={Math.max(containerWidth - 24, 300)}
                  renderTextLayer
                  renderAnnotationLayer
                  loading={<PageLoading />}
                  className="shadow-lg max-w-full"
                />
                <p className="text-center text-xs text-gray-500 py-1 font-mono">
                  Sayfa {pageNum}
                  {endPage && pageNum === effectiveEnd && (
                    <span className="ml-2 text-amber-400">← Bu bölümün son sayfası</span>
                  )}
                </p>
              </div>
            ))}
          </Document>

          {/* PDF henüz yüklenmedi — spinner */}
          {numDocPages === 0 && !loadError && (
            <PdfLoading message="PDF yükleniyor..." />
          )}

          {/* Bölüm sonu özeti */}
          {numDocPages > 0 && pageNumbers.length > 0 && (
            <div className="text-xs text-gray-400 bg-gray-700/60 border border-gray-600 rounded-xl px-4 py-2 mb-4">
              {endPage
                ? `Bu bölüm sayfa ${effectiveStart}–${effectiveEnd} arasını kapsar`
                : 'Tüm döküman bu bölüme aittir'}
            </div>
          )}

          {/* Sayfa aralığı geçersizse uyarı */}
          {numDocPages > 0 && pageNumbers.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="text-4xl">📄</span>
              <p className="text-gray-300 font-medium">Sayfa aralığı bulunamadı</p>
              <p className="text-gray-500 text-sm">
                Bu bölüm için tanımlı sayfa aralığı ({effectiveStart}–{effectiveEnd}) geçersiz.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Yükleniyor Spinner'ları ─────────────────────────────────────────────────

function PdfLoading({ message = 'Yükleniyor...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-gray-300">
      <div className="w-12 h-12 border-4 border-gray-500 border-t-brand-red rounded-full animate-spin" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="w-full h-48 flex items-center justify-center bg-gray-700 rounded my-1">
      <div className="w-8 h-8 border-3 border-gray-500 border-t-white rounded-full animate-spin" />
    </div>
  );
}

// ─── PPTX Viewer ─────────────────────────────────────────────────────────────

function PptxViewer({ contentUrl, courseTitle }: { contentUrl: string; courseTitle: string }) {
  const ext = (contentUrl.split('.').pop() ?? '').toUpperCase();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center">
      <div className="w-20 h-20 rounded-2xl bg-orange-900/30 border border-orange-700 flex items-center justify-center">
        <span className="text-4xl">📊</span>
      </div>
      <div>
        <p className="text-white font-semibold">{courseTitle}</p>
        <span className="inline-block mt-1 text-xs font-bold bg-orange-900/40 text-orange-300 border border-orange-700 px-2 py-0.5 rounded-full">
          {ext}
        </span>
        <p className="text-gray-400 text-sm mt-2">
          Sunum dosyası tarayıcıda önizlenemiyor. Aşağıdaki butonu kullanarak indir,
          ardından <strong className="text-gray-300">"Okudum / Tamamladım"</strong> butonunu kullan.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <a
          href={contentUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-brand-red hover:bg-brand-redDark text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
        >
          📂 Yeni Sekmede Aç
        </a>
        <a
          href={contentUrl}
          download
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
        >
          ⬇ İndir
        </a>
      </div>
    </div>
  );
}

// ─── NoContent ───────────────────────────────────────────────────────────────

function NoContent() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
      <span className="text-4xl">📄</span>
      <p className="text-sm font-medium">Bu eğitim için döküman yüklenmemiş.</p>
    </div>
  );
}

// ─── Yardımcı ────────────────────────────────────────────────────────────────

function effectiveParts(parts: CoursePart[], totalParts: number): CoursePart[] {
  if (parts.length > 0) return parts;
  return Array.from({ length: totalParts }, (_, i) => ({
    partId:     i + 1,
    partNumber: i + 1,
    title:      `Bölüm ${i + 1}`,
    startPage:  null,
    endPage:    null,
  }));
}
