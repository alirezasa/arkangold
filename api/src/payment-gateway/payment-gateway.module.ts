import { Module } from '@nestjs/common';
import { ZarinpalGatewayService } from './zarinpal-gateway.service';
import { BehPardakhtGatewayService } from './behpardakht-gateway.service';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { PaymentGatewayController } from './payment-gateway.controller';

@Module({
  controllers: [PaymentGatewayController],
  providers: [
    ZarinpalGatewayService,
    BehPardakhtGatewayService,
    PaymentGatewayFactory,
  ],
  exports: [PaymentGatewayFactory],
})
export class PaymentGatewayModule {}
