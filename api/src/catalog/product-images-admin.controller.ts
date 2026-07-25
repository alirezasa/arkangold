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
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { IsString, IsOptional, IsArray, ArrayNotEmpty } from 'class-validator';
import { ProductImagesService } from './product-images.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';

const UPLOAD_DIR = './uploads/products';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
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
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, unique);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // ۵ مگابایت هر فایل
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'فرمت فایل مجاز نیست (فقط JPEG, PNG, WEBP)',
            ),
            false,
          );
        }
        cb(null, true);
      },
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
