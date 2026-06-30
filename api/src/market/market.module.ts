// src/market/market.module.ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MarketController } from './market.controller';
import { PriceService } from './price.service';
import { TradingService } from './trading.service';
import { PriceGateway } from './price.gateway'; // اضافه شد

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [MarketController],
  providers: [PriceService, TradingService, PriceGateway], // PriceGateway اضافه شد
  exports: [PriceService, TradingService],
})
export class MarketModule {}
