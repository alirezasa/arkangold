// api/src/catalog/catalog.module.ts
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogAdminController } from './catalog-admin.controller';
import { ProductImagesAdminController } from './product-images-admin.controller';
import { CatalogService } from './catalog.service';
import { ProductImagesService } from './product-images.service';
import { PricingEngineService } from './pricing-engine.service';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [MarketModule], // برای دسترسی PricingEngineService به PriceService
  controllers: [
    CatalogController,
    CatalogAdminController,
    ProductImagesAdminController,
  ],
  providers: [CatalogService, ProductImagesService, PricingEngineService],
  exports: [CatalogService, PricingEngineService],
})
export class CatalogModule {}
