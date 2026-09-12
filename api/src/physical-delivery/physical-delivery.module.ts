import { Module } from '@nestjs/common';
import { PhysicalDeliveryController } from './physical-delivery.controller';
import { PhysicalDeliveryAdminController } from './physical-delivery-admin.controller';
import { PhysicalDeliveryService } from './physical-delivery.service';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [AccountingModule, InvoiceModule],
  controllers: [PhysicalDeliveryController, PhysicalDeliveryAdminController],
  providers: [PhysicalDeliveryService],
  exports: [PhysicalDeliveryService],
})
export class PhysicalDeliveryModule {}
