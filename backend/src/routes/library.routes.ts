import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { upload, fileUrlFromUpload } from '../middleware/upload.middleware';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ─── GET /api/library — dosya listesi (arama + sayfalama) ────────────────────
router.get('/', async (req: AuthRequest, res) => {
  try {
    const search   = (req.query.search as string)?.trim() || '';
    const fileType = (req.query.fileType as string)?.trim() || '';
    const page     = Math.max(1, Number(req.query.page) || 1);
    const limit    = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip     = (page - 1) * limit;

    const where: any = {
      ...(search   ? { title: { contains: search, mode: 'insensitive' } } : {}),
      ...(fileType ? { fileType }                                         : {}),
    };

    const [items, total] = await Promise.all([
      prisma.educationLibrary.findMany({
        where,
        include: { uploader: { select: { userId: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.educationLibrary.count({ where }),
    ]);

    return res.json({ items, total, page, limit });
  } catch (err: any) {
    console.error('[GET /library]', err.message);
    return res.status(500).json({ message: 'Kütüphane alınamadı: ' + err.message });
  }
});

// ─── POST /api/library — dosya yükle ────────────────────────────────────────
router.post('/', upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const role = req.user?.roleName;
    if (role !== 'Admin' && role !== 'Müdür' && role !== 'Bölge Müdürü') {
      return res.status(403).json({ message: 'Kütüphaneye yükleme yetkiniz yok.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Dosya yüklenmedi.' });
    }

    const title = (req.body.title as string)?.trim();
    if (!title) {
      return res.status(400).json({ message: 'Başlık zorunludur.' });
    }

    const fileUrl  = fileUrlFromUpload(req.file);
    const ext      = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const fileType = req.file.mimetype.startsWith('video/') ? 'video' : (ext || 'pdf');

    const item = await prisma.educationLibrary.create({
      data: {
        title,
        fileUrl,
        fileType,
        uploadedBy: req.user!.userId,
      },
      include: { uploader: { select: { userId: true, fullName: true } } },
    });

    return res.status(201).json({ message: 'Dosya kütüphaneye eklendi.', item });
  } catch (err: any) {
    console.error('[POST /library]', err.message);
    return res.status(500).json({ message: 'Yükleme hatası: ' + err.message });
  }
});

// ─── DELETE /api/library/:id — sil (sadece Admin) ──────────────────────────
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    if (req.user?.roleName !== 'Admin') {
      return res.status(403).json({ message: 'Silme yetkisi yok.' });
    }

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Geçersiz id.' });

    await prisma.educationLibrary.delete({ where: { id } });
    return res.json({ message: 'Kütüphane öğesi silindi.' });
  } catch (err: any) {
    if ((err as any).code === 'P2025') {
      return res.status(404).json({ message: 'Öğe bulunamadı.' });
    }
    console.error('[DELETE /library]', err.message);
    return res.status(500).json({ message: 'Silme hatası: ' + err.message });
  }
});

export default router;
