import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateProductVariantDto,
  UpdateProductVariantDto,
  GetProductsQueryDto,
} from '@arkan-gold/shared';

@ApiTags('Admin - Shop Catalog')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/shop')
export class CatalogAdminController {
  constructor(private readonly service: CatalogService) {}

  // ── دسته‌بندی‌ها ──
  @RequirePermission('shop.view')
  @Get('categories')
  @ApiOperation({ summary: 'لیست دسته‌بندی‌ها (ادمین)' })
  listCategories() {
    return this.service.listCategories();
  }

  @RequirePermission('shop.manage')
  @Post('categories')
  @ApiOperation({ summary: 'ایجاد دسته‌بندی' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }

  @RequirePermission('shop.manage')
  @Patch('categories/:id')
  @ApiOperation({ summary: 'ویرایش دسته‌بندی' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  // ── محصولات ──
  @RequirePermission('shop.view')
  @Get('products')
  @ApiOperation({ summary: 'لیست محصولات (ادمین، بدون فیلتر status=ACTIVE)' })
  listProducts(@Query() query: GetProductsQueryDto) {
    return this.service.adminListProducts(query);
  }

  @RequirePermission('shop.view')
  @Get('products/:id')
  @ApiOperation({ summary: 'جزئیات یک محصول برای ویرایش در ادمین' })
  getProduct(@Param('id') id: string) {
    return this.service.getProductByIdAdmin(id);
  }

  @RequirePermission('shop.manage')
  @Post('products')
  @ApiOperation({ summary: 'ایجاد محصول' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @RequirePermission('shop.manage')
  @Patch('products/:id')
  @ApiOperation({ summary: 'ویرایش محصول' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.updateProduct(id, dto);
  }

  // ── تنوع‌های محصول ──
  @RequirePermission('shop.manage')
  @Post('products/:id/variants')
  @ApiOperation({ summary: 'افزودن تنوع به محصول' })
  addVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.service.addVariant(id, dto);
  }

  @RequirePermission('shop.manage')
  @Patch('variants/:id')
  @ApiOperation({ summary: 'ویرایش تنوع محصول' })
  updateVariant(@Param('id') id: string, @Body() dto: UpdateProductVariantDto) {
    return this.service.updateVariant(id, dto);
  }

  @RequirePermission('shop.manage')
  @Delete('variants/:id')
  @ApiOperation({ summary: 'حذف تنوع محصول' })
  deleteVariant(@Param('id') id: string) {
    return this.service.deleteVariant(id);
  }
}
