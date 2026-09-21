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
  async gatewayCallbackGet(
    @Param('provider') provider: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    await this.handleGatewayCallback(provider, query, res);
  }

  // درگاه به‌پرداخت ملت callback را با POST (application/x-www-form-urlencoded)
  // ارسال می‌کند، نه GET — زرین‌پال با GET کار می‌کند، پس هر دو متد را پشتیبانی می‌کنیم.
  @Public()
  @Post('payment/callback/:provider')
  async gatewayCallbackPost(
    @Param('provider') provider: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ) {
    await this.handleGatewayCallback(provider, body, res);
  }

  // صفحه واسط: درگاه ملت GET را قبول نمی‌کند و فقط با POST فرمی حاوی RefId کار می‌کند؛
  // چون فرانت با یک ریدایرکت ساده (window.location.href) به redirectUrl عمل می‌کند،
  // این صفحه فرم لازم را می‌سازد و خودش را خودکار submit می‌کند.
  @Public()
  @Get('payment/redirect/behpardakht/:refId')
  redirectToBehpardakht(@Param('refId') refId: string, @Res() res: Response) {
    const safeRefId = refId.replace(/[^a-zA-Z0-9]/g, '');
    res.type('html').send(`<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8" /><title>انتقال به درگاه پرداخت</title></head>
<body onload="document.forms[0].submit()">
  <form action="https://bpm.shaparak.ir/pgwchannel/startpay.mellat" method="POST">
    <input type="hidden" name="RefId" value="${safeRefId}" />
    <noscript><button type="submit">ادامه به درگاه پرداخت</button></noscript>
  </form>
  <p>در حال انتقال به درگاه پرداخت ملت...</p>
</body></html>`);
  }

  private async handleGatewayCallback(
    provider: string,
    query: Record<string, string>,
    res: Response,
  ) {
    const providerKey = provider.toUpperCase() as 'ZARINPAL' | 'BEHPARDAKHT';
    const providerRef =
      providerKey === 'ZARINPAL' ? query['Authority'] : query['RefId'];

    const frontendUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://arkan.gold'
        : 'http://localhost:3000');

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
