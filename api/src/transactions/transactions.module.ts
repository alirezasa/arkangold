import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsAdminService } from './transactions-admin.service';
import { TransactionsAdminController } from './transactions-admin.controller';

@Module({
  controllers: [TransactionsController, TransactionsAdminController],
  providers: [TransactionsService, TransactionsAdminService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
