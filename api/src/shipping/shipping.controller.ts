// api/src/shipping/shipping.controller.ts
// اپ کاربر: فهرست استان‌ها (فرم آدرس) و گزینه‌های ارسال سبد خرید برای آدرس انتخابی
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { ShippingService } from './shipping.service';
import { ShippingOptionsQueryDto } from './shipping.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Shipping')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('shipping')
export class ShippingController {
  constructor(private readonly service: ShippingService) {}

  @Get('provinces')
  @ApiOperation({ summary: 'فهرست استان‌ها و شهرهای پیشنهادی' })
  provinces() {
    return this.service.provinces();
  }

  @Get('options')
  @ApiOperation({ summary: 'روش‌ها و هزینه‌ی ارسال سبد خرید برای یک آدرس' })
  options(
    @Req() req: AuthenticatedRequest,
    @Query() query: ShippingOptionsQueryDto,
  ) {
    return this.service.optionsForCart(req.user.userId, query.addressId);
  }
}
