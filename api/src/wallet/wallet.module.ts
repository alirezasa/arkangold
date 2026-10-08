import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import {
  WalletAdminController,
  WalletAdjustmentController,
} from './wallet-admin.controller';
import { WalletAdminService } from './wallet-admin.service';
import { AccountingModule } from '../accounting/accounting.module';
import { DepositModule } from '../deposit/deposit.module';

@Module({
  imports: [AccountingModule, DepositModule],
  controllers: [
    WalletController,
    WalletAdminController,
    WalletAdjustmentController,
  ],
  providers: [WalletService, WalletAdminService],
  exports: [WalletService],
})
export class WalletModule {}
