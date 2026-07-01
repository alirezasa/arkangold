// api/src/market/market.module.ts

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MarketController } from './market.controller';
import { PriceService } from './price.service';
import { TradingService } from './trading.service';
import { PriceGateway } from './price.gateway';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(), // برای ارتباط PriceService ↔ PriceGateway بدون circular dependency
  ],
  controllers: [MarketController],
  providers: [PriceService, TradingService, PriceGateway],
  exports: [PriceService, TradingService],
})
export class MarketModule {}
