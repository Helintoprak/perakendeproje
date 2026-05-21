import { Router, Response }  from 'express';
import { PrismaClient }       from '@prisma/client';
import Anthropic               from '@anthropic-ai/sdk';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.middleware';
import path from 'path';
import fs   from 'fs';
// pdf-parse v1.x import sırasında test dosyası okumaya çalışır → production'da crash.
// Lib yolundan doğrudan import ederek test runner'ı atlatıyoruz.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse/lib/pdf-parse.js');

// ─── Yapılandırma ─────────────────────────────────────────────────────────────
const MODEL       = 'claude-3-5-haiku-20241022';
const PASS_SCORE  = 7;
const MAX_CHARS   = 20_000;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

const API_KEY = (process.env.ANTHROPIC_API_KEY ?? '').trim();

if (!API_KEY) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌  ANTHROPIC_API_KEY .env dosyasında tanımlı değil!');
  console.error('    https://console.anthropic.com → "API Keys"');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
} else {
  console.log(`[Quiz] Anthropic Claude → model: ${MODEL} | key: ${API_KEY.slice(0, 12)}...`);
}

const anthropic = new Anthropic({ apiKey: API_KEY || 'missing' });
const router    = Router();
const prisma = new PrismaClient();

// ─── Arka Plan Job Sistemi ────────────────────────────────────────────────────

interface QuizJob {
  jobId:     string;
  courseId:  number;
  status:    'pending' | 'processing' | 'ready' | 'error';
  quizId?:   number;
  error?:    string;
  attempts:  number;
  createdAt: Date;
}

// Aktif joblar: jobId → QuizJob
const jobs = new Map<string, QuizJob>();
// courseId → aktif jobId (tekrar istek gelirse aynı job döner)
const courseJobMap = new Map<number, string>();

function is429(err: any): boolean {
  const msg = String(err?.message ?? '');
  const s   = err?.status ?? err?.httpStatus ?? 0;
  return s === 429 || msg.includes('429') || msg.includes('rate_limit') || msg.includes('overloaded');
}

function isFatal(err: any): boolean {
  const msg = String(err?.message ?? '');
  const s   = err?.status ?? err?.httpStatus ?? 0;
  return (
    s === 403 || s === 401 || s === 404 ||
    msg.includes('authentication_error') || msg.includes('permission_error') ||
    msg.includes('invalid_api_key') || msg.includes('not_found')
  );
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function runJob(jobId: string, docText: string, courseTitle: string, courseId: number) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  const MAX_ATTEMPTS = 3;
  let lastErrType: 'rate_limit' | 'fatal' | 'other' = 'other';

  while (job.attempts < MAX_ATTEMPTS) {
    try {
      console.log(`[Job ${jobId.slice(-6)}] Deneme ${job.attempts + 1}/${MAX_ATTEMPTS} başlıyor...`);
      const questions = await generateWithGemini(docText, courseTitle);

      const quiz = await prisma.quiz.create({
        data: {
          courseId,
          quizTitle:      `${courseTitle} — Quiz`,
          passScore:      PASS_SCORE,
          totalQuestions: questions.length,
          questionData:   questions as any,
        },
      });

      job.status = 'ready';
      job.quizId = quiz.quizId;
      courseJobMap.delete(courseId);
      console.log(`[Job ${jobId.slice(-6)}] ✅ Quiz hazır — quizId: ${quiz.quizId}`);

      setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
      return;

    } catch (err: any) {
      job.attempts++;

      console.error(`[Job ${jobId.slice(-6)}] ❌ Hata (deneme ${job.attempts}/${MAX_ATTEMPTS}):`);
      console.error(`  message : ${err?.message}`);
      console.error(`  status  : ${err?.status ?? err?.httpStatus ?? 'N/A'}`);

      if (isFatal(err)) {
        lastErrType = 'fatal';
        const msg = String(err?.message ?? '');
        const isModelErr = msg.includes('404') || msg.includes('MODEL_NOT_FOUND') || msg.includes('is not found');
        job.status = 'error';
        job.error  = isModelErr
          ? 'AI modeli bulunamadı. Sistem yöneticisiyle iletişime geçin.'
          : 'API anahtarı geçersiz veya yetkisiz. Lütfen sistem yöneticisiyle iletişime geçin.';
        courseJobMap.delete(courseId);
        console.error(`[Job ${jobId.slice(-6)}] ❌ Fatal → job iptal edildi: ${job.error}`);
        setTimeout(() => jobs.delete(jobId), 30 * 60 * 1000);
        return;
      } else if (is429(err)) {
        lastErrType = 'rate_limit';
        const waitSec = Math.pow(2, job.attempts);
        console.error(`[Job ${jobId.slice(-6)}] ⏳ 429 İstek limiti → ${waitSec}s bekleniyor`);
        if (job.attempts < MAX_ATTEMPTS) await sleep(waitSec * 1000);
      } else {
        console.error(`[Job ${jobId.slice(-6)}] ⚠️ Bilinmeyen hata → 2s bekleniyor`);
        if (job.attempts < MAX_ATTEMPTS) await sleep(2000);
      }
    }
  }

  job.status = 'error';
  job.error  = lastErrType === 'rate_limit'
    ? 'API kotası doldu. Lütfen birkaç dakika sonra tekrar deneyin.'
    : 'AI servisi yanıt vermedi. Lütfen daha sonra tekrar deneyin.';
  courseJobMap.delete(courseId);
  console.error(`[Job ${jobId.slice(-6)}] ❌ ${MAX_ATTEMPTS} denemede başarılanamadı → ${job.error}`);
  setTimeout(() => jobs.delete(jobId), 30 * 60 * 1000);
}

// ─── Tipler ───────────────────────────────────────────────────────────────────
interface QuizQuestion {
  id:           number;
  question:     string;
  options:      string[];
  correctIndex: number;
}

// ─── PDF → metin ──────────────────────────────────────────────────────────────
async function extractText(contentUrl: string): Promise<string> {
  // Cloudinary veya herhangi bir uzak URL → bellekte indir, parse et
  if (contentUrl.startsWith('http://') || contentUrl.startsWith('https://')) {
    return fetchAndExtract(contentUrl);
  }

  // Yerel disk (geliştirme / disk-storage modu)
  const filename = path.basename(contentUrl);
  const filePath = path.join(UPLOADS_DIR, filename);
  const ext      = path.extname(filename).toLowerCase();

  if (!fs.existsSync(filePath)) throw new Error(`Dosya bulunamadı: ${filename}`);

  if (ext === '.pdf') {
    const buffer   = fs.readFileSync(filePath);
    const { text } = await pdfParse(buffer);
    const trimmed  = text.trim();
    if (trimmed.length < 50) throw new Error('PDF okunabilir metin içermiyor.');
    console.log(`[Quiz] PDF → ${trimmed.length} karakter (${filename})`);
    return trimmed.slice(0, MAX_CHARS);
  }

  const stat = fs.statSync(filePath);
  return (
    `Eğitim başlığı: "${path.basename(filename, ext).replace(/_/g, ' ')}"\n` +
    `Boyut: ${(stat.size / 1024).toFixed(0)} KB — Sunum dosyası`
  );
}

// ─── Uzak dosyayı indir, PDF ise parse et ────────────────────────────────────
async function fetchAndExtract(url: string): Promise<string> {
  console.log(`[Quiz] Uzak dosya indiriliyor: ${url.slice(0, 80)}...`);

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 60_000); // 60sn timeout
  let fetchRes: Awaited<ReturnType<typeof fetch>>;
  try {
    fetchRes = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!fetchRes.ok) throw new Error(`Dosya indirilemedi: HTTP ${fetchRes.status}`);

  const buffer = Buffer.from(await fetchRes.arrayBuffer());

  // PDF magic byte: ilk 4 byte "%PDF" ise PDF'tir
  const isPdf = buffer.length > 4 && buffer.slice(0, 4).toString('ascii') === '%PDF';

  if (isPdf) {
    const { text } = await pdfParse(buffer);
    const trimmed  = text.trim();
    if (trimmed.length < 50) throw new Error('PDF okunabilir metin içermiyor.');
    console.log(`[Quiz] Uzak PDF → ${trimmed.length} karakter`);
    return trimmed.slice(0, MAX_CHARS);
  }

  // PDF değil (PPTX vb.) — kurs başlığından içerik üret
  const basename = path.basename(url.split('?')[0]).replace(/_/g, ' ');
  console.log(`[Quiz] Uzak dosya PDF değil → başlık bazlı içerik`);
  return (
    `Eğitim başlığı: "${basename}"\n` +
    `Boyut: ${(buffer.length / 1024).toFixed(0)} KB — Sunum dosyası`
  );
}

// ─── Anthropic Claude çağrısı ─────────────────────────────────────────────────
async function generateWithGemini(docText: string, courseTitle: string): Promise<QuizQuestion[]> {
  const prompt =
    `Aşağıdaki eğitim metnine dayalı olarak 10 adet Türkçe, 4 şıklı çoktan seçmeli soru hazırla.\n` +
    `Kurs adı: "${courseTitle}"\n\n` +
    `SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:\n` +
    `{"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0}]}\n\n` +
    `Metin:\n${docText}`;

  console.log(`[Quiz] Anthropic isteği → ${docText.length} karakter`);

  let rawText: string;
  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    rawText = block.type === 'text' ? block.text : '';
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    const s   = err?.status ?? err?.httpStatus ?? 0;

    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (is429(err)) {
      console.error(`⏳ ANTHROPIC 429 — İstek limiti / kota aşıldı`);
      console.error(`   model  : ${MODEL} | mesaj: ${msg}`);
    } else if (isFatal(err)) {
      console.error(`❌ ANTHROPIC (HTTP ${s}) — ${msg}`);
    } else {
      console.error(`❌ ANTHROPIC (HTTP ${s}) — ${msg}`);
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    throw err;
  }

  let cleaned = rawText.trim();
  const block = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (block) cleaned = block[1].trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);

  let arr: any[];
  try {
    arr = JSON.parse(cleaned).questions ?? [];
  } catch {
    throw new Error('AI geçerli JSON döndürmedi.');
  }

  if (arr.length === 0) throw new Error('AI boş soru listesi döndürdü.');

  const questions: QuizQuestion[] = arr.slice(0, 10).map((q: any, i: number) => ({
    id:           i + 1,
    question:     String(q.question ?? '').trim(),
    options:      (q.options as string[]).slice(0, 4).map(String),
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
  }));

  console.log(`[Quiz] ✅ ${questions.length} soru üretildi.`);
  return questions;
}

// ─── Yardımcı: quiz → safe (correctIndex olmadan) ────────────────────────────
function safeQuestions(questions: QuizQuestion[]) {
  return questions.map(({ correctIndex: _c, ...rest }) => rest);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
router.use(authenticate);

// ─── GET /api/quiz/course/:courseId ──────────────────────────────────────────
router.get('/course/:courseId', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = parseInt(req.params.courseId);
    const userId   = req.user!.userId;
    if (isNaN(courseId)) return res.status(400).json({ message: 'Geçersiz kurs ID.' });

    const quiz = await prisma.quiz.findFirst({
      where: { courseId }, orderBy: { quizId: 'desc' },
    });

    if (!quiz) {
      // Aktif bir job var mı?
      const activeJobId = courseJobMap.get(courseId);
      return res.json({ quiz: null, latestAttempt: null, jobId: activeJobId ?? null });
    }

    const latestAttempt = await prisma.quizAttempt.findFirst({
      where: { quizId: quiz.quizId, userId }, orderBy: { attemptDate: 'desc' },
    });

    const questions = (quiz.questionData as unknown as QuizQuestion[]) ?? [];
    return res.json({
      quiz: {
        quizId: quiz.quizId, quizTitle: quiz.quizTitle,
        totalQuestions: quiz.totalQuestions, passScore: quiz.passScore,
        questions: safeQuestions(questions),
      },
      latestAttempt: latestAttempt ? {
        attemptId:   latestAttempt.attemptId,
        score:       latestAttempt.score,
        isPassed:    latestAttempt.isPassed,
        attemptDate: latestAttempt.attemptDate,
      } : null,
      jobId: null,
    });
  } catch (err: any) {
    console.error('[Quiz] GET /course error:', err.message);
    return res.status(500).json({ message: 'Quiz bilgisi alınamadı.' });
  }
});

// ─── GET /api/quiz/job/:jobId — polling endpoint ──────────────────────────────
router.get('/job/:jobId', async (req: AuthRequest, res: Response) => {
  const jobId = req.params.jobId;
  const job   = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ message: 'Job bulunamadı veya süresi doldu.' });
  }

  if (job.status === 'ready' && job.quizId) {
    const quiz = await prisma.quiz.findUnique({ where: { quizId: job.quizId } });
    if (quiz) {
      const questions = (quiz.questionData as unknown as QuizQuestion[]) ?? [];
      return res.json({
        status: 'ready',
        quiz: {
          quizId: quiz.quizId, quizTitle: quiz.quizTitle,
          totalQuestions: quiz.totalQuestions, passScore: quiz.passScore,
          questions: safeQuestions(questions),
        },
      });
    }
  }

  return res.json({
    status:   job.status,
    attempts: job.attempts,
    error:    job.error ?? null,
  });
});

// ─── POST /api/quiz/course/:courseId/generate — async ────────────────────────
router.post('/course/:courseId/generate', async (req: AuthRequest, res: Response) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ message: 'Quiz servisi şu an aktif değil. (GEMINI_API_KEY yapılandırılmamış)' });
    }

    const courseId = parseInt(req.params.courseId);
    const userId   = req.user!.userId;
    if (isNaN(courseId)) return res.status(400).json({ message: 'Geçersiz kurs ID.' });

    const progress = await prisma.userProgress.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!progress || progress.status !== 'completed') {
      return res.status(403).json({ message: 'Quiz için önce kursu tamamlamanız gerekiyor.' });
    }

    // Daha önce üretilmişse direkt dön
    const existing = await prisma.quiz.findFirst({ where: { courseId }, orderBy: { quizId: 'desc' } });
    if (existing) {
      const questions = (existing.questionData as unknown as QuizQuestion[]) ?? [];
      return res.json({
        status: 'ready',
        quiz: {
          quizId: existing.quizId, quizTitle: existing.quizTitle,
          totalQuestions: existing.totalQuestions, passScore: existing.passScore,
          questions: safeQuestions(questions),
        },
      });
    }

    // Bu kurs için zaten aktif bir job varsa onu dön
    const existingJobId = courseJobMap.get(courseId);
    if (existingJobId) {
      const existingJob = jobs.get(existingJobId);
      if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'processing')) {
        console.log(`[Quiz] Mevcut job döndürüldü: ${existingJobId.slice(-6)}`);
        return res.json({ status: existingJob.status, jobId: existingJobId });
      }
    }

    const course = await prisma.course.findUnique({
      where: { courseId }, select: { title: true, contentUrl: true },
    });
    if (!course?.contentUrl) {
      return res.status(400).json({ message: 'Bu kursa ait döküman bulunamadı.' });
    }

    // PDF'yi hemen oku (hızlı) — hata varsa burada yakala
    const docText = await extractText(course.contentUrl);

    // Job oluştur
    const jobId = `${courseId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: QuizJob = {
      jobId,
      courseId,
      status:    'pending',
      attempts:  0,
      createdAt: new Date(),
    };
    jobs.set(jobId, job);
    courseJobMap.set(courseId, jobId);

    // Arka planda başlat — await etme
    runJob(jobId, docText, course.title, courseId).catch(err => {
      console.error(`[Job ${jobId.slice(-6)}] İşlenmeyen hata:`, err.message);
      const j = jobs.get(jobId);
      if (j && j.status !== 'ready') {
        j.status = 'error';
        j.error  = 'Beklenmeyen bir hata oluştu.';
        courseJobMap.delete(courseId);
      }
    });

    console.log(`[Quiz] Job oluşturuldu: ${jobId.slice(-6)} | kurs: ${course.title}`);
    return res.json({ status: 'pending', jobId });

  } catch (err: any) {
    console.error('[Quiz] Generate error:', err.message);
    return res.status(500).json({ message: 'İstek işlenemedi: ' + err.message });
  }
});

// ─── POST /api/quiz/:quizId/submit ────────────────────────────────────────────
router.post('/:quizId/submit', async (req: AuthRequest, res: Response) => {
  try {
    const quizId      = parseInt(req.params.quizId);
    const userId      = req.user!.userId;
    const { answers } = req.body;
    if (isNaN(quizId))           return res.status(400).json({ message: 'Geçersiz quiz ID.' });
    if (!Array.isArray(answers)) return res.status(400).json({ message: 'Cevaplar dizi formatında gönderilmeli.' });

    const quiz = await prisma.quiz.findUnique({ where: { quizId } });
    if (!quiz) return res.status(404).json({ message: 'Quiz bulunamadı.' });

    const questions = (quiz.questionData as unknown as QuizQuestion[]) ?? [];
    let correct = 0;
    const results = questions.map((q, i) => {
      const userAnswer = answers[i] ?? -1;
      const isCorrect  = userAnswer === q.correctIndex;
      if (isCorrect) correct++;
      return {
        questionId: q.id, question: q.question, options: q.options,
        userAnswer, correctIndex: q.correctIndex, isCorrect,
      };
    });

    const isPassed = correct >= (quiz.passScore ?? PASS_SCORE);
    const attempt  = await prisma.quizAttempt.create({ data: { userId, quizId, score: correct, isPassed } });

    if (isPassed) {
      await prisma.userProgress.updateMany({
        where: { userId, courseId: quiz.courseId },
        data:  { status: 'completed', completionRate: 100 },
      });
    }

    return res.json({
      attemptId: attempt.attemptId, score: correct, total: questions.length,
      isPassed, passScore: quiz.passScore ?? PASS_SCORE, results,
    });
  } catch (err: any) {
    console.error('[Quiz] Submit error:', err.message);
    return res.status(500).json({ message: 'Cevaplar kaydedilemedi.' });
  }
});

// ─── GET /api/quiz/course/:courseId/attempts ──────────────────────────────────
router.get('/course/:courseId/attempts', async (req: AuthRequest, res: Response) => {
  try {
    const courseId = parseInt(req.params.courseId);
    const userId   = req.user!.userId;
    const quiz = await prisma.quiz.findFirst({ where: { courseId }, orderBy: { quizId: 'desc' } });
    if (!quiz) return res.json([]);
    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: quiz.quizId, userId }, orderBy: { attemptDate: 'desc' },
    });
    return res.json(attempts);
  } catch (err: any) {
    console.error('[Quiz] Attempts error:', err.message);
    return res.status(500).json({ message: 'Geçmiş alınamadı.' });
  }
});

// ─── DELETE /api/quiz/course/:courseId — yalnızca müdür ───────────────────────
router.delete(
  '/course/:courseId',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'),
  async (req: AuthRequest, res: Response) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const quiz     = await prisma.quiz.findFirst({ where: { courseId } });
      if (!quiz) return res.status(404).json({ message: 'Quiz bulunamadı.' });
      await prisma.quizAttempt.deleteMany({ where: { quizId: quiz.quizId } });
      await prisma.quiz.delete({ where: { quizId: quiz.quizId } });
      return res.json({ message: 'Quiz silindi.' });
    } catch (err: any) {
      console.error('[Quiz] Delete error:', err.message);
      return res.status(500).json({ message: 'Quiz silinemedi.' });
    }
  },
);

export default router;
