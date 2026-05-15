import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface QuizQuestion {
  id:       number;
  question: string;
  options:  string[];
}

interface QuizData {
  quizId:         number;
  quizTitle:      string;
  totalQuestions: number;
  passScore:      number;
  questions:      QuizQuestion[];
}

interface SubmitResult {
  attemptId: number;
  score:     number;
  total:     number;
  isPassed:  boolean;
  passScore: number;
  results: {
    questionId:   number;
    question:     string;
    options:      string[];
    userAnswer:   number;
    correctIndex: number;
    isCorrect:    boolean;
  }[];
}

interface LatestAttempt {
  attemptId:   number;
  score:       number;
  isPassed:    boolean;
  attemptDate: string;
}

export interface QuizModalProps {
  courseId:    number;
  courseTitle: string;
  onClose:     () => void;
}

type Screen = 'loading' | 'queued' | 'error' | 'intro' | 'question' | 'submitting' | 'result';

const LETTERS      = ['A', 'B', 'C', 'D'];
const POLL_INTERVAL = 12_000; // 12 saniyede bir sorgula

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────

export default function QuizModal({ courseId, courseTitle, onClose }: QuizModalProps) {
  const [screen,         setScreen]         = useState<Screen>('loading');
  const [errorMsg,       setErrorMsg]       = useState('');
  const [quiz,           setQuiz]           = useState<QuizData | null>(null);
  const [latestAttempt,  setLatestAttempt]  = useState<LatestAttempt | null>(null);
  const [currentIdx,     setCurrentIdx]     = useState(0);
  const [answers,        setAnswers]        = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState(-1);
  const [result,         setResult]         = useState<SubmitResult | null>(null);
  const [showReview,     setShowReview]     = useState(false);

  // Job polling state
  const [jobId,       setJobId]       = useState<string | null>(null);
  const [jobAttempts, setJobAttempts] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // StrictMode çift mount koruması
  const initRef = useRef(false);

  // ESC ile kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ── Quiz yükle veya job başlat ──────────────────────────────────────────────
  const loadOrGenerate = useCallback(async () => {
    setScreen('loading');
    setErrorMsg('');
    try {
      // Mevcut quiz veya aktif job?
      const { data: existing } = await api.get(`/quiz/course/${courseId}`);

      if (existing.quiz) {
        setQuiz(existing.quiz);
        setLatestAttempt(existing.latestAttempt);
        setAnswers(new Array(existing.quiz.totalQuestions).fill(-1));
        setScreen('intro');
        return;
      }

      if (existing.jobId) {
        // Önceden başlatılmış job var — doğrudan polling'e geç
        setJobId(existing.jobId);
        setScreen('queued');
        return;
      }

      // Yeni job başlat — anında döner
      const { data: gen } = await api.post(`/quiz/course/${courseId}/generate`, {});

      if (gen.status === 'ready' && gen.quiz) {
        setQuiz(gen.quiz);
        setAnswers(new Array(gen.quiz.totalQuestions).fill(-1));
        setLatestAttempt(null);
        setScreen('intro');
      } else if (gen.jobId) {
        setJobId(gen.jobId);
        setJobAttempts(0);
        setScreen('queued');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message ?? err.message ?? 'Quiz yüklenemedi.');
      setScreen('error');
    }
  }, [courseId]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadOrGenerate();
  }, [loadOrGenerate]);

  // ── Polling: screen === 'queued' iken ──────────────────────────────────────
  useEffect(() => {
    if (screen !== 'queued' || !jobId) return;

    const poll = async () => {
      try {
        const { data } = await api.get(`/quiz/job/${jobId}`);
        setLastChecked(new Date());
        setJobAttempts(data.attempts ?? 0);

        if (data.status === 'ready' && data.quiz) {
          setQuiz(data.quiz);
          setAnswers(new Array(data.quiz.totalQuestions).fill(-1));
          setLatestAttempt(null);
          setScreen('intro');
        } else if (data.status === 'error') {
          setErrorMsg(data.error ?? 'Quiz üretilemedi. Tekrar deneyin.');
          setScreen('error');
        }
        // 'pending' | 'processing' → polling devam eder
      } catch (err: any) {
        if (err.response?.status === 404) {
          // Job bellekten silinmiş (sunucu yeniden başlatıldı?) → sıfırdan dene
          loadOrGenerate();
        }
        // Diğer ağ hatalarını sessizce geç — bir sonraki poll'da tekrar dener
      }
    };

    poll(); // Hemen bir kez çalıştır
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [screen, jobId, loadOrGenerate]);

  // ── Quiz aksiyonları ───────────────────────────────────────────────────────
  function startQuiz() {
    setCurrentIdx(0);
    setAnswers(new Array(quiz!.totalQuestions).fill(-1));
    setSelectedOption(-1);
    setResult(null);
    setShowReview(false);
    setScreen('question');
  }

  function handleNext() {
    if (selectedOption === -1) return;
    const updated = [...answers];
    updated[currentIdx] = selectedOption;
    setAnswers(updated);
    if (currentIdx < quiz!.questions.length - 1) {
      setCurrentIdx(i => i + 1);
      setSelectedOption(-1);
    } else {
      submitAnswers(updated);
    }
  }

  function handlePrev() {
    if (currentIdx === 0) return;
    setCurrentIdx(i => i - 1);
    setSelectedOption(answers[currentIdx - 1]);
  }

  async function submitAnswers(finalAnswers: number[]) {
    if (!quiz) return;
    setScreen('submitting');
    try {
      const { data } = await api.post(`/quiz/${quiz.quizId}/submit`, { answers: finalAnswers });
      setResult(data);
      setScreen('result');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message ?? 'Sonuçlar kaydedilemedi.');
      setScreen('error');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">

        {/* Üst bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-brand-red to-red-700 shrink-0">
          <div className="min-w-0">
            <p className="text-white/80 text-xs font-medium uppercase tracking-wide">Eğitim Quizi</p>
            <h2 className="text-white font-bold text-base leading-tight truncate">{courseTitle}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors shrink-0 ml-3"
          >✕</button>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Yükleniyor ── */}
          {screen === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-5 py-16 px-8">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-brand-red/20 border-t-brand-red animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center text-3xl">🤖</span>
              </div>
              <div className="text-center space-y-1">
                <p className="text-brand-black font-bold text-lg">Kontrol ediliyor...</p>
                <p className="text-brand-gray text-sm">Quiz durumu sorgulanıyor.</p>
              </div>
            </div>
          )}

          {/* ── Sırada / Arka Planda Üretiliyor ── */}
          {screen === 'queued' && (
            <div className="flex flex-col items-center justify-center gap-6 py-12 px-8 text-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center text-4xl">⏳</span>
              </div>

              <div className="space-y-2">
                <p className="text-brand-black font-extrabold text-xl">Quiz hazırlanıyor</p>
                <p className="text-brand-gray text-sm leading-relaxed max-w-sm">
                  AI servisinin dakika kotası dolduğunda quiz üretimi otomatik olarak devam edecek.
                  Bu ekranı açık tutmanıza gerek yok.
                </p>
              </div>

              {/* Durum kartı */}
              <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3 text-left">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-700 font-semibold">Durum</span>
                  <span className="flex items-center gap-1.5 font-bold text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    Sırada bekliyor
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-700 font-semibold">Deneme</span>
                  <span className="font-bold text-amber-800">{jobAttempts} / 10</span>
                </div>
                {lastChecked && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-amber-700 font-semibold">Son kontrol</span>
                    <span className="text-amber-800">
                      {lastChecked.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-amber-200">
                  <p className="text-xs text-amber-600">
                    Her {POLL_INTERVAL / 1000} saniyede bir otomatik kontrol yapılıyor.
                    Quiz hazır olduğunda bu ekran kendiliğinden açılacak.
                  </p>
                </div>
              </div>

              {/* Gemini kota bilgisi */}
              <div className="w-full bg-blue-50 border border-blue-200 rounded-2xl p-4 text-left">
                <p className="text-blue-800 text-xs font-semibold mb-1">ℹ️ Neden bu kadar sürüyor?</p>
                <p className="text-blue-700 text-xs leading-relaxed">
                  Gemini ücretsiz planı dakikada 15 istek ile sınırlıdır. Kota dolduğunda sistem
                  otomatik olarak 65 saniye bekleyip yeniden dener.
                </p>
              </div>

              <button
                onClick={onClose}
                className="text-brand-gray hover:text-brand-black text-sm font-medium transition-colors underline underline-offset-4"
              >
                Kapat (arka planda devam eder)
              </button>
            </div>
          )}

          {/* ── Hata ── */}
          {screen === 'error' && (
            <div className="flex flex-col items-center justify-center gap-5 py-16 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
                <span className="text-4xl">⚠️</span>
              </div>
              <div>
                <p className="text-brand-black font-bold text-lg">Bir sorun oluştu</p>
                <p className="text-brand-gray text-sm mt-2 max-w-sm">{errorMsg}</p>
              </div>
              <button
                onClick={loadOrGenerate}
                className="bg-brand-red hover:bg-brand-redDark text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
              >
                🔄 Tekrar Dene
              </button>
            </div>
          )}

          {/* ── Intro ── */}
          {screen === 'intro' && quiz && (
            <div className="p-8 space-y-6">
              {latestAttempt && (
                <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
                  latestAttempt.isPassed ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <span className="text-3xl">{latestAttempt.isPassed ? '🏆' : '📊'}</span>
                  <div>
                    <p className={`font-bold text-sm ${latestAttempt.isPassed ? 'text-green-700' : 'text-amber-700'}`}>
                      {latestAttempt.isPassed ? 'Geçmiş denemenizde başardınız!' : 'Geçmiş denemeniz'}
                    </p>
                    <p className="text-xs text-brand-gray mt-0.5">
                      Puan: {latestAttempt.score}/{quiz.totalQuestions} · {new Date(latestAttempt.attemptDate).toLocaleDateString('tr-TR')}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: '📝', label: 'Soru Sayısı',  value: `${quiz.totalQuestions} soru` },
                  { icon: '✅', label: 'Geçme Notu',   value: `${quiz.passScore}/${quiz.totalQuestions}` },
                  { icon: '🎯', label: 'Başarı Oranı', value: `%${Math.round((quiz.passScore / quiz.totalQuestions) * 100)}` },
                ].map(card => (
                  <div key={card.label} className="bg-brand-lightGray rounded-2xl p-4 text-center border border-brand-border">
                    <span className="text-2xl">{card.icon}</span>
                    <p className="text-brand-black font-bold text-lg mt-1">{card.value}</p>
                    <p className="text-brand-gray text-xs mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700 flex gap-3 items-start">
                <span className="text-xl shrink-0">ℹ️</span>
                <p>Bu quiz, eğitim dökümanındaki konulara dayalı olarak AI tarafından üretilmiştir.
                  Her soruyu dikkatlice okuyun. Önceki sorulara geri dönebilirsiniz.</p>
              </div>

              <button
                onClick={startQuiz}
                className="w-full bg-brand-red hover:bg-brand-redDark text-white font-bold py-4 rounded-2xl
                  text-base transition-colors shadow-[0_4px_16px_rgba(212,43,43,0.3)] flex items-center justify-center gap-2"
              >
                🚀 {latestAttempt ? 'Tekrar Başla' : 'Quizi Başlat'}
              </button>
            </div>
          )}

          {/* ── Soru ── */}
          {screen === 'question' && quiz && (
            <QuestionScreen
              quiz={quiz}
              currentIdx={currentIdx}
              selectedOption={selectedOption}
              onSelectOption={setSelectedOption}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          )}

          {/* ── Gönderiliyor ── */}
          {screen === 'submitting' && (
            <div className="flex flex-col items-center justify-center gap-5 py-20 px-8">
              <div className="w-16 h-16 rounded-full border-4 border-brand-red/20 border-t-brand-red animate-spin" />
              <p className="text-brand-black font-semibold">Sonuçlar hesaplanıyor...</p>
            </div>
          )}

          {/* ── Sonuç ── */}
          {screen === 'result' && result && quiz && (
            <ResultScreen
              result={result}
              showReview={showReview}
              onToggleReview={() => setShowReview(v => !v)}
              onRetry={startQuiz}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Soru Ekranı ──────────────────────────────────────────────────────────────

function QuestionScreen({ quiz, currentIdx, selectedOption, onSelectOption, onNext, onPrev }: {
  quiz:           QuizData;
  currentIdx:     number;
  selectedOption: number;
  onSelectOption: (i: number) => void;
  onNext:         () => void;
  onPrev:         () => void;
}) {
  const q        = quiz.questions[currentIdx];
  const isLast   = currentIdx === quiz.questions.length - 1;
  const progress = ((currentIdx + 1) / quiz.totalQuestions) * 100;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 pb-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-brand-gray">Soru {currentIdx + 1} / {quiz.totalQuestions}</span>
          <span className="text-xs font-bold text-brand-red">%{Math.round(progress)}</span>
        </div>
        <div className="w-full h-2 bg-brand-border rounded-full overflow-hidden">
          <div className="h-full bg-brand-red rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="px-6 pt-2 pb-4 shrink-0">
        <div className="bg-brand-lightGray rounded-2xl p-5 border border-brand-border">
          <p className="text-sm font-bold text-brand-black leading-relaxed">
            <span className="text-brand-red mr-1">{currentIdx + 1}.</span>
            {q.question}
          </p>
        </div>
      </div>

      <div className="px-6 pb-4 flex-1 space-y-3">
        {q.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onSelectOption(i)}
            className={`w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 transition-all ${
              selectedOption === i
                ? 'border-brand-red bg-brand-redLight shadow-[0_0_0_3px_rgba(212,43,43,0.15)]'
                : 'border-brand-border bg-white hover:border-brand-red/40 hover:bg-brand-redLight/30'
            }`}
          >
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
              selectedOption === i ? 'bg-brand-red text-white' : 'bg-brand-lightGray text-brand-gray border border-brand-border'
            }`}>
              {LETTERS[i]}
            </span>
            <span className={`text-sm font-medium ${selectedOption === i ? 'text-brand-red' : 'text-brand-black'}`}>
              {opt}
            </span>
          </button>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-brand-border bg-white shrink-0 flex items-center justify-between gap-3">
        <button
          onClick={onPrev}
          disabled={currentIdx === 0}
          className="px-4 py-2.5 rounded-xl border border-brand-border text-brand-gray font-semibold text-sm
            hover:bg-brand-lightGray transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Önceki
        </button>
        {selectedOption === -1 && (
          <span className="text-xs text-brand-gray text-center">Bir seçenek seçin</span>
        )}
        <button
          onClick={onNext}
          disabled={selectedOption === -1}
          className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
            selectedOption !== -1
              ? 'bg-brand-red hover:bg-brand-redDark text-white shadow-[0_2px_8px_rgba(212,43,43,0.3)]'
              : 'bg-brand-border text-brand-gray cursor-not-allowed'
          }`}
        >
          {isLast ? '✓ Tamamla' : 'Sonraki →'}
        </button>
      </div>
    </div>
  );
}

// ─── Sonuç Ekranı ─────────────────────────────────────────────────────────────

function ResultScreen({ result, showReview, onToggleReview, onRetry, onClose }: {
  result:         SubmitResult;
  showReview:     boolean;
  onToggleReview: () => void;
  onRetry:        () => void;
  onClose:        () => void;
}) {
  const percent = Math.round((result.score / result.total) * 100);

  return (
    <div className="p-6 space-y-5">
      <div className={`rounded-3xl p-6 text-center border-2 ${result.isPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="text-6xl mb-3">{result.isPassed ? '🏆' : '😔'}</div>
        <h3 className={`text-2xl font-extrabold mb-1 ${result.isPassed ? 'text-green-700' : 'text-red-700'}`}>
          {result.isPassed ? 'Başarılı!' : 'Başarısız'}
        </h3>
        <p className={`text-sm mb-4 ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>
          {result.isPassed
            ? 'Tebrikler! Eğitimi başarıyla tamamladınız.'
            : `Geçme notu: ${result.passScore}/${result.total}. Tekrar deneyebilirsiniz.`}
        </p>
        <div className="flex items-center justify-center gap-6">
          <div className="text-center">
            <p className={`text-4xl font-extrabold ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>{result.score}</p>
            <p className="text-xs text-brand-gray mt-0.5">Doğru</p>
          </div>
          <div className="text-3xl text-brand-border">/</div>
          <div className="text-center">
            <p className="text-4xl font-extrabold text-brand-black">{result.total}</p>
            <p className="text-xs text-brand-gray mt-0.5">Toplam</p>
          </div>
          <div className="text-3xl text-brand-border">·</div>
          <div className="text-center">
            <p className={`text-4xl font-extrabold ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>%{percent}</p>
            <p className="text-xs text-brand-gray mt-0.5">Başarı</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {result.results.map((r, i) => (
          <div
            key={i}
            title={`Soru ${i + 1}: ${r.isCorrect ? 'Doğru' : 'Yanlış'}`}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
              r.isCorrect ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      <button
        onClick={onToggleReview}
        className="w-full py-2.5 px-4 rounded-xl border-2 border-brand-border text-brand-black font-semibold text-sm
          hover:bg-brand-lightGray transition-colors flex items-center justify-center gap-2"
      >
        {showReview ? '▲ Cevapları Gizle' : '▼ Cevapları İncele'}
      </button>

      {showReview && (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {result.results.map((r, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${r.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-sm font-semibold text-brand-black mb-3">
                <span className={`mr-1.5 font-bold ${r.isCorrect ? 'text-green-600' : 'text-red-600'}`}>{i + 1}.</span>
                {r.question}
              </p>
              <div className="space-y-1.5">
                {r.options.map((opt, j) => {
                  const isCorrect  = j === r.correctIndex;
                  const isSelected = j === r.userAnswer;
                  let cls = 'text-brand-gray bg-white border border-brand-border';
                  if (isCorrect)                cls = 'text-green-700 bg-green-100 border border-green-300 font-semibold';
                  if (isSelected && !isCorrect) cls = 'text-red-700 bg-red-100 border border-red-300';
                  return (
                    <div key={j} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${cls}`}>
                      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCorrect ? 'bg-green-200 text-green-800' : isSelected ? 'bg-red-200 text-red-800' : 'bg-brand-lightGray text-brand-gray'
                      }`}>{LETTERS[j]}</span>
                      <span className="flex-1">{opt}</span>
                      {isCorrect              && <span className="text-green-600 text-xs font-bold">✓ Doğru</span>}
                      {isSelected && !isCorrect && <span className="text-red-600 text-xs font-bold">✗ Seçiminiz</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={onRetry}
          className="flex-1 py-3 rounded-xl border-2 border-brand-border text-brand-black font-bold text-sm hover:bg-brand-lightGray transition-colors"
        >
          🔄 Tekrar Dene
        </button>
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl bg-brand-red hover:bg-brand-redDark text-white font-bold text-sm transition-colors"
        >
          ✓ Kapat
        </button>
      </div>
    </div>
  );
}
