import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { withAccelerate } from '@prisma/extension-accelerate';

/** آدرس‌های Prisma Accelerate / Prisma Postgres؛ هر آدرس دیگری اتصال مستقیم PostgreSQL است */
export function isAccelerateUrl(url: string): boolean {
  return url.startsWith('prisma://') || url.startsWith('prisma+postgres://');
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }

    if (isAccelerateUrl(url)) {
      // برای Accelerate (prisma+postgres://) حتماً accelerateUrl بدهید
      super({
        accelerateUrl: url,
        log: ['error', 'warn'],
      });

      // فعال‌سازی اکستنشن Accelerate
      this.$extends(withAccelerate());
    } else {
      // اتصال مستقیم به PostgreSQL (مثلاً دیتابیس چابکان: postgresql://USER:PASS@HOST:PORT/DB)
      super({
        adapter: new PrismaPg({ connectionString: url }),
        log: ['error', 'warn'],
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
