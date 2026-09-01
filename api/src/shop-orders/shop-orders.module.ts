import { Module } from '@nestjs/common';
import { ShopOrdersController } from './shop-orders.controller';
import { ShopOrdersAdminController } from './shop-orders-admin.controller';
import { ShopOrdersService } from './shop-orders.service';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [PaymentGatewayModule, AccountingModule],
  controllers: [ShopOrdersController, ShopOrdersAdminController],
  providers: [ShopOrdersService],
  exports: [ShopOrdersService],
})
export class ShopOrdersModule {}
