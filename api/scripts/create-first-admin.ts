// api/scripts/create-first-admin.ts
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/common/crypto/password.util';
import { PasswordPolicyService } from '../src/common/password-policy/password-policy.service';
import { assertUsernameAllowed } from '../src/common/auth-security/account-hygiene';
import type { SystemConfigService } from '../src/system-config/system-config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import * as readline from 'readline/promises';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL در فایل .env تنظیم نشده است');
}

// Prisma Accelerate (prisma+postgres://) یا اتصال مستقیم PostgreSQL (مثلاً دیتابیس چابکان)
const isAccelerate =
  databaseUrl.startsWith('prisma://') ||
  databaseUrl.startsWith('prisma+postgres://');
const basePrisma = new PrismaClient({
  ...(isAccelerate
    ? { accelerateUrl: databaseUrl }
    : { adapter: new PrismaPg({ connectionString: databaseUrl }) }),
  log: ['error', 'warn'],
});
const prisma = basePrisma;

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
  const username = (
    await rl.question('نام کاربری ادمین (نام شخصی، نه admin/root): ')
  ).trim();
  const password = await rl.question(
    'رمز عبور (حداقل ۱۵ کاراکتر؛ عبارت عبور طولانی توصیه می‌شود): ',
  );
  const fullName = await rl.question('نام کامل: ');
  const phone = (
    await rl.question('شماره موبایل (برای هشدارهای امنیتی و بازیابی): ')
  ).trim();
  const roleKey =
    (await rl.question(
      'نقش (SUPER_ADMIN/FINANCE_ADMIN/SUPPORT_ADMIN/SHOP_ADMIN) [SUPER_ADMIN]: ',
    )) || 'SUPER_ADMIN';
  rl.close();

  // FIA_UAU_EXT.2.2: نام کاربری پیش‌فرض ممنوع؛ FIA_UAU_EXT.1: همان سیاست رمز عبور پنل
  try {
    assertUsernameAllowed(username);
  } catch (e) {
    throw new Error(getErrorMessage((e as { message?: string }).message ?? e));
  }
  if (!/^09\d{9}$/.test(phone)) {
    throw new Error('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود');
  }
  const policy = new PasswordPolicyService({
    getNumber: (_k: string, d: number) => Promise.resolve(d),
    getBoolean: (_k: string, d: boolean) => Promise.resolve(d),
    get: (_k: string, d: string) => Promise.resolve(d),
  } as unknown as SystemConfigService);
  policy.onModuleInit();
  const reason = await policy.check(password, 'admin', {
    username,
    fullName,
    phone,
  });
  if (reason) throw new Error(reason);

  const role = await prisma.adminRole.findUnique({ where: { key: roleKey } });
  if (!role) {
    throw new Error(
      `نقش ${roleKey} یافت نشد. ابتدا اپ API را حداقل یک‌بار اجرا کنید تا RBAC sync شود`,
    );
  }

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) throw new Error('این نام کاربری قبلاً استفاده شده است');

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      fullName,
      phone,
      passwordChangedAt: new Date(),
      roles: { create: { roleId: role.id } },
    },
  });

  console.log(`✅ ادمین "${admin.username}" با نقش ${role.name} ایجاد شد.`);
  console.log(
    'در اولین ورود، راه‌اندازی برنامه‌ی احراز هویت (ورود دومرحله‌ای) اجباری است.',
  );
}

main()
  .catch((e: unknown) => {
    console.error('❌ خطا:', getErrorMessage(e));
    process.exit(1);
  })
  .finally(() => basePrisma.$disconnect());
