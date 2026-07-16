import { Module } from '@nestjs/common';
import { ShopOrdersController } from './shop-orders.controller';
import { ShopOrdersAdminController } from './shop-orders-admin.controller';
import { ShopOrdersService } from './shop-orders.service';

@Module({
  controllers: [ShopOrdersController, ShopOrdersAdminController],
  providers: [ShopOrdersService],
  exports: [ShopOrdersService],
})
export class ShopOrdersModule {}
