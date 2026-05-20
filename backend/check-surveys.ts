import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find an admin user to reassign the survey to
  const admin = await prisma.user.findFirst({
    where: { role: { roleName: 'Admin' }, status: 1 },
    select: { userId: true, fullName: true },
  });
  console.log('Admin user:', admin);

  if (!admin) {
    // Fallback: find any active user
    const anyUser = await prisma.user.findFirst({
      where: { status: 1 },
      select: { userId: true, fullName: true },
    });
    console.log('Fallback user:', anyUser);
  }

  // Also check what managers exist
  const managers = await prisma.user.findMany({
    where: { role: { roleName: { in: ['Mağaza Müdürü', 'Mağaza Müdür Yardımcısı'] } }, status: 1 },
    select: { userId: true, fullName: true, role: { select: { roleName: true } } },
    take: 5,
  });
  console.log('Active managers:', JSON.stringify(managers, null, 2));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
