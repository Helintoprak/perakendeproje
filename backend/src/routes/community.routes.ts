import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// POST seçenekleri
const CATEGORIES = ['genel', 'duyuru', 'öneri', 'başarı', 'soru'];

// GET /api/community - tüm aktif gönderiler (yeniden eskiye)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.query;
    // Not: CommunityPost.user ve Comment.user FK ile zorunlu — `isNot: null`
    // filtresi geçersizdir (Prisma sadece nullable ilişkilerde destekler).
    const posts = await prisma.communityPost.findMany({
      where: {
        status: 'active',
        ...(category && category !== 'all' ? { category: category as string } : {}),
      },
      include: {
        user: {
          select: { fullName: true, role: { select: { roleName: true } }, store: { select: { storeName: true } } },
        },
        comments: {
          include: {
            user: { select: { fullName: true, store: { select: { storeName: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gönderiler yüklenemedi.' });
  }
});

// POST /api/community - yeni gönderi
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, category } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Başlık zorunludur.' }) as unknown as void;
    const post = await prisma.communityPost.create({
      data: {
        userId: req.user!.userId,
        title: title.trim(),
        content: content?.trim() || null,
        category: CATEGORIES.includes(category) ? category : 'genel',
      },
      include: {
        user: {
          select: { fullName: true, role: { select: { roleName: true } }, store: { select: { storeName: true } } },
        },
        comments: true,
      },
    });
    res.status(201).json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gönderi oluşturulamadı.' });
  }
});

// DELETE /api/community/:postId - gönderiyi sil (sahip veya yönetici)
router.delete('/:postId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const post = await prisma.communityPost.findUnique({ where: { postId } });
    if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' }) as unknown as void;
    if (post.userId !== req.user!.userId && req.user!.roleName !== 'Admin') {
      return res.status(403).json({ error: 'Bu gönderiyi silme yetkiniz yok.' }) as unknown as void;
    }
    await prisma.communityPost.delete({ where: { postId } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gönderi silinemedi.' });
  }
});

// POST /api/community/:postId/like - beğen / beğeniyi geri al (toggle)
router.post('/:postId/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const post = await prisma.communityPost.findUnique({ where: { postId } });
    if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' }) as unknown as void;
    const updated = await prisma.communityPost.update({
      where: { postId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    res.json({ likeCount: updated.likeCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Beğeni işlemi başarısız.' });
  }
});

// GET /api/community/:postId/comments - yorumlar
router.get('/:postId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const comments = await prisma.comment.findMany({
      where: { postId },
      include: {
        user: { select: { fullName: true, store: { select: { storeName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Yorumlar yüklenemedi.' });
  }
});

// POST /api/community/:postId/comments - yorum ekle
router.post('/:postId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = Number(req.params.postId);
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Yorum boş olamaz.' }) as unknown as void;
    const post = await prisma.communityPost.findUnique({ where: { postId } });
    if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' }) as unknown as void;
    const comment = await prisma.comment.create({
      data: { postId, userId: req.user!.userId, content: content.trim() },
      include: {
        user: { select: { fullName: true, store: { select: { storeName: true } } } },
      },
    });
    res.status(201).json(comment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Yorum eklenemedi.' });
  }
});

// DELETE /api/community/comments/:commentId - yorum sil
router.delete('/comments/:commentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const commentId = Number(req.params.commentId);
    const comment = await prisma.comment.findUnique({ where: { commentId } });
    if (!comment) return res.status(404).json({ error: 'Yorum bulunamadı.' }) as unknown as void;
    if (comment.userId !== req.user!.userId && req.user!.roleName !== 'Admin') {
      return res.status(403).json({ error: 'Bu yorumu silme yetkiniz yok.' }) as unknown as void;
    }
    await prisma.comment.delete({ where: { commentId } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Yorum silinemedi.' });
  }
});

export default router;
