import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PhysicalDeliveryService } from './physical-delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ShipPhysicalDeliveryDto,
  PhysicalDeliveryAdminNoteDto,
  GetPhysicalDeliveriesQueryDto,
} from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

// TODO: بعد از پیاده‌سازی نقش‌های ادمین، پشت AdminGuard اختصاصی قرار بگیرد
@ApiTags('Admin - Physical Delivery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('admin/physical-deliveries')
export class PhysicalDeliveryAdminController {
  constructor(private readonly service: PhysicalDeliveryService) {}

  @Get()
  @ApiOperation({ summary: 'لیست همه درخواست‌های تحویل فیزیکی' })
  list(@Query() query: GetPhysicalDeliveriesQueryDto) {
    return this.service.adminList(query);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'تایید درخواست' })
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.approve(req.user.userId, id);
  }

  @Post(':id/ship')
  @ApiOperation({ summary: 'ثبت ارسال مرسوله' })
  ship(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ShipPhysicalDeliveryDto,
  ) {
    return this.service.ship(req.user.userId, id, dto);
  }

  @Post(':id/deliver')
  @ApiOperation({ summary: 'ثبت تحویل نهایی' })
  deliver(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.deliver(req.user.userId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'لغو درخواست توسط ادمین' })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: PhysicalDeliveryAdminNoteDto,
  ) {
    return this.service.adminCancel(req.user.userId, id, dto.reason);
  }
}
