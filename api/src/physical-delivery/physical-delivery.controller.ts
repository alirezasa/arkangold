import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PhysicalDeliveryService } from './physical-delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import {
  CreatePhysicalDeliveryDto,
  GetPhysicalDeliveriesQueryDto,
} from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Physical Delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('physical-deliveries')
export class PhysicalDeliveryController {
  constructor(private readonly service: PhysicalDeliveryService) {}

  @Get('config')
  @ApiOperation({ summary: 'تنظیمات و محدودیت‌های تحویل فیزیکی' })
  getConfig(@Req() req: AuthenticatedRequest) {
    return this.service.getConfig(req.user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'ثبت درخواست تحویل فیزیکی طلا' })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePhysicalDeliveryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.create(req.user.userId, dto, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'لیست درخواست‌های کاربر' })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetPhysicalDeliveriesQueryDto,
  ) {
    return this.service.list(req.user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک درخواست' })
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.user.userId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'لغو درخواست توسط کاربر (فقط قبل از تایید)' })
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cancelByUser(req.user.userId, id);
  }
}
