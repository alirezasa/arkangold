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
import { OwnedResource } from '../common/audit/owned-resource.decorator';
import { AuditService } from '../common/audit/audit.service';
import { getBusinessRuleViolation } from '../common/audit/business-rule.util';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Shop Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('orders/shop')
export class ShopOrdersController {
  constructor(
    private readonly service: ShopOrdersService,
    private readonly auditService: AuditService,
  ) {}

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
    @Req() req: Request,
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
    } catch (err) {
      // این مسیر خطا را خودش مدیریت می‌کند و به AllExceptionsFilter نمی‌رسد؛
      // بازپخش (replay) callback پرداخت به‌صورت صریح ثبت می‌شود (FAU_GEN_EXT.1.7)
      const rule = getBusinessRuleViolation(err);
      if (rule) {
        void this.auditService.logUser({
          userId: null,
          action: 'security.business_rule_violation',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          source: 'ShopOrdersController.gatewayCallback',
          success: false,
          newValue: { rule, provider: providerKey },
        });
      }
      res.redirect(`${frontendUrl}/dashboard/shop/cart?paymentStatus=error`);
    }
  }

  @OwnedResource({ model: 'shopOrder', ownerPath: 'userId' })
  @Get(':id')
  @ApiOperation({ summary: 'جزئیات سفارش' })
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.user.userId, id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @OwnedResource({ model: 'shopOrder', ownerPath: 'userId' })
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

  @OwnedResource({ model: 'shopOrder', ownerPath: 'userId' })
  @Post(':id/cancel')
  @ApiOperation({ summary: 'لغو سفارش توسط کاربر (فقط قبل از پرداخت)' })
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cancelByUser(req.user.userId, id);
  }
}
