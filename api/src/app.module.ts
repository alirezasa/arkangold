// api/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditedThrottlerGuard } from './common/audit/audited-throttler.guard';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './common/auth-security/redis-throttler.storage';
import { AuthSecurityModule } from './common/auth-security/auth-security.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseAllowlistInterceptor } from './common/serialization/response-allowlist.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { RetentionModule } from './common/retention/retention.module';
import { SecurityModule } from './security/security.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { BankModule } from './bank/bank.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { WalletModule } from './wallet/wallet.module';
import { MarketModule } from './market/market.module';
import { AccountingModule } from './/accounting/accounting.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PhysicalDeliveryModule } from './/physical-delivery/physical-delivery.module';
import { AddressesModule } from './addresses/addresses.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { ShopOrdersModule } from './shop-orders/shop-orders.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { PaymentGatewayModule } from './payment-gateway/payment-gateway.module';
import { PayrollModule } from './payroll/payroll.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { StorageModule } from './common/storage/storage.module';
import { DocumentSequenceModule } from './common/documents/document-sequence.module';
import { InvoiceModule } from './invoice/invoice.module';
import { DepositModule } from './deposit/deposit.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TicketsModule } from './tickets/tickets.module';
import { HologramModule } from './hologram/hologram.module';
import { ReferralModule } from './referral/referral.module';
import { DiscountModule } from './discount/discount.module';
import { PackagingModule } from './packaging/packaging.module';
import { AgentModule } from './agent/agent.module';
import { TreasuryModule } from './treasury/treasury.module';
import { PartnersModule } from './partners/partners.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // FIA_UAU_EXT.2.1: شمارنده‌های محدودیت نرخ در Redis تا بین همه‌ی نمونه‌های API مشترک باشند
    ThrottlerModule.forRootAsync({
      inject: ['REDIS_CLIENT'],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60000, limit: 30 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    PrismaModule,
    NotificationsModule, // Global — مرکز پیامک
    AuditModule,
    RetentionModule,
    AuthSecurityModule,
    SecurityModule,
    RedisModule,
    AuthModule,
    UsersModule,
    BankModule,
    SystemConfigModule,
    WalletModule,
    MarketModule,
    AccountingModule,
    TransactionsModule,
    PhysicalDeliveryModule,
    AddressesModule,
    CatalogModule,
    CartModule,
    ShopOrdersModule,
    AdminAuthModule,
    PaymentGatewayModule,
    PayrollModule,
    AnnouncementsModule,
    StorageModule, // Global
    DocumentSequenceModule, // Global
    InvoiceModule,
    DepositModule,
    IntegrationsModule,
    TicketsModule,
    HologramModule,
    ReferralModule,
    DiscountModule,
    PackagingModule,
    AgentModule,
    TreasuryModule,
    PartnersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuditedThrottlerGuard },
    // FDP_RIP_EXT.1.3 — حذف فیلدهای داخلی/امنیتی از همه‌ی پاسخ‌ها
    { provide: APP_INTERCEPTOR, useClass: ResponseAllowlistInterceptor },
  ],
})
export class AppModule {}
