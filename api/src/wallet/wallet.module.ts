import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { AccountingService } from './accounting.service';
import { ConfigModules } from '../config/config.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModules],
  controllers: [WalletController],
  providers: [WalletService, AccountingService],
  exports: [WalletService, AccountingService],
})
export class WalletModule {}
