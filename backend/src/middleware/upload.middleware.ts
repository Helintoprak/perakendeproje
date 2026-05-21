import multer, { FileFilterCallback, StorageEngine } from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import path from 'path';
import fs from 'fs';
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

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
// Dizin yoksa oluştur (Render gibi ortamlarda disk storage fallback için)
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  // MIME kontrolü: bazı tarayıcılar PDF için farklı MIME gönderebilir
  const mimeOk = ALLOWED_CONTENT_MIME.includes(file.mimetype) || file.mimetype === 'application/octet-stream';
  const extOk  = ALLOWED_CONTENT_EXT.includes(ext);
  if (mimeOk && extOk) {
    return cb(null, true);
  }
  // multer v2'de cb(error) sessizce dosyayı atlıyor; Error nesnesini fırlat
  const err = Object.assign(
    new Error(`Geçersiz dosya tipi: "${ext}" (${file.mimetype}). PDF/PPTX/MP4 vb. desteklenir.`),
    { code: 'INVALID_FILE_TYPE' }
  );
  cb(err as any);
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
        const isVideo = file.mimetype.startsWith('video/');
        const resource_type: 'video' | 'raw' = isVideo ? 'video' : 'raw';
        const ext  = path.extname(file.originalname).toLowerCase();
        const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
        return {
          folder:        'sporthink/courses',
          resource_type,
          public_id:     `${Date.now()}_${safe}`,
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
      cb(null, `${Date.now()}_${safeName}${ext}`);
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
