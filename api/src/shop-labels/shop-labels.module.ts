// api/src/shop-labels/shop-labels.module.ts
import { Module } from '@nestjs/common';
import { ShopLabelsService } from './shop-labels.service';
import { ShopLabelsAdminController } from './shop-labels-admin.controller';

@Module({
  controllers: [ShopLabelsAdminController],
  providers: [ShopLabelsService],
})
export class ShopLabelsModule {}
