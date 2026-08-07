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

const SANDBOX_BASE = 'https://sandbox.zarinpal.com/pg/v4/payment';
const PROD_BASE = 'https://api.zarinpal.com/pg/v4/payment';
const SANDBOX_START_PAY = 'https://sandbox.zarinpal.com/pg/StartPay';
const PROD_START_PAY = 'https://www.zarinpal.com/pg/StartPay';

// ---- تایپ‌های پاسخ API زرین‌پال ----
interface ZarinpalRequestResponse {
  data?: {
    code?: number;
    message?: string;
    authority?: string;
    fee_type?: string;
    fee?: number;
  };
  errors?: unknown;
}

interface ZarinpalVerifyResponse {
  data?: {
    code?: number;
    message?: string;
    ref_id?: number;
    card_pan?: string;
    card_hash?: string;
    fee_type?: string;
    fee?: number;
  };
  errors?: unknown;
}

interface ZarinpalReverseResponse {
  data?: {
    code?: number;
    message?: string;
  };
  errors?: unknown;
}

@Injectable()
export class ZarinpalGatewayService implements PaymentGatewayProvider {
  readonly key = 'ZARINPAL' as const;
  private readonly logger = new Logger(ZarinpalGatewayService.name);

  constructor(private readonly systemConfig: SystemConfigService) {}

  async isEnabled(): Promise<boolean> {
    return this.systemConfig.getBoolean('payment.zarinpal.enabled', false);
  }

  private async getConfig() {
    const [merchantId, sandbox] = await Promise.all([
      this.systemConfig.get('payment.zarinpal.merchant_id'),
      this.systemConfig.getBoolean('payment.zarinpal.sandbox', true),
    ]);
    if (!merchantId) {
      throw new Error('مرچنت آیدی زرین‌پال تنظیم نشده است');
    }
    return {
      merchantId,
      baseUrl: sandbox ? SANDBOX_BASE : PROD_BASE,
      startPayUrl: sandbox ? SANDBOX_START_PAY : PROD_START_PAY,
    };
  }

  // زرین‌پال مبلغ را به «تومان» می‌گیرد، سیستم داخلی ریال است
  private rialToToman(rial: string): number {
    return Math.round(Number(rial) / 10);
  }

  async requestPayment(
    params: PaymentRequestParams,
  ): Promise<PaymentRequestResult> {
    const { merchantId, baseUrl, startPayUrl } = await this.getConfig();

    const res = await axios.post<ZarinpalRequestResponse>(
      `${baseUrl}/request.json`,
      {
        merchant_id: merchantId,
        amount: this.rialToToman(params.amountRial),
        description: params.description,
        callback_url: params.callbackUrl,
        metadata: { order_id: params.orderId },
      },
    );

    const data = res.data?.data;
    if (!data?.authority || data?.code !== 100) {
      this.logger.error(
        `[Zarinpal] خطا در ایجاد تراکنش: ${JSON.stringify(res.data)}`,
      );
      throw new Error('خطا در اتصال به درگاه زرین‌پال');
    }

    return {
      redirectUrl: `${startPayUrl}/${data.authority}`,
      providerRef: data.authority,
    };
  }

  async verifyPayment(
    params: PaymentVerifyParams,
  ): Promise<PaymentVerifyResult> {
    const { merchantId, baseUrl } = await this.getConfig();
    const status = params.callbackQuery['Status'];

    if (status !== 'OK') {
      return {
        success: false,
        failureReason: 'کاربر پرداخت را لغو کرد',
        rawResponse: params.callbackQuery,
      };
    }

    const res = await axios.post<ZarinpalVerifyResponse>(
      `${baseUrl}/verify.json`,
      {
        merchant_id: merchantId,
        amount: this.rialToToman(params.amountRial),
        authority: params.providerRef,
      },
    );

    const data = res.data?.data;
    const success = data?.code === 100 || data?.code === 101; // 101 = قبلاً تایید شده (idempotent)

    return {
      success,
      trackingCode: data?.ref_id ? String(data.ref_id) : undefined,
      failureReason: success ? undefined : `کد خطا: ${data?.code}`,
      rawResponse: res.data,
    };
  }

  async refundPayment(
    params: PaymentRefundParams,
  ): Promise<PaymentRefundResult> {
    const { merchantId, baseUrl } = await this.getConfig();
    try {
      const res = await axios.post<ZarinpalReverseResponse>(
        `${baseUrl}/reverse.json`,
        {
          merchant_id: merchantId,
          authority: params.providerRef,
        },
      );
      return { success: res.data?.data?.code === 100, rawResponse: res.data };
    } catch (err) {
      this.logger.error('[Zarinpal] خطا در استرداد وجه', err);
      return { success: false, rawResponse: err };
    }
  }
}
