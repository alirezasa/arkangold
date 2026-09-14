import { PrismaClient } from '../src/generated/prisma/client';
const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = [
  { name: 'پشتیبانی فنی', slug: 'technical', sortOrder: 1 },
  { name: 'مالی', slug: 'financial', sortOrder: 2 },
  { name: 'فروش', slug: 'sales', sortOrder: 3 },
  { name: 'حساب کاربری', slug: 'account', sortOrder: 4 },
  { name: 'احراز هویت', slug: 'kyc', sortOrder: 5 },
  { name: 'سفارش', slug: 'order', sortOrder: 6 },
  { name: 'پرداخت', slug: 'payment', sortOrder: 7 },
  { name: 'شکایت', slug: 'complaint', sortOrder: 8 },
  { name: 'پیشنهاد', slug: 'suggestion', sortOrder: 9 },
  { name: 'سایر', slug: 'other', sortOrder: 10 },
];

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.ticketCategory.upsert({
      where: { slug: cat.slug },
      create: { ...cat, isActive: true },
      update: {},
    });
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} ticket categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
