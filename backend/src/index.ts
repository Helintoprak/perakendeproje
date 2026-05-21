import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/auth.routes';
import courseRoutes from './routes/course.routes';
import performanceRoutes from './routes/performance.routes';
import feedbackRoutes from './routes/feedback.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import educationRoutes from './routes/education.routes';
import pulseRoutes from './routes/pulse.routes';
import communityRoutes from './routes/community.routes';
import teamRoutes      from './routes/shift.routes';
import quizRoutes      from './routes/quiz.routes';
import chatRoutes      from './routes/chat.routes';
import logsRoutes      from './routes/logs.routes';
import libraryRoutes   from './routes/library.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CORS — env-bazlı whitelist ─────────────────────────────────────────────
//   • Geliştirme: NODE_ENV=development → tüm origin'lere izin (kolaylık)
//   • Üretim: NODE_ENV=production    → sadece CORS_ORIGINS listesi
//
// CORS_ORIGINS biçimi (virgülle ayır): "https://app.vercel.app,https://www.sporthink.com"
// .vercel.app preview deploy'ları için RegExp pattern: "/^https:\\/\\/.*\\.vercel\\.app$/"
const isProd        = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = isProd
  ? {
      origin: (origin, cb) => {
        // origin yoksa (server-to-server, curl, Postman) izin ver
        if (!origin) return cb(null, true);
        // Tam eşleşme veya .vercel.app pattern (Vercel preview deploy desteği)
        const isAllowed =
          allowedOrigins.includes(origin) ||
          /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
        if (isAllowed) return cb(null, true);
        return cb(new Error(`CORS blocked: ${origin} izinli değil`));
      },
      credentials: true,
      exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
    }
  : {
      origin: true,           // dev — her origin'e izin
      credentials: true,
      exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
    };

app.use(cors(corsOptions));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Yüklenen dosyalara statik erişim: http://localhost:5000/uploads/<dosya>
// PDF.js'in dosyayı okuyabilmesi için CORS header'ları ekleniyor
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', (_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(UPLOADS_DIR, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/educations', educationRoutes);
app.use('/api/pulse', pulseRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/quiz',      quizRoutes);
app.use('/api/team',      teamRoutes);
app.use('/api/chat',      chatRoutes);
app.use('/api/logs',      logsRoutes);
app.use('/api/library',   libraryRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Sporthink API', version: '1.0.0' });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
// Tek bir route hatası tüm backend'i çökertmesin diye global yakalayıcı
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Unhandled route error:', err.message);
  console.error(err.stack);
  if (!res.headersSent) {
    res.status(500).json({ message: 'Sunucu hatası oluştu.', error: err.message });
  }
});

// Process seviyesinde yakalanmamış hataları logla ama process'i çökertme
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  console.error('⚠️ Uncaught Exception:', err.message);
  console.error(err.stack);
  // Port çakışması gibi kritik hatalarda process'i sonlandır (zombie olmasın)
  if (err.code === 'EADDRINUSE') {
    process.exit(1);
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Sporthink API running on port ${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} zaten kullanımda! Lütfen mevcut process'i kapatın.`);
    process.exit(1);
  }
});

// Büyük dosya yüklemelerinde bağlantının kesilmemesi için timeout'ları artır
server.timeout         = 30 * 60 * 1000; // 30 dakika
server.headersTimeout  = 31 * 60 * 1000; // headersTimeout > timeout olmalı
server.keepAliveTimeout = 5 * 60 * 1000; // 5 dakika keep-alive

export default app;
