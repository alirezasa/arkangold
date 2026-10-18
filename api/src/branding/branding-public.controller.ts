// api/src/branding/branding-public.controller.ts
// لوگوی عمومی برای صفحات ورود و پنل‌ها (بدون احراز هویت؛ مهر و امضا اینجا منتشر نمی‌شوند)
import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BrandingService } from './branding.service';

@Controller('public/branding')
export class BrandingPublicController {
  constructor(private readonly service: BrandingService) {}

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
