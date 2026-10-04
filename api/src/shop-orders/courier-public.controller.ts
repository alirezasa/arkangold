// api/src/shop-orders/courier-public.controller.ts
//
// لینک ثبت تحویل پیک — بدون نیاز به ورود. امنیت: توکن تصادفی ۱۹۲ بیتی که فقط در پیامک
// پیک است (در دیتابیس فقط hash آن)، انقضای ۱۴ روزه، بی‌اثر شدن پس از تحویل، سقف ۵ تلاش
// برای کد تحویل و محدودیت نرخ درخواست.
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ShopOrderFulfillmentService } from './shop-order-fulfillment.service';

class CourierConfirmDto {
  @IsString()
  @Matches(/^[0-9۰-۹]{4,8}$/, { message: 'کد تحویل نامعتبر است' })
  code!: string;
  @IsOptional() @IsString() @MaxLength(80) receivedByName?: string;
}

@Controller('public/delivery')
export class CourierPublicController {
  constructor(private readonly fulfillment: ShopOrderFulfillmentService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  info(@Param('token') token: string) {
    return this.fulfillment.courierInfo(token);
  }

  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post(':token/confirm')
  confirm(@Param('token') token: string, @Body() dto: CourierConfirmDto) {
    return this.fulfillment.courierConfirm(token, dto.code, dto.receivedByName);
  }
}
