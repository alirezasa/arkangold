import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/system-config')
export class SystemConfigController {
  constructor(private readonly configService: SystemConfigService) {}

  @RequirePermission('system_config.view')
  @Get()
  getAll() {
    return this.configService.getAll();
  }

  @RequirePermission('system_config.edit')
  @Put(':key')
  async update(@Param('key') key: string, @Body() body: { value: string }) {
    await this.configService.set(key, body.value);
    await this.configService.invalidateCache();
    return { message: 'تنظیم با موفقیت بروزرسانی شد', key, value: body.value };
  }
}
