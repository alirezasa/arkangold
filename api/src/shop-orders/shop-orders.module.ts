import { Module } from '@nestjs/common';
import { ShopOrdersController } from './shop-orders.controller';
import { ShopOrdersAdminController } from './shop-orders-admin.controller';
import { ShopOrdersService } from './shop-orders.service';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module'; // مسیر را چک کنید

@Module({
  imports: [
    PaymentGatewayModule, // اینجا اضافه کنید
    // سایر ماژول‌ها مثل PrismaModule و غیره
  ],
  controllers: [ShopOrdersController, ShopOrdersAdminController],
  providers: [ShopOrdersService],
  exports: [ShopOrdersService],
})
export class ShopOrdersModule {}
