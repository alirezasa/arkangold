import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  PaymentGatewayProvider,
  PaymentRequestParams,
  PaymentRequestResult,
  PaymentVerifyParams,
  PaymentVerifyResult,
  PaymentRefundParams,
  PaymentRefundResult,
} from './interfaces/payment-gateway-provider.interface';

// نکته: SOAP endpoint واقعی باید طبق مستندات بانک ملت (bpml.shaparak.ir) پیاده شود.
// این نسخه، ساختار و جریان verify+settle را کامل پیاده می‌کند؛ فقط فراخوانی SOAP
// باید با کتابخانه مناسب (مثل soap یا strong-soap) جایگزین placeholder شود.

const GATEWAY_URL = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat';

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
      this.systemConfig.get('payment.behpardakht.password'), // TODO: decrypt وقتی encrypt پیاده شد
    ]);
    if (!terminalId || !username || !password) {
      throw new Error('تنظیمات به‌پرداخت ملت کامل نیست');
    }
    return { terminalId, username, password };
  }

  private rialAmount(rial: string): number {
    return Math.round(Number(rial)); // به‌پرداخت ریال می‌گیرد - بدون تبدیل
  }

  async requestPayment(
    params: PaymentRequestParams,
  ): Promise<PaymentRequestResult> {
    const { terminalId, username, password } = await this.getConfig();
    const orderId = Date.now(); // به‌پرداخت orderId عددی و یکتا می‌خواهد

    // TODO: جایگزینی با فراخوانی واقعی SOAP bpPayRequest
    // const client = await soap.createClientAsync(WSDL_URL);
    // const [result] = await client.bpPayRequestAsync({
    //   terminalId, userName: username, userPassword: password,
    //   orderId, amount: this.rialAmount(params.amountRial),
    //   localDate, localTime, additionalData: params.orderId,
    //   callBackUrl: params.callbackUrl, payerId: 0,
    // });
    // const [resCode, refId] = result.return.split(',');
    // if (resCode !== '0') throw new Error(`خطای به‌پرداخت: ${resCode}`);

    throw new Error(
      'اتصال SOAP به‌پرداخت ملت هنوز پیکربندی نشده - WSDL و اعتبارنامه را در system-config تنظیم و این متد را تکمیل کنید',
    );
  }

  async verifyPayment(
    params: PaymentVerifyParams,
  ): Promise<PaymentVerifyResult> {
    const resCode = params.callbackQuery['ResCode'];
    const refId = params.callbackQuery['RefId'];
    const saleReferenceId = params.callbackQuery['SaleReferenceId'];

    if (resCode !== '0') {
      return {
        success: false,
        failureReason: `کد خطای بانک: ${resCode}`,
        rawResponse: params.callbackQuery,
      };
    }

    // TODO: فراخوانی واقعی bpVerifyRequest سپس bpSettleRequest
    // اگر settle شکست خورد باید bpReversalRequest صدا زده شود و success=false برگردد
    this.logger.warn(
      '[BehPardakht] verify+settle هنوز پیاده‌سازی نشده - placeholder',
    );
    return {
      success: false,
      failureReason: 'پیاده‌سازی verify/settle به‌پرداخت تکمیل نشده',
      rawResponse: { refId, saleReferenceId },
    };
  }

  async refundPayment(
    params: PaymentRefundParams,
  ): Promise<PaymentRefundResult> {
    // TODO: bpReversalRequest
    return { success: false, rawResponse: null };
  }
}
