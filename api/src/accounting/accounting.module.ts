import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingAdminService } from './accounting-admin.service';
import { AccountingAdminController } from './accounting-admin.controller';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingManageService } from './accounting-manage.service';
import { PartyLedgerService } from './party-ledger.service';
import { InventoryAccountingService } from './inventory-accounting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingAnalyticsService } from './accounting-analytics.service';
import { BankReconciliationService } from './bank-reconciliation.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountingAdminController],
  providers: [
    AccountingService,
    AccountingAdminService,
    AccountingReportsService,
    AccountingManageService,
    PartyLedgerService,
    InventoryAccountingService,
    AccountingAnalyticsService,
    BankReconciliationService,
  ],
  exports: [
    AccountingService,
    AccountingReportsService,
    PartyLedgerService,
    InventoryAccountingService,
  ],
})
export class AccountingModule {}
