// api/scripts/create-first-admin.ts
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import * as readline from 'readline/promises';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL در فایل .env تنظیم نشده است');
}

const basePrisma = new PrismaClient({
  accelerateUrl: databaseUrl,
  log: ['error', 'warn'],
});
const prisma = basePrisma.$extends(withAccelerate());

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return 'خطای ناشناخته';
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const username = await rl.question('نام کاربری ادمین: ');
  const password = await rl.question('رمز عبور (حداقل ۱۲ کاراکتر): ');
  const fullName = await rl.question('نام کامل: ');
  const roleKey =
    (await rl.question(
      'نقش (SUPER_ADMIN/FINANCE_ADMIN/SUPPORT_ADMIN/SHOP_ADMIN) [SUPER_ADMIN]: ',
    )) || 'SUPER_ADMIN';
  rl.close();

  if (password.length < 12) {
    throw new Error('رمز عبور باید حداقل ۱۲ کاراکتر باشد');
  }

  const role = await prisma.adminRole.findUnique({ where: { key: roleKey } });
  if (!role) {
    throw new Error(
      `نقش ${roleKey} یافت نشد. ابتدا اپ API را حداقل یک‌بار اجرا کنید تا RBAC sync شود`,
    );
  }

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) throw new Error('این نام کاربری قبلاً استفاده شده است');

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.adminUser.create({
    data: { username, passwordHash, fullName, roleId: role.id },
  });

  console.log(`✅ ادمین "${admin.username}" با نقش ${role.name} ایجاد شد.`);
}

main()
  .catch((e: unknown) => {
    console.error('❌ خطا:', getErrorMessage(e));
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());
