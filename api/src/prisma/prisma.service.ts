import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import { prismaConnectionOptions } from './prisma-options';

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

    // Accelerate (prisma+postgres://) یا اتصال مستقیم PostgreSQL (postgresql://)
    super({
      ...prismaConnectionOptions(url),
      log: ['error', 'warn'],
    });

    // فعال‌سازی اکستنشن Accelerate
    this.$extends(withAccelerate());
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
