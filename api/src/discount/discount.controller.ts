// api/src/discount/discount.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ValidateDiscountCodeDto } from '@arkan-gold/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { DiscountService } from './discount.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Discount Codes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('discount-codes')
export class DiscountController {
  constructor(private readonly service: DiscountService) {}

  @Get('mine')
  @ApiOperation({ summary: 'کدهای تخفیف اختصاصی فعال کاربر' })
  mine(@Req() req: AuthenticatedRequest) {
    return this.service.listForUser(req.user.userId);
  }

  // محدودیت نرخ برای جلوگیری از حدس زدن کدها
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('validate')
  @ApiOperation({
    summary: 'بررسی کد تخفیف روی سبد خرید فعلی و نمایش مبلغ نهایی',
  })
  validate(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ValidateDiscountCodeDto,
  ) {
    return this.service.previewForCart(req.user.userId, dto.code);
  }
}
