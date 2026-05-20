import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import {
  uploadEducation,
  listEducations,
  listAllEducations,
  listStoreUsers,
  listStoreCompletionRates,
  deleteEducation,
  markAsViewed,
  handleUploadError,
} from '../controllers/education.controller';

const router = Router();

router.use(authenticate);

// GET /api/educations/store-users
// Admin: tüm kullanıcılar, Manager/Deputy: kendi mağazası
router.get(
  '/store-users',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı', 'Admin'),
  listStoreUsers
);

// GET /api/educations/stores-completion — Admin: mağaza bazlı tamamlama oranları
router.get('/stores-completion', requireRole('Admin'), listStoreCompletionRates);

// GET /api/educations/all — Admin: tüm materyaller, Manager/Deputy: kendi yüklediği
router.get(
  '/all',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı', 'Admin'),
  listAllEducations
);

// GET /api/educations — mevcut kullanıcıya atananlar
router.get('/', listEducations);

// POST /api/educations/upload
router.post(
  '/upload',
  requireRole('Mağaza Müdürü', 'Mağaza Müdür Yardımcısı', 'Admin'),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err) => {
      if (err) return handleUploadError(err, req, res, next);
      next();
    });
  },
  uploadEducation
);

// PATCH /api/educations/:educationId/view — görüntülendi olarak işaretle
router.patch('/:educationId/view', markAsViewed);

// DELETE /api/educations/:id — sadece Admin ve Mağaza Müdürü
router.delete(
  '/:id',
  requireRole('Mağaza Müdürü', 'Admin'),
  deleteEducation
);

export default router;
