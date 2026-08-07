import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ShopOrdersService } from './shop-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { Public } from '../auth/decorators/public.decorator';
import {
  CreateShopOrderDto,
  PayShopOrderDto,
  GetShopOrdersQueryDto,
} from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Shop Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('orders/shop')
export class ShopOrdersController {
  constructor(private readonly service: ShopOrdersService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'ثبت سفارش از روی سبد خرید' })
  checkout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateShopOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.checkout(req.user.userId, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'لیست سفارش‌های کاربر' })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetShopOrdersQueryDto,
  ) {
    return this.service.list(req.user.userId, query);
  }

  @Public()
  @Get('payment/callback/:provider')
  async gatewayCallback(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const providerKey = provider.toUpperCase() as 'ZARINPAL' | 'BEHPARDAKHT';
    const providerRef =
      providerKey === 'ZARINPAL' ? query['Authority'] : query['RefId'];

    const frontendUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
      const result = await this.service.handleGatewayCallback(
        providerKey,
        providerRef,
        query,
      );
      const redirectTo = result.success
        ? `${frontendUrl}/dashboard/shop/cart?paymentStatus=success&orderId=${result.orderId}`
        : `${frontendUrl}/dashboard/shop/cart?paymentStatus=failed&orderId=${result.orderId}`;
      res.redirect(redirectTo);
    } catch {
      res.redirect(`${frontendUrl}/dashboard/shop/cart?paymentStatus=error`);
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات سفارش' })
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.user.userId, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/pay')
  @ApiOperation({ summary: 'پرداخت سفارش' })
  pay(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: PayShopOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.pay(req.user.userId, id, dto, idempotencyKey);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'لغو سفارش توسط کاربر (فقط قبل از پرداخت)' })
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cancelByUser(req.user.userId, id);
  }
}
