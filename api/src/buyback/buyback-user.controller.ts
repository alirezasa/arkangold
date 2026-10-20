// api/src/buyback/buyback-user.controller.ts
//
// پنل کاربری: فروش شمش آرکان گلد به خود آرکان گلد (بازخرید)
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveUserGuard } from '../auth/guards/active-user.guard';
import { OwnedResource } from '../common/audit/owned-resource.decorator';
import { BuybackService } from './buyback.service';
import {
  CancelBuybackDto,
  CreateBuybackDto,
  RespondOfferDto,
} from './buyback.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Bullion Buyback - User Panel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveUserGuard)
@Controller('user/buyback')
export class BuybackUserController {
  constructor(private readonly buyback: BuybackService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'شمش‌های قابل فروش به آرکان گلد، برآورد قیمت، شرایط و درخواست‌های من',
  })
  overview(@Req() req: AuthenticatedRequest) {
    return this.buyback.userOverview(req.user.userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'ثبت درخواست فروش شمش به آرکان گلد' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateBuybackDto) {
    return this.buyback.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'درخواست‌های بازخرید من' })
  list(@Req() req: AuthenticatedRequest) {
    return this.buyback.listMine(req.user.userId);
  }

  @OwnedResource({ model: 'bullionBuybackRequest', ownerPath: 'userId' })
  @Get(':id')
  @ApiOperation({ summary: 'جزئیات و مراحل یک درخواست بازخرید' })
  getOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.buyback.getMine(req.user.userId, id);
  }

  @OwnedResource({ model: 'bullionBuybackRequest', ownerPath: 'userId' })
  @Post(':id/cancel')
  @ApiOperation({ summary: 'لغو درخواست بازخرید (فقط پیش از تحویل شمش)' })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBuybackDto,
  ) {
    return this.buyback.cancelByUser(req.user.userId, id, dto.reason);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @OwnedResource({ model: 'bullionBuybackRequest', ownerPath: 'userId' })
  @Post(':id/respond')
  @ApiOperation({ summary: 'پذیرش یا رد قیمت نهایی اعلام‌شده' })
  respond(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondOfferDto,
  ) {
    return this.buyback.respondToOffer(req.user.userId, id, dto.accept);
  }
}
