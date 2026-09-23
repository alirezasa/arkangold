// api/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditedThrottlerGuard } from './common/audit/audited-throttler.guard';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { RetentionModule } from './common/retention/retention.module';
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
import { StorageModule } from './common/storage/storage.module';
import { DocumentSequenceModule } from './common/documents/document-sequence.module';
import { InvoiceModule } from './invoice/invoice.module';
import { DepositModule } from './deposit/deposit.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { TicketsModule } from './tickets/tickets.module';
import { HologramModule } from './hologram/hologram.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 30 }]),
    PrismaModule,
    AuditModule,
    RetentionModule,
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
    StorageModule, // Global
    DocumentSequenceModule, // Global
    InvoiceModule,
    DepositModule,
    IntegrationsModule,
    TicketsModule,
    HologramModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuditedThrottlerGuard }],
})
export class AppModule {}
