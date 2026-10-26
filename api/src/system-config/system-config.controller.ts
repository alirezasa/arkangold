import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsString, MaxLength } from 'class-validator';
import { SystemConfigService } from './system-config.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { AuditService } from '../common/audit/audit.service';

// FPT_ITT_EXT.5.3 — فقط فیلد value پذیرفته می‌شود
class UpdateSystemConfigDto {
  @IsString()
  @MaxLength(5000)
  value!: string;
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

/** مقدار نمایشی تنظیمات محرمانه؛ ذخیره‌ی همین مقدار یعنی «بدون تغییر» */
export const SECRET_CONFIG_MASK = '••••••••';

/** FCS_CKM_EXT.1.4 — تنظیماتی که مقدارشان راز است (رمز وب‌سرویس درگاه و مشابه) */
export function isSecretConfigKey(key: string): boolean {
  return /(^|[._])(password|secret|api_?key|token)$/i.test(key);
}

const maskValue = (key: string, value: string) =>
  isSecretConfigKey(key) && value ? SECRET_CONFIG_MASK : value;

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/system-config')
export class SystemConfigController {
  constructor(
    private readonly configService: SystemConfigService,
    private readonly auditService: AuditService,
  ) {}

  @RequirePermission('system_config.view')
  @Get()
  async getAll() {
    // مقدار رازها هرگز به مرورگر فرستاده نمی‌شود؛ فقط وجود مقدار نمایش داده می‌شود
    const configs = await this.configService.getAll();
    return configs.map((c) => ({ ...c, value: maskValue(c.key, c.value) }));
  }

  @RequirePermission('system_config.edit')
  @Put(':key')
  async update(
    @Param('key') key: string,
    @Body() body: UpdateSystemConfigDto,
    @Req() req: AdminRequest,
  ) {
    const secret = isSecretConfigKey(key);
    if (secret && body.value === SECRET_CONFIG_MASK) {
      return {
        message: 'تنظیم بدون تغییر ماند',
        key,
        value: SECRET_CONFIG_MASK,
      };
    }
    const previous = await this.configService.find(key);
    await this.configService.set(key, body.value);
    await this.configService.invalidateCache();
    // FAU_GEN_EXT.1 — تغییر هر تنظیم (از جمله کنترل‌های امنیتی) با مقدار قبلی و جدید ثبت می‌شود
    await this.auditService.logAdmin({
      adminUserId: req.user.adminUserId,
      action: 'system_config.update',
      entityType: 'SystemConfig',
      entityId: key,
      oldValue: {
        key,
        value: previous === null ? null : maskValue(key, previous),
      },
      newValue: { key, value: maskValue(key, body.value) },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      source: SystemConfigController.name,
      success: true,
    });
    return {
      message: 'تنظیم با موفقیت بروزرسانی شد',
      key,
      value: maskValue(key, body.value),
    };
  }
}
