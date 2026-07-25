import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogAdminController } from './catalog-admin.controller';
import { ProductImagesAdminController } from './product-images-admin.controller';
import { CatalogService } from './catalog.service';
import { ProductImagesService } from './product-images.service';

@Module({
  controllers: [
    CatalogController,
    CatalogAdminController,
    ProductImagesAdminController,
  ],
  providers: [CatalogService, ProductImagesService],
  exports: [CatalogService],
})
export class CatalogModule {}
