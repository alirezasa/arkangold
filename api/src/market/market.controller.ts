import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { PriceService } from './price.service';
import { TradingService } from './trading.service';

import { LockPriceDto } from '@arkan-gold/shared/dto/market/lock-price.dto';
import { CreateOrderDto } from '@arkan-gold/shared/dto/market/create-order.dto';
import { GetOrdersQueryDto } from '@arkan-gold/shared/dto/market/get-orders-query.dto';
import { GetPriceHistoryQueryDto } from '@arkan-gold/shared/dto/market/get-price-history-query.dto';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    phone: string;
    sessionId: string;
  };
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
  @ApiOperation({ summary: 'Get current gold price' })
  async getPrice() {
    return this.priceService.getGoldPriceResponse();
  }

  @Public()
  @Get('price/history')
  @ApiOperation({ summary: 'Get gold price history' })
  @ApiQuery({ name: 'hours', required: false, type: Number })
  async getPriceHistory(@Query() query: GetPriceHistoryQueryDto) {
    return this.priceService.getPriceHistory(query.hours);
  }

  @Post('lock-price')
  @ApiOperation({ summary: 'Lock current trade price for user order' })
  async lockPrice(@Req() req: AuthenticatedRequest, @Body() dto: LockPriceDto) {
    return this.tradingService.lockPrice(
      req.user.userId,
      dto.side,
      dto.amountGrams,
    );
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create market order from a valid price lock' })
  async createOrder(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateOrderDto,
  ) {
    return this.tradingService.createOrder(req.user.userId, dto.lockId);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Get user market orders' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserOrders(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOrdersQueryDto,
  ) {
    return this.tradingService.getUserOrders(
      req.user.userId,
      query.page,
      query.limit,
    );
  }
}
