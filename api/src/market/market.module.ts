// api/src/market/market.module.ts

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MarketController } from './market.controller';
import { PriceService } from './price.service';
import { TradingService } from './trading.service';
import { PriceGateway } from './price.gateway';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(), // برای ارتباط PriceService ↔ PriceGateway بدون circular dependency
    AccountingModule, // ⬅️ جدید: تأمین AccountingService برای TradingService (Fail-fast حسابداری)
  ],
  controllers: [MarketController],
  providers: [PriceService, TradingService, PriceGateway],
  exports: [PriceService, TradingService],
})
export class MarketModule {}
