import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IsString, IsOptional, IsArray, ArrayNotEmpty } from 'class-validator';
import { ProductImagesService } from './product-images.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { CATALOG_IMAGE_POLICY } from '../common/file-security/upload-policies';

const MAX_FILES = 10;

class UpdateImageDto {
  @IsOptional()
  @IsString()
  altText?: string;
}

class ReorderImagesDto {
  @IsArray()
  @ArrayNotEmpty()
  orderedIds!: string[];
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('shop.manage')
@Controller('admin/shop')
export class ProductImagesAdminController {
  constructor(private readonly service: ProductImagesService) {}

  @Get('products/:id/images')
  listImages(@Param('id') id: string) {
    return this.service.listImages(id);
  }

  @AuditLog('shop.product.image.upload')
  @UseInterceptors(
    AuditLogInterceptor,
    FilesInterceptor('files', MAX_FILES, {
      // فایل پیش از نوشتن در پوشه‌ی عمومی بررسی و بازانکود می‌شود (FileSecurityService)
      storage: memoryStorage(),
      limits: { fileSize: CATALOG_IMAGE_POLICY.maxBytes, files: MAX_FILES },
    }),
  )
  @Post('products/:id/images')
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('حداقل یک فایل انتخاب کنید');
    }
    return this.service.addImages(id, files);
  }

  @AuditLog('shop.product.image.reorder')
  @UseInterceptors(AuditLogInterceptor)
  @Post('images/reorder/:productId')
  reorder(
    @Param('productId') productId: string,
    @Body() dto: ReorderImagesDto,
  ) {
    return this.service.reorder(productId, dto.orderedIds);
  }

  @AuditLog('shop.product.image.set_primary')
  @UseInterceptors(AuditLogInterceptor)
  @Patch('images/:id/primary')
  setPrimary(@Param('id') id: string) {
    return this.service.setPrimary(id);
  }

  @AuditLog('shop.product.image.update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch('images/:id')
  updateImage(@Param('id') id: string, @Body() dto: UpdateImageDto) {
    if (dto.altText === undefined) {
      throw new BadRequestException('چیزی برای بروزرسانی ارسال نشده');
    }
    return this.service.updateAlt(id, dto.altText);
  }

  @AuditLog('shop.product.image.delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete('images/:id')
  deleteImage(@Param('id') id: string) {
    return this.service.deleteImage(id);
  }
}
