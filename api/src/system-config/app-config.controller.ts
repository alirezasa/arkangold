// api/src/system-config/app-config.controller.ts
// تنظیمات عمومی مورد نیاز اپلیکیشن کاربر (فقط مقادیر غیرحساس و قابل نمایش)

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemConfigService } from './system-config.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('App Config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly configService: SystemConfigService) {}

  // ── وضعیت فعال/غیرفعال خدمات صفحه اصلی (بنرهای طلای آب‌شده، شمش، زیورآلات) ──
  @Get('services')
  @ApiOperation({ summary: 'وضعیت فعال بودن خدمات اصلی اپلیکیشن' })
  async getServices() {
    const [meltedGold, goldIngot, jewelry] = await Promise.all([
      this.configService.getBoolean('service.melted_gold.enabled', true),
      this.configService.getBoolean('service.gold_ingot.enabled', true),
      this.configService.getBoolean('service.jewelry.enabled', true),
    ]);

    return {
      meltedGold: { enabled: meltedGold },
      goldIngot: { enabled: goldIngot },
      jewelry: { enabled: jewelry },
    };
  }
}
