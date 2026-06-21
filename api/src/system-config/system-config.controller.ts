import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemConfigService } from './system-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('System Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/system-config')
export class SystemConfigController {
  constructor(private readonly configService: SystemConfigService) {}

  @Get()
  @ApiOperation({ summary: 'دریافت همه تنظیمات سیستم' })
  getAll() {
    return this.configService.getAll();
  }

  @Put(':key')
  @ApiOperation({ summary: 'بروزرسانی یک تنظیم' })
  async update(@Param('key') key: string, @Body() body: { value: string }) {
    await this.configService.set(key, body.value);
    await this.configService.invalidateCache();
    return { message: 'تنظیم با موفقیت بروزرسانی شد', key, value: body.value };
  }
}
