// api/src/cart/cart.module.ts
import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [CatalogModule], // برای دسترسی به PricingEngineService
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
