// api/src/deposit/deposit.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { DepositService } from './deposit.service';
import { DepositAdminService } from './deposit-admin.service';
import { DepositTrackingService } from './deposit-tracking.service';
import { DepositController } from './deposit.controller';
import { DepositAdminController } from './deposit-admin.controller';
import { DepositExpiryCron } from './deposit-expiry.cron';

@Module({
  imports: [PrismaModule, SystemConfigModule, AccountingModule, InvoiceModule],
  controllers: [DepositController, DepositAdminController],
  providers: [
    DepositService,
    DepositAdminService,
    DepositTrackingService,
    DepositExpiryCron,
  ],
  exports: [DepositService],
})
export class DepositModule {}
