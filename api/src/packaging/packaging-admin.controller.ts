// api/src/packaging/packaging-admin.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { PACKAGING_UPLOAD_DIR, PackagingService } from './packaging.service';
import {
  CreatePackagingOptionDto,
  SetProductPackagingDto,
  UpdatePackagingOptionDto,
  UpdatePackagingSettingsDto,
} from './packaging.dto';

if (!fs.existsSync(PACKAGING_UPLOAD_DIR)) {
  fs.mkdirSync(PACKAGING_UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

@ApiTags('Admin - Shop Packaging')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequirePermission('shop.manage')
@Controller('admin/shop')
export class PackagingAdminController {
  constructor(private readonly service: PackagingService) {}

  @Get('packaging')
  @ApiOperation({ summary: 'لیست طرح‌های بسته‌بندی + تنظیمات رایگان شدن' })
  list() {
    return this.service.adminList();
  }

  @AuditLog('shop.packaging.create')
  @UseInterceptors(AuditLogInterceptor)
  @Post('packaging')
  @ApiOperation({ summary: 'ایجاد طرح بسته‌بندی' })
  create(@Body() dto: CreatePackagingOptionDto) {
    return this.service.create(dto);
  }

  @AuditLog('shop.packaging.settings.update')
  @UseInterceptors(AuditLogInterceptor)
  @Put('packaging/settings')
  @ApiOperation({ summary: 'تنظیم آستانه عمومی رایگان شدن بسته‌بندی' })
  updateSettings(@Body() dto: UpdatePackagingSettingsDto) {
    return this.service.updateSettings(dto);
  }

  @AuditLog('shop.packaging.update')
  @UseInterceptors(AuditLogInterceptor)
  @Patch('packaging/:id')
  @ApiOperation({ summary: 'ویرایش / فعال و غیرفعال‌سازی طرح بسته‌بندی' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackagingOptionDto,
  ) {
    return this.service.update(id, dto);
  }

  @AuditLog('shop.packaging.delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete('packaging/:id')
  @ApiOperation({ summary: 'حذف طرح بسته‌بندی استفاده‌نشده' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @AuditLog('shop.packaging.assign_all')
  @UseInterceptors(AuditLogInterceptor)
  @Post('packaging/:id/assign-all')
  @ApiOperation({ summary: 'اختصاص طرح به همه محصولات' })
  assignAll(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.assignToAllProducts(id);
  }

  @AuditLog('shop.packaging.image.upload')
  @UseInterceptors(
    AuditLogInterceptor,
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PACKAGING_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          cb(
            null,
            `${Date.now()}-${randomUUID()}${extname(file.originalname)}`,
          );
        },
      }),
      limits: { fileSize: 3 * 1024 * 1024 }, // ۳ مگابایت
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
  @Post('packaging/:id/image')
  @ApiOperation({ summary: 'آپلود تصویر طرح بسته‌بندی' })
  uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('فایل تصویر را انتخاب کنید');
    return this.service.setImage(id, file);
  }

  @AuditLog('shop.packaging.image.delete')
  @UseInterceptors(AuditLogInterceptor)
  @Delete('packaging/:id/image')
  @ApiOperation({ summary: 'حذف تصویر طرح بسته‌بندی' })
  removeImage(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeImage(id);
  }

  // ── اختصاص طرح‌ها به محصول ──

  @Get('products/:id/packaging')
  @ApiOperation({
    summary: 'طرح‌های بسته‌بندی محصول (همه طرح‌ها + وضعیت اختصاص)',
  })
  getProductPackaging(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProductPackagingForAdmin(id);
  }

  @AuditLog('shop.product.packaging.update')
  @UseInterceptors(AuditLogInterceptor)
  @Put('products/:id/packaging')
  @ApiOperation({ summary: 'تعیین طرح‌های بسته‌بندی قابل انتخاب محصول' })
  setProductPackaging(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductPackagingDto,
  ) {
    return this.service.setProductPackaging(id, dto);
  }
}
