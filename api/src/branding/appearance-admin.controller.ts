// api/src/branding/appearance-admin.controller.ts
//
// پنل مدیریت ← ظاهر و تم: رنگ‌های برند (روشن/تاریک) و فونت سفارشی کل سیستم.
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import { BRANDING_FONT_POLICY } from '../common/file-security/upload-policies';
import { AppearanceService } from './appearance.service';
import { UpdateAppearanceDto } from './appearance.dto';
import type { FontWeightSlot } from './appearance.theme';

function parseSlot(slot: string): FontWeightSlot {
  if (!AppearanceService.isSlot(slot)) {
    throw new BadRequestException('وزن فونت نامعتبر است');
  }
  return slot;
}

@ApiTags('Admin Appearance')
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/branding/appearance')
export class AppearanceAdminController {
  constructor(private readonly service: AppearanceService) {}

  @Get()
  @RequirePermission('system_config.view')
  @ApiOperation({ summary: 'رنگ‌ها و فونت فعلی سیستم' })
  get() {
    return this.service.getAdminSettings();
  }

  @Put()
  @RequirePermission('system_config.edit')
  @AuditLog('system_config.appearance.update')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'ذخیره‌ی رنگ‌های سیستم' })
  update(@Body() dto: UpdateAppearanceDto) {
    return this.service.updateColors(dto.colors ?? {}, dto.fontName);
  }

  @Delete('colors')
  @RequirePermission('system_config.edit')
  @AuditLog('system_config.appearance.reset')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'بازگشت رنگ‌ها به پیش‌فرض' })
  reset() {
    return this.service.resetColors();
  }

  @Post('font/:slot')
  @RequirePermission('system_config.edit')
  @AuditLog('system_config.appearance.font_upload')
  @UseInterceptors(
    AuditLogInterceptor,
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: BRANDING_FONT_POLICY.maxBytes, files: 1 },
    }),
  )
  @ApiOperation({ summary: 'بارگذاری فونت سفارشی (معمولی یا ضخیم)' })
  uploadFont(
    @Param('slot') slot: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadFont(parseSlot(slot), file);
  }

  @Delete('font/:slot')
  @RequirePermission('system_config.edit')
  @AuditLog('system_config.appearance.font_remove')
  @UseInterceptors(AuditLogInterceptor)
  @ApiOperation({ summary: 'حذف فونت سفارشی و بازگشت به فونت پیش‌فرض' })
  removeFont(@Param('slot') slot: string) {
    return this.service.removeFont(parseSlot(slot));
  }
}
