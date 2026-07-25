import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateProductVariantDto,
  UpdateProductVariantDto,
} from '@arkan-gold/shared';

// TODO: پشت AdminGuard اختصاصی قرار بگیرد
@ApiTags('Admin - Shop Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/shop')
export class CatalogAdminController {
  constructor(private readonly service: CatalogService) {}

  @Post('categories')
  @ApiOperation({ summary: 'ایجاد دسته‌بندی' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'ویرایش دسته‌بندی' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  @Post('products')
  @ApiOperation({ summary: 'ایجاد محصول' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'ویرایش محصول' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.updateProduct(id, dto);
  }

  @Post('products/:id/variants')
  @ApiOperation({ summary: 'افزودن تنوع به محصول' })
  addVariant(@Param('id') id: string, @Body() dto: CreateProductVariantDto) {
    return this.service.addVariant(id, dto);
  }

  @Patch('variants/:id')
  @ApiOperation({ summary: 'ویرایش تنوع محصول' })
  updateVariant(@Param('id') id: string, @Body() dto: UpdateProductVariantDto) {
    return this.service.updateVariant(id, dto);
  }

  @Delete('variants/:id')
  @ApiOperation({ summary: 'حذف تنوع محصول' })
  deleteVariant(@Param('id') id: string) {
    return this.service.deleteVariant(id);
  }
}
