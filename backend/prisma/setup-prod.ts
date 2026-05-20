/* eslint-disable no-console */
/**
 * Production'da minimum kurulum: roller + admin kullanıcısı + KPI tanımları
 * + feedback kategorileri. Excel dosyası GEREKMEZ.
 *
 * Çalıştırma (Render Shell veya yerelde):
 *   npx ts-node prisma/setup-prod.ts
 *
 * Önce tabloları oluşturduğundan emin ol:
 *   npx prisma db push
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'perakende1@sporthink.local';
const ADMIN_PASSWORD = 'Admin123!';

async function ensureRoles() {
  const roles = [
    { roleId: 1, roleName: 'Admin' },
    { roleId: 2, roleName: 'Bölge Müdürü' },
    { roleId: 3, roleName: 'Mağaza Müdürü' },
    { roleId: 4, roleName: 'Satış Danışmanı' },
    { roleId: 5, roleName: 'Eğitim Uzmanı' },
  ];
  for (const role of roles) {
    await prisma.role.upsert({
      where: { roleId: role.roleId },
      update: { roleName: role.roleName },
      create: role,
    });
  }
  console.log('Roller hazır.');
}

async function ensureKpis() {
  const kpis = [
    { kpiId: 1, kpiName: 'Aylık Satış Hedefi (Ciro)', unit: 'TL' },
    { kpiId: 2, kpiName: 'Fatura Sayısı',             unit: 'Adet' },
    { kpiId: 3, kpiName: 'MDO',                       unit: '%' },
    { kpiId: 4, kpiName: 'UPT',                       unit: 'Adet' },
  ];
  for (const kpi of kpis) {
    await prisma.kpiDefinition.upsert({
      where: { kpiId: kpi.kpiId },
      update: { kpiName: kpi.kpiName, unit: kpi.unit },
      create: kpi,
    });
  }
  console.log('KPI tanımları hazır.');
}

async function ensureFeedbackCategories() {
  const cats = [
    { categoryId: 1, categoryName: 'Pozitif',    description: 'Yüksek Performans — başarıların takdir edildiği geri bildirim.' },
    { categoryId: 2, categoryName: 'Yapıcı',     description: 'Gelişime Açık — iyileştirme önerileri içeren rehberlik.' },
    { categoryId: 3, categoryName: 'Odaklanmış', description: 'Düşük Performans — yakın takip gerektiren konular.' },
  ];
  for (const c of cats) {
    await prisma.feedbackCategory.upsert({
      where:  { categoryId: c.categoryId },
      update: { categoryName: c.categoryName, description: c.description },
      create: c,
    });
  }
  console.log('Feedback kategorileri hazır.');
}

async function ensureAdmin() {
  const email = ADMIN_EMAIL.toLowerCase();
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { userId: existing.userId },
      data: { password: hashed, status: 1, roleId: 1 },
    });
    console.log(`Admin güncellendi: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        fullName: 'Perakende Admin',
        email,
        password: hashed,
        roleId: 1,
        storeId: null,
        status: 1,
      },
    });
    console.log(`Admin oluşturuldu: ${email}`);
  }
  console.log(`Şifre: ${ADMIN_PASSWORD}`);
}

async function main() {
  await ensureRoles();
  await ensureKpis();
  await ensureFeedbackCategories();
  await ensureAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
