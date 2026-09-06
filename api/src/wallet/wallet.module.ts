import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import {
  WalletAdminController,
  WalletAdjustmentController,
} from './wallet-admin.controller';
import { WalletAdminService } from './wallet-admin.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    WalletController,
    WalletAdminController,
    WalletAdjustmentController,
  ],
  providers: [WalletService, WalletAdminService],
  exports: [WalletService],
})
export class WalletModule {}
