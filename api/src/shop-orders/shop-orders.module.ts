import { Module } from '@nestjs/common';
import { ShopOrdersController } from './shop-orders.controller';
import { ShopOrdersAdminController } from './shop-orders-admin.controller';
import { ShopOrdersService } from './shop-orders.service';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { DiscountModule } from '../discount/discount.module';
import { PackagingModule } from '../packaging/packaging.module';

@Module({
  imports: [
    PaymentGatewayModule,
    AccountingModule,
    InvoiceModule,
    DiscountModule,
    PackagingModule,
  ],
  controllers: [ShopOrdersController, ShopOrdersAdminController],
  providers: [ShopOrdersService],
  exports: [ShopOrdersService],
})
export class ShopOrdersModule {}
