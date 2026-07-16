import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShopOrdersService } from './shop-orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ShipShopOrderDto,
  CancelShopOrderDto,
  GetShopOrdersQueryDto,
} from '@arkan-gold/shared';

// TODO: پشت AdminGuard اختصاصی قرار بگیرد
@ApiTags('Admin - Shop Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('admin/shop-orders')
export class ShopOrdersAdminController {
  constructor(private readonly service: ShopOrdersService) {}

  @Get()
  @ApiOperation({ summary: 'لیست همه سفارش‌های فروشگاهی' })
  list(@Query() query: GetShopOrdersQueryDto) {
    return this.service.adminList(query);
  }

  @Post(':id/process')
  @ApiOperation({ summary: 'شروع پردازش سفارش پرداخت‌شده' })
  process(@Param('id') id: string) {
    return this.service.process(id);
  }

  @Post(':id/ship')
  @ApiOperation({ summary: 'ثبت ارسال سفارش' })
  ship(@Param('id') id: string, @Body() dto: ShipShopOrderDto) {
    return this.service.ship(id, dto);
  }

  @Post(':id/deliver')
  @ApiOperation({ summary: 'ثبت تحویل نهایی سفارش' })
  deliver(@Param('id') id: string) {
    return this.service.deliver(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'لغو سفارش توسط ادمین' })
  cancel(@Param('id') id: string, @Body() dto: CancelShopOrderDto) {
    return this.service.adminCancel(id, dto);
  }
}
