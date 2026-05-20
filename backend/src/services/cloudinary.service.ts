/**
 * Cloudinary Service
 *
 * Tek seferlik client config + isConfigured() helper.
 * Upload middleware bu servisin yapılandırma durumuna göre CloudinaryStorage
 * veya yerel disk storage'a düşer.
 *
 * Güvenlik: API_SECRET sadece sunucu tarafında kullanılır, asla istemciye gitmez.
 */

import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const apiKey    = process.env.CLOUDINARY_API_KEY    ?? '';
const apiSecret = process.env.CLOUDINARY_API_SECRET ?? '';

const configured = Boolean(cloudName && apiKey && apiSecret);

if (configured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    apiKey,
    api_secret: apiSecret,
    secure:     true, // her zaman https URL'i döner
  });
  console.log(`[Cloudinary] ✅ Yapılandırıldı (cloud: ${cloudName})`);
} else {
  console.warn('[Cloudinary] ⚠️  YAPILANDIRILMADI — uploads yerel disk\'e gidecek.');
  console.warn('  Eksik env:',
    [
      !cloudName && 'CLOUDINARY_CLOUD_NAME',
      !apiKey    && 'CLOUDINARY_API_KEY',
      !apiSecret && 'CLOUDINARY_API_SECRET',
    ].filter(Boolean).join(', ')
  );
}

export function isCloudinaryConfigured(): boolean {
  return configured;
}

export { cloudinary };
