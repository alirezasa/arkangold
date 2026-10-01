// api/src/catalog/public-gold-ingot.controller.ts
//
// لیست و جزئیات عمومی شمش‌های طلا — بدون نیاز به لاگین، برای صفحه اصلی
// arkan.gold (مستندات: docs/public-api/gold-ingots.md).
// پارامترهای کوئری تک‌تک خوانده می‌شوند تا پارامترهای اضافه‌ی سایت
// (مثل utm یا cache-buster) با forbidNonWhitelisted خطای ۴۰۰ ندهند.
import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  PUBLIC_GOLD_INGOT_MAX_LIMIT,
  PublicGoldIngotService,
} from './public-gold-ingot.service';

const CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60';

function toBoundedInt(
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

@ApiTags('Public - Gold Ingots')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('public/gold-ingots')
export class PublicGoldIngotController {
  constructor(private readonly service: PublicGoldIngotService) {}

  @Get()
  @Header('Cache-Control', CACHE_CONTROL)
  @ApiOperation({
    summary: 'لیست عمومی شمش‌های طلا (با تصاویر، قیمت لحظه‌ای و لینک خرید)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: `حداکثر ${PUBLIC_GOLD_INGOT_MAX_LIMIT}`,
  })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('inStock') inStock?: string,
  ) {
    return this.service.list({
      page: toBoundedInt(page, 1, 1000),
      limit: toBoundedInt(limit, 20, PUBLIC_GOLD_INGOT_MAX_LIMIT),
      inStock: inStock === 'true' || inStock === '1',
    });
  }

  @Get(':slug')
  @Header('Cache-Control', CACHE_CONTROL)
  @ApiOperation({ summary: 'جزئیات عمومی یک شمش طلا' })
  getOne(@Param('slug') slug: string) {
    return this.service.getBySlug(slug);
  }
}
