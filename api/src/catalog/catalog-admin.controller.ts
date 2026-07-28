// api/src/catalog/catalog-admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { PricingEngineService } from './pricing-engine.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
//import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { UseInterceptors } from '@nestjs/common';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateProductVariantDto,
  UpdateProductVariantDto,
  GetProductsQueryDto,
  SetProductPricingDto,
} from '@arkan-gold/shared';

@ApiTags('Admin - Shop Catalog')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
//@RequirePermission('shop.manage')
@Controller('admin/shop')
export class CatalogAdminController {
  constructor(
    private readonly service: CatalogService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  @Get('products')
  @ApiOperation({ summary: 'لیست محصولات (ادمین)' })
  list(@Query() query: GetProductsQueryDto) {
    return this.service.adminListProducts(query);
  }

  @Post('products/draft')
  @ApiOperation({ summary: 'ایجاد محصول Draft (ورود به فرم ساخت)' })
  createDraft() {
    return this.service.createDraftProduct();
  }
  @Get('products/:id')
  @ApiOperation({ summary: 'جزئیات محصول برای ویرایش' })
  getOne(@Param('id') id: string) {
    return this.service.getProductForAdmin(id);
  }

  @Get('categories')
  @ApiOperation({ summary: 'لیست دسته‌بندی‌ها (ادمین)' })
  listCategories() {
    return this.service.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  @Post('products')
  @AuditLog('shop.product.create')
  @UseInterceptors(AuditLogInterceptor)
  createProduct(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @Patch('products/:id')
  @AuditLog('shop.product.update')
  @UseInterceptors(AuditLogInterceptor)
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.updateProduct(id, dto);
  }

  @Post('products/:id/variants')
  addVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.service.addVariant(id, dto);
  }

  @Patch('variants/:id')
  updateVariant(@Param('id') id: string, @Body() dto: UpdateProductVariantDto) {
    return this.service.updateVariant(id, dto);
  }

  @Delete('variants/:id')
  deleteVariant(@Param('id') id: string) {
    return this.service.deleteVariant(id);
  }

  // ── فرمول قیمت‌گذاری ──
  @Get('pricing-components')
  listComponents() {
    return this.service.listPricingComponents();
  }

  @Post('pricing-components')
  createComponent(@Body() dto: { key: string; label: string }) {
    return this.service.createPricingComponent(dto);
  }

  @Put('products/:id/pricing')
  @AuditLog('shop.product.pricing.update')
  @UseInterceptors(AuditLogInterceptor)
  setPricing(@Param('id') id: string, @Body() dto: SetProductPricingDto) {
    return this.service.setProductPricing(id, dto);
  }

  @Get('products/:id/pricing-preview')
  previewPricing(
    @Param('id') id: string,
    @Query('weightGrams') weightGrams: string,
  ) {
    return this.pricingEngine.calculateForProduct(id, Number(weightGrams || 1));
  }
}
