// api/src/branding/branding-public.controller.ts
// لوگوی عمومی برای صفحات ورود و پنل‌ها (بدون احراز هویت؛ مهر و امضا اینجا منتشر نمی‌شوند)
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BrandingService } from './branding.service';
import { AppearanceService } from './appearance.service';

@Controller('public/branding')
export class BrandingPublicController {
  constructor(
    private readonly service: BrandingService,
    private readonly appearance: AppearanceService,
  ) {}

  /** رنگ‌ها و فونت سیستم به‌صورت CSS آماده (اپلیکیشن، پنل مدیریت و پنل نمایندگان) */
  @Get('theme')
  async theme(@Res() res: Response) {
    const theme = await this.appearance.getPublicTheme();
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.json(theme);
  }

  /** فایل فونت سفارشی (regular | bold) */
  @Get('font/:slot')
  async font(@Param('slot') slot: string, @Res() res: Response) {
    if (!AppearanceService.isSlot(slot)) {
      throw new BadRequestException('وزن فونت نامعتبر است');
    }
    const file = await this.appearance.readFont(slot);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(file.buffer);
  }

  @Get('logo')
  async logo(@Res() res: Response) {
    const file = await this.service.getPublicLogo();
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
    );
    res.send(file.buffer);
  }
}
