import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { GetProductsQueryDto } from '@arkan-gold/shared';

@ApiTags('Shop - Catalog')
@Controller('shop')
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'لیست دسته‌بندی‌ها' })
  listCategories() {
    return this.service.listCategories();
  }

  @Get('products')
  @ApiOperation({ summary: 'لیست محصولات با فیلتر' })
  listProducts(@Query() query: GetProductsQueryDto) {
    return this.service.listProducts(query);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'جزئیات یک محصول' })
  getProduct(@Param('slug') slug: string) {
    return this.service.getProductBySlug(slug);
  }
}
