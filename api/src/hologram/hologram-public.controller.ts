// api/src/hologram/hologram-public.controller.ts
//
// استعلام عمومی اصالت‌سنجی — بدون نیاز به لاگین، قابل فراخوانی هم از arkan.gold
// و هم از app.arkan.gold (بند ۴.۱). محدودیت نرخ سخت‌گیرانه علاوه بر throttler
// سراسری پروژه اعمال می‌شود؛ چون محدودیت واقعی (بلوک IP + شمارش تلاش نامعتبر)
// باید per-IP و پایدار (نه فقط per-route) باشد، این منطق در HologramSecurityService
// پیاده شده، نه صرفاً با دکوراتور Throttle.
import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { HologramService } from './hologram.service';
import { HologramSecurityService } from './hologram-security.service';
import { extractClientIp } from './hologram-ip.util';
import {
  HologramInquiryChannel,
  VerifyHologramCodeDto,
} from '@arkan-gold/shared';

@ApiTags('Hologram - Public Verification')
@Controller('public/hologram')
export class HologramPublicController {
  constructor(
    private readonly hologramService: HologramService,
    private readonly security: HologramSecurityService,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  @ApiOperation({
    summary: 'استعلام عمومی اصالت شمش با کد هولوگرام (بدون نیاز به لاگین)',
  })
  async verify(@Req() req: Request, @Body() dto: VerifyHologramCodeDto) {
    const ipAddress = extractClientIp(req);
    await this.security.assertAllowed(ipAddress);

    return this.hologramService.verify(dto.code, {
      ipAddress,
      userAgent: req.headers['user-agent'],
      channel: HologramInquiryChannel.PUBLIC_WEB,
      // کد ملی مالک برای استعلام عمومی و بدون احراز هویت همیشه ماسک نمایش داده
      // می‌شود (پاسخ به سؤال باز ۷.۱ سند معماری با اتخاذ رویکرد محافظه‌کارانه‌تر
      // که خود سند هم به‌صراحت توصیه کرده بود؛ نسخه کامل فقط در پنل کاربری
      // لاگین‌شده در دسترس است، ر.ک. HologramUserController.verify).
      maskNationalCodeInResponse: true,
    });
  }
}
