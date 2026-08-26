// api/src/app.module.ts

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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
