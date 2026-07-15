import { Module } from '@nestjs/common';
import { PhysicalDeliveryController } from './physical-delivery.controller';
import { PhysicalDeliveryAdminController } from './physical-delivery-admin.controller';
import { PhysicalDeliveryService } from './physical-delivery.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [PhysicalDeliveryController, PhysicalDeliveryAdminController],
  providers: [PhysicalDeliveryService],
  exports: [PhysicalDeliveryService],
})
export class PhysicalDeliveryModule {}
