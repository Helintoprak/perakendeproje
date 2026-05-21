import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { cloudinary, isCloudinaryConfigured } from '../services/cloudinary.service';

const ALLOWED_CONTENT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.ms-powerpoint', // .ppt
  'video/mp4',
  'video/webm',
  'video/quicktime',
];
const ALLOWED_CONTENT_EXT = ['.pdf', '.pptx', '.ppt', '.mp4', '.webm', '.mov'];

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = ALLOWED_CONTENT_MIME.includes(file.mimetype) || file.mimetype === 'application/octet-stream';
  const extOk  = ALLOWED_CONTENT_EXT.includes(ext);
  if (mimeOk && extOk) return cb(null, true);
  const err = Object.assign(
    new Error(`Geçersiz dosya tipi: "${ext}" (${file.mimetype}). PDF/PPTX/MP4 vb. desteklenir.`),
    { code: 'INVALID_FILE_TYPE' }
  );
  cb(err as any);
};

// Her zaman memory storage — dosya buffer'da tutulur, sonra hedef storage'a gönderilir
export const upload = multer({
  storage:    multer.memoryStorage(),
  fileFilter,
});

/**
 * Dosyayı hedefe yükler ve kanonik URL döner.
 *   • Cloudinary yapılandırılmışsa → buffer'ı Cloudinary'e upload eder, HTTPS URL döner
 *   • Değilse              → yerel disk'e yazar, /uploads/<filename> döner
 */
export async function uploadFileToCloud(file: Express.Multer.File): Promise<string> {
  if (isCloudinaryConfigured()) {
    const isVideo = file.mimetype.startsWith('video/');
    const resource_type: 'video' | 'raw' = isVideo ? 'video' : 'raw';
    const ext  = path.extname(file.originalname).toLowerCase();
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const public_id = `sporthink/courses/${Date.now()}_${safe}`;

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type, public_id, overwrite: false },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary sonuç boş döndü.'));
          resolve(result.secure_url);
        }
      );
      stream.end(file.buffer);
    });
  }

  // Disk fallback
  const ext      = path.extname(file.originalname).toLowerCase();
  const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filename = `${Date.now()}_${safeName}${ext}`;
  const dest     = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(dest, file.buffer);
  return `/uploads/${filename}`;
}

/** @deprecated — sadece geriye dönük uyumluluk için bırakıldı, uploadFileToCloud kullanın */
export function fileUrlFromUpload(file: Express.Multer.File): string {
  if (isCloudinaryConfigured()) return (file as any).path ?? '';
  return `/uploads/${file.filename}`;
}
