import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { SmsModule } from '../integrations/services/sms.module';
import { TreasuryService } from './treasury.service';
import { BullionInventoryService } from './bullion-inventory.service';
import {
  BullionInventoryController,
  TreasuryAdminController,
} from './treasury-admin.controller';

@Module({
  imports: [AccountingModule, SmsModule],
  controllers: [TreasuryAdminController, BullionInventoryController],
  providers: [TreasuryService, BullionInventoryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
