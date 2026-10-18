// api/src/branding/branding-admin.controller.ts
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { BRANDING_IMAGE_POLICY } from '../common/file-security/upload-policies';
import { BrandingKind, BrandingService } from './branding.service';

function parseKind(kind: string): BrandingKind {
  if (!BrandingService.isKind(kind)) {
    throw new BadRequestException('نوع تصویر نامعتبر است');
  }
  return kind;
}

@ApiTags('Admin Branding')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/branding')
export class BrandingAdminController {
  constructor(private readonly service: BrandingService) {}

  @Get()
  @RequirePermission('system_config.view')
  @ApiOperation({ summary: 'پیش‌نمایش لوگو، مهر و امضای شرکت' })
  preview() {
    return this.service.getAdminPreview();
  }

  @Post(':kind')
  @RequirePermission('system_config.edit')
  @AuditLog('system_config.branding.upload')
  @UseInterceptors(
    AuditLogInterceptor,
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: BRANDING_IMAGE_POLICY.maxBytes, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'بارگذاری لوگو / مهر / امضای شرکت' })
  upload(@Param('kind') kind: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.upload(parseKind(kind), file);
  }

  @Delete(':kind')
  @RequirePermission('system_config.edit')
  @AuditLog('system_config.branding.remove')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'حذف لوگو / مهر / امضای شرکت' })
  remove(@Param('kind') kind: string) {
    return this.service.remove(parseKind(kind));
  }
}
