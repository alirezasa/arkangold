// api/src/market/market.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PriceService } from './price.service';
import { TradingService } from './trading.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { IsString, IsIn, IsNumber, Min } from 'class-validator';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

// ── DTOهای validation - هرگز body خام را بدون validation قبول نکن ──
class LockPriceDto {
  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @IsNumber()
  @Min(0.0001)
  amountGrams!: number;
}

class CreateOrderDto {
  @IsString()
  lockId!: string;
}

@ApiTags('Market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('market')
export class MarketController {
  constructor(
    private readonly priceService: PriceService,
    private readonly tradingService: TradingService,
  ) {}

  @Public()
  @Get('price')
  @ApiOperation({ summary: 'قیمت لحظه‌ای طلا' })
  getPrice() {
    return this.priceService.getGoldPriceResponse();
  }

  @Public()
  @Get('price/history')
  @ApiOperation({ summary: 'تاریخچه قیمت برای نمودار' })
  @ApiQuery({ name: 'hours', required: false, type: Number })
  getPriceHistory(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ) {
    // محدود کردن بازه برای جلوگیری از abuse (حداکثر 30 روز)
    const safeHours = Math.min(Math.max(hours, 1), 720);
    return this.priceService.getPriceHistory(safeHours);
  }

  // ── Rate limit سخت‌گیرانه روی lock-price: جلوگیری از spam قفل کردن ──
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('lock-price')
  @ApiOperation({ summary: 'قفل قیمت برای مدت محدود قبل از ثبت سفارش' })
  lockPrice(@Req() req: AuthenticatedRequest, @Body() body: LockPriceDto) {
    return this.tradingService.lockPrice(
      req.user.userId,
      body.side,
      body.amountGrams,
    );
  }

  // ── Rate limit روی ثبت سفارش - حیاتی برای جلوگیری از سوءاستفاده ──
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('orders')
  @ApiOperation({ summary: 'ثبت سفارش خرید/فروش طلا' })
  createOrder(@Req() req: AuthenticatedRequest, @Body() body: CreateOrderDto) {
    return this.tradingService.createOrder(req.user.userId, body.lockId);
  }

  @Get('orders')
  @ApiOperation({ summary: 'تاریخچه سفارشات کاربر' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserOrders(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tradingService.getUserOrders(req.user.userId, page, limit);
  }
}
