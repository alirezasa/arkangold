import { Injectable, Logger } from '@nestjs/common';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  PaymentGatewayProvider,
  PaymentRequestResult,
  PaymentVerifyParams,
  PaymentVerifyResult,
  PaymentRefundResult,
} from './interfaces/payment-gateway-provider.interface';

@Injectable()
export class BehPardakhtGatewayService implements PaymentGatewayProvider {
  readonly key = 'BEHPARDAKHT' as const;
  private readonly logger = new Logger(BehPardakhtGatewayService.name);

  constructor(private readonly systemConfig: SystemConfigService) {}

  async isEnabled(): Promise<boolean> {
    return this.systemConfig.getBoolean('payment.behpardakht.enabled', false);
  }

  private async getConfig() {
    const [terminalId, username, password] = await Promise.all([
      this.systemConfig.get('payment.behpardakht.terminal_id'),
      this.systemConfig.get('payment.behpardakht.username'),
      this.systemConfig.get('payment.behpardakht.password'),
    ]);

    if (!terminalId || !username || !password) {
      throw new Error('تنظیمات به‌پرداخت ملت کامل نیست');
    }

    return { terminalId, username, password };
  }

  private rialAmount(rial: string): number {
    return Math.round(Number(rial));
  }

  async requestPayment(): Promise<PaymentRequestResult> {
    await this.getConfig();

    // TODO: جایگزینی با فراخوانی واقعی SOAP bpPayRequest
    // const orderId = Date.now();
    // const [resCode, refId] = result.return.split(',');
    // if (resCode !== '0') throw new Error(`خطای به‌پرداخت: ${resCode}`);

    throw new Error(
      'اتصال SOAP به‌پرداخت ملت هنوز پیکربندی نشده - WSDL و اعتبارنامه را در system-config تنظیم و این متد را تکمیل کنید',
    );
  }

  verifyPayment(params: PaymentVerifyParams): Promise<PaymentVerifyResult> {
    const resCode = params.callbackQuery['ResCode'];
    const refId = params.callbackQuery['RefId'];
    const saleReferenceId = params.callbackQuery['SaleReferenceId'];

    if (resCode !== '0') {
      return Promise.resolve({
        success: false,
        failureReason: `کد خطای بانک: ${resCode}`,
        rawResponse: params.callbackQuery,
      });
    }

    // TODO: فراخوانی واقعی bpVerifyRequest سپس bpSettleRequest
    this.logger.warn(
      '[BehPardakht] verify+settle هنوز پیاده‌سازی نشده - placeholder',
    );

    return Promise.resolve({
      success: false,
      failureReason: 'پیاده‌سازی verify/settle به‌پرداخت تکمیل نشده',
      rawResponse: { refId, saleReferenceId },
    });
  }

  refundPayment(): Promise<PaymentRefundResult> {
    // TODO: bpReversalRequest
    return Promise.resolve({ success: false, rawResponse: null });
  }
}
