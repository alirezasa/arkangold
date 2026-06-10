import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { WithdrawalService } from './withdrawal.service';
import { WalletModule } from '../wallet/wallet.module';
import { ConfigModules } from '../config/config.module';
import { DepositService } from './deposit.service';

@Module({
  imports: [WalletModule, ConfigModules],
  controllers: [FinanceController],
  providers: [WithdrawalService, DepositService],
  exports: [WithdrawalService, DepositService],
})
export class FinanceModule {}
