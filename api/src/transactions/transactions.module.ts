import { Module } from '@nestjs/common';
import { InvoiceModule } from '../invoice/invoice.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsAdminService } from './transactions-admin.service';
import { TransactionsAdminController } from './transactions-admin.controller';

@Module({
  imports: [InvoiceModule],
  controllers: [TransactionsController, TransactionsAdminController],
  providers: [TransactionsService, TransactionsAdminService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
