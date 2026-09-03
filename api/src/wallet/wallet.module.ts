import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletReceiptController } from './wallet-receipt.controller';
import { WalletService } from './wallet.service';
import {
  WalletAdminController,
  WalletAdjustmentController,
} from './wallet-admin.controller';
import { WalletAdminService } from './wallet-admin.service';
import { ProformaPdfService } from './proforma-pdf.service';
import { WalletReceiptService } from '././wallet-receipt.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    WalletController,
    WalletAdminController,
    WalletAdjustmentController,
    WalletReceiptController,
  ],
  providers: [
    WalletService,
    WalletAdminService,
    ProformaPdfService,
    WalletReceiptService,
  ],
  exports: [WalletService],
})
export class WalletModule {}
