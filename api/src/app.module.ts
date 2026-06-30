import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { BankModule } from './bank/bank.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { WalletModule } from './wallet/wallet.module';
import { MarketModule } from './market/market.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 30 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    UsersModule,
    BankModule,
    SystemConfigModule,
    WalletModule,
    MarketModule, // ← اضافه شد
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
