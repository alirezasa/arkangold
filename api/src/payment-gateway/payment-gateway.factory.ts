import { Injectable, BadRequestException } from '@nestjs/common';
import { ZarinpalGatewayService } from './zarinpal-gateway.service';
import { BehPardakhtGatewayService } from './behpardakht-gateway.service';
import { PaymentGatewayProvider } from './interfaces/payment-gateway-provider.interface';

export type GatewayProviderKey = 'ZARINPAL' | 'BEHPARDAKHT';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly zarinpal: ZarinpalGatewayService,
    private readonly behpardakht: BehPardakhtGatewayService,
  ) {}

  get(key: GatewayProviderKey): PaymentGatewayProvider {
    if (key === 'ZARINPAL') return this.zarinpal;
    if (key === 'BEHPARDAKHT') return this.behpardakht;
    throw new BadRequestException('درگاه پرداخت نامعتبر است');
  }

  async listActive(): Promise<{ key: GatewayProviderKey; label: string }[]> {
    const result: { key: GatewayProviderKey; label: string }[] = [];
    if (await this.zarinpal.isEnabled())
      result.push({ key: 'ZARINPAL', label: 'زرین‌پال' });
    if (await this.behpardakht.isEnabled())
      result.push({ key: 'BEHPARDAKHT', label: 'به‌پرداخت ملت' });
    return result;
  }
}
