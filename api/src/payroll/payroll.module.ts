import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollAdminController } from './payroll-admin.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [AccountingModule, MarketModule],
  controllers: [PayrollAdminController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
