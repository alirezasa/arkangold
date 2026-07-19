import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletAdminController } from './wallet-admin.controller';
import { WalletAdminService } from './wallet-admin.service';

@Module({
  controllers: [WalletController, WalletAdminController],
  providers: [WalletService, WalletAdminService],
  exports: [WalletService],
})
export class WalletModule {}
