import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// تعریف type برای PrismaService
type PrismaClientType = PrismaClient;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private prismaClient: PrismaClientType;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not defined in .env file');
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });

    const adapter = new PrismaPg(pool);
    this.prismaClient = new PrismaClient({ adapter });
  }

  // Proxy all methods to prismaClient
  get userSession() {
    return this.prismaClient.userSession;
  }

  get user() {
    return this.prismaClient.user;
  }

  get userOtp() {
    return this.prismaClient.userOtp;
  }

  get userIdentity() {
    return this.prismaClient.userIdentity;
  }

  get wallet() {
    return this.prismaClient.wallet;
  }

  get order() {
    return this.prismaClient.order;
  }

  // اضافه کردن بقیه مدل‌ها بر اساس نیاز
  // می‌توانید تمام مدل‌ها را به صورت داینامیک اضافه کنید

  async onModuleInit() {
    await this.prismaClient.$connect();
    console.log('✅ Prisma connected to database');
  }

  async onModuleDestroy() {
    await this.prismaClient.$disconnect();
    console.log('❌ Prisma disconnected from database');
  }
}
