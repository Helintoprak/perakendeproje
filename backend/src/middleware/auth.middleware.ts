import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    fullName: string;
    roleId: number;
    roleName: string;
    storeId?: number;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token bulunamadı' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthRequest['user'];
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Geçersiz token' });
  }
}

export function requireRole(...roleNames: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Yetkisiz' });
    // Admin tüm rollerin yetkisine sahiptir
    if (req.user.roleName === 'Admin' || roleNames.includes(req.user.roleName)) {
      return next();
    }
    return res.status(403).json({ message: 'Bu işlem için yetkiniz yok' });
  };
}

export const ADMIN_ROLE = 'Admin';
