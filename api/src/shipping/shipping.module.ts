import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShippingAdminController } from './shipping-admin.controller';

@Module({
  controllers: [ShippingController, ShippingAdminController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
