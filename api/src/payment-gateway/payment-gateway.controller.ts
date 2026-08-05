import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentGatewayFactory } from './payment-gateway.factory';

@Controller('payment-gateways')
export class PaymentGatewayController {
  constructor(private readonly factory: PaymentGatewayFactory) {}

  @Public()
  @Get('active')
  listActive() {
    return this.factory.listActive();
  }
}
