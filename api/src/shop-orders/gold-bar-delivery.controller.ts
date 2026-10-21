// api/src/shop-orders/gold-bar-delivery.controller.ts
// تحویل فیزیکی طلای آب‌شده = خرید شمش موجود فروشگاه با کیف طلایی (+ مابه‌التفاوت)
import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import {
  GatewayProviderKey,
  GoldBarDeliveryService,
} from './gold-bar-delivery.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

class GoldBarQuoteDto {
  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsBoolean()
  useExtraGold?: boolean;

  @IsOptional()
  @IsBoolean()
  useRialWallet?: boolean;

  // آدرس و روش ارسال (اختیاری) — برای نمایش گزینه‌ها و لحاظ هزینه‌ی ارسال در پیش‌فاکتور
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @IsOptional()
  @IsUUID()
  shippingMethodId?: string;

  @IsOptional()
  @IsIn(['PREPAID', 'ON_DELIVERY'])
  shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
}

class GoldBarOrderDto {
  @IsUUID()
  quoteId!: string;

  @IsUUID()
  addressId!: string;

  @IsBoolean()
  useExtraGold!: boolean;

  @IsBoolean()
  useRialWallet!: boolean;

  @IsOptional()
  @IsIn(['ZARINPAL', 'BEHPARDAKHT'])
  gatewayProvider?: GatewayProviderKey;

  @IsOptional()
  @IsUUID()
  shippingMethodId?: string;

  @IsOptional()
  @IsIn(['PREPAID', 'ON_DELIVERY'])
  shippingFeePayment?: 'PREPAID' | 'ON_DELIVERY';
}

@ApiTags('Gold Delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('gold-delivery')
export class GoldBarDeliveryController {
  constructor(private readonly service: GoldBarDeliveryService) {}

  @Get('bars')
  @ApiOperation({
    summary: 'شمش‌های قابل انتخاب برای تحویل فیزیکی و محاسبه‌ی مابه‌التفاوت',
  })
  bars(@Req() req: AuthenticatedRequest) {
    return this.service.listBars(req.user.userId);
  }

  @Get('orders')
  @ApiOperation({ summary: 'سفارش‌های شمش ثبت‌شده با طلای آب‌شده' })
  orders(@Req() req: AuthenticatedRequest) {
    return this.service.listOrders(req.user.userId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('quote')
  @ApiOperation({ summary: 'قفل قیمت شمش انتخابی و برآورد پرداخت' })
  quote(@Req() req: AuthenticatedRequest, @Body() dto: GoldBarQuoteDto) {
    return this.service.quote(req.user.userId, dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('order')
  @ApiOperation({ summary: 'ثبت تحویل فیزیکی (خرید شمش با کیف طلایی)' })
  order(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GoldBarOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.order(req.user.userId, dto, idempotencyKey);
  }
}
