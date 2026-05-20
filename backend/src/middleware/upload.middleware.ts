import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import { Request } from 'express';
import { cloudinary, isCloudinaryConfigured } from '../services/cloudinary.service';

const ALLOWED_CONTENT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt (eski format)
  'video/mp4',
  'video/webm',
  'video/quicktime',
];
const ALLOWED_CONTENT_EXT = ['.pdf', '.pptx', '.ppt', '.mp4', '.webm', '.mov'];

// Otomatik kapak görseli için kabul edilen tipler (frontend tarafından üretilir)
const ALLOWED_COVER_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_COVER_EXT  = ['.jpg', '.jpeg', '.png', '.webp'];

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');

/**
 * Alan-bazlı validation:
 *   • file       → PDF/PPTX/PPT/MP4/WEBM/MOV (eğitim içeriği)
 *   • coverImage → JPG/PNG/WEBP (otomatik üretilen kapak görseli)
 */
const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (file.fieldname === 'coverImage') {
    if (ALLOWED_COVER_MIME.includes(file.mimetype) && ALLOWED_COVER_EXT.includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error(`Kapak görseli için geçersiz tip: "${ext}". JPG/PNG/WEBP olmalı.`));
  }

  // Varsayılan: ana içerik dosyası
  if (ALLOWED_CONTENT_MIME.includes(file.mimetype) && ALLOWED_CONTENT_EXT.includes(ext)) {
    return cb(null, true);
  }
  cb(new Error(`Geçersiz dosya tipi: "${ext}". PDF/PPTX/MP4 vb. desteklenir.`));
};

/**
 * Storage seçimi:
 *   • Cloudinary env'leri tanımlıysa → CloudinaryStorage
 *       - PDF/PPTX → resource_type: 'raw'
 *       - Video    → resource_type: 'video'
 *       - Görsel   → resource_type: 'image'
 *       - Klasör:    sporthink/{covers|courses|feedback|misc}
 *       - req.file.path → tam Cloudinary URL (DB'ye yazılan değer)
 *   • Yoksa → eski yerel disk storage (dev fallback)
 */
function buildStorage(): StorageEngine {
  if (isCloudinaryConfigured()) {
    return new CloudinaryStorage({
      cloudinary,
      params: async (_req, file) => {
        // Field adına göre subfolder ve resource_type belirle
        const isCover = file.fieldname === 'coverImage';
        const isVideo = file.mimetype.startsWith('video/');
        const isImage = file.mimetype.startsWith('image/');

        let subfolder = 'misc';
        if (isCover)                        subfolder = 'covers';
        else if (file.fieldname === 'file') subfolder = 'courses';

        const resource_type: 'image' | 'video' | 'raw' | 'auto' =
          isImage ? 'image' :
          isVideo ? 'video' :
          'raw'; // PDF/PPTX vb.

        // Public id: orijinal isimden temizlenmiş + epoch
        const ext = path.extname(file.originalname).toLowerCase();
        const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');

        return {
          folder:        `sporthink/${subfolder}`,
          resource_type,
          public_id:     `${Date.now()}_${safe}`,
          // PDF/raw için Cloudinary varsayılan olarak format'ı korur,
          // image/video'ya ek dönüşüm yapmıyoruz (orijinal kalite)
        };
      },
    });
  }

  // Fallback: yerel disk
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
      const prefix = file.fieldname === 'coverImage' ? 'cover_' : '';
      cb(null, `${prefix}${Date.now()}_${safeName}${ext}`);
    },
  });
}

export const upload = multer({
  storage:    buildStorage(),
  fileFilter,
  // Dosya boyutu sınırı kaldırıldı — Cloudinary tier'ına göre kısıtlanır
});

/**
 * Yüklenen dosyanın "kanonik URL"ini döner.
 *   • Cloudinary modu: file.path zaten tam HTTPS URL
 *   • Disk modu:        /uploads/<filename> formatında relative path
 *
 * Tüm route'lar bu helper'ı kullanmalı — req.file.filename yerine.
 */
export function fileUrlFromUpload(file: Express.Multer.File): string {
  if (isCloudinaryConfigured()) {
    // CloudinaryStorage `path`'i tam secure_url ile doldurur
    return file.path;
  }
  return `/uploads/${file.filename}`;
}
