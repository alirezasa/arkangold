// api/src/prisma/prisma-options.ts
// انتخاب روش اتصال Prisma بر اساس DATABASE_URL:
//   - prisma:// یا prisma+postgres:// → Prisma Accelerate / `prisma dev` (محیط توسعه)
//   - postgres:// یا postgresql://      → اتصال مستقیم با درایور pg (PostgreSQL مدیریت‌شده در چابکان)
import { PrismaPg } from '@prisma/adapter-pg';

export function prismaConnectionOptions(
  url: string,
): { accelerateUrl: string } | { adapter: PrismaPg } {
  if (/^postgres(ql)?:\/\//i.test(url)) {
    return { adapter: new PrismaPg({ connectionString: url }) };
  }
  return { accelerateUrl: url };
}
