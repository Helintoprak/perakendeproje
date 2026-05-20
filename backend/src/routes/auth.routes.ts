import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[Auth] İstek validasyon hatası:', parsed.error.flatten());
      return res.status(400).json({ message: 'Geçersiz istek', errors: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const emailLower = email.toLowerCase().trim();

    console.log('[Auth] Login denemesi:', emailLower);

    const user = await prisma.user.findFirst({
      where: { email: emailLower },
      include: { role: true, store: true },
    });

    if (!user) {
      console.error('[Auth] Kullanıcı bulunamadı:', emailLower);
      return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı' });
    }

    console.log('[Auth] Kullanıcı bulundu:', user.fullName, 'Status:', user.status);

    if (!user.status) {
      console.error('[Auth] Hesap pasif:', emailLower);
      return res.status(403).json({ message: 'Hesabınız pasif durumda' });
    }

    if (!user.password) {
      console.error('[Auth] Şifre yok:', emailLower);
      return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı' });
    }

    // Bcrypt hash ise compare, plain text ise direkt karşılaştır
    const isBcrypt = user.password.startsWith('$2');
    console.log('[Auth] Şifre format:', isBcrypt ? 'bcrypt' : 'plain');
    console.log('[Auth] DB password uzunluğu:', user.password.length, 'Başlangıç: $' + user.password.substring(0, 10));
    console.log('[Auth] Girilen şifre:', password);

    let valid = false;
    if (isBcrypt) {
      valid = await bcrypt.compare(password, user.password);
      console.log('[Auth] bcrypt.compare sonucu:', valid);
    } else {
      valid = password === user.password;
      console.log('[Auth] Plain text karşılaştırma:', valid);
    }

    if (!valid) {
      console.error('[Auth] Şifre yanlış:', emailLower);
      return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı' });
    }

    console.log('[Auth] Şifre doğru, token oluşturuluyor...');

    const token = jwt.sign(
      { userId: user.userId, fullName: user.fullName, roleId: user.roleId, roleName: user.role.roleName, storeId: user.storeId },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    console.log('[Auth] Login başarılı:', user.fullName);

    return res.json({
      token,
      user: {
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        role: user.role.roleName,
        store: user.store?.storeName ?? null,
      },
    });
  } catch (err: any) {
    console.error('[Auth] Login hata:', err.message);
    return res.status(500).json({ message: 'Server hatası: ' + err.message });
  }
});

// POST /api/auth/register (sadece admin kullanabilir, seed için açık)
router.post('/register', async (req, res) => {
  const { fullName, email, password, roleId, storeId } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { fullName, email, password: hashed, roleId, storeId },
    include: { role: true },
  });
  return res.status(201).json({ userId: user.userId, email: user.email, role: user.role.roleName });
});

export default router;
