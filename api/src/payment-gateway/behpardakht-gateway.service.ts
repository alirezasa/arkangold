import { Injectable, Logger } from '@nestjs/common';
import * as soap from 'soap';
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

// مستندات: «راهنمای اتصال به درگاه پرداخت به‌پرداخت ملت» (PGW) — این WSDL و اسامی
// عملیات (bpPayRequest/bpVerifyRequest/bpSettleRequest/bpReversalRequest) سال‌هاست
// ثابت مانده و در اکثر پیاده‌سازی‌های متن‌باز فارسی هم به همین شکل است، اما چون امکان
// تست واقعی روی سندباکس بانک ملت در این محیط وجود ندارد، پیش از فعال‌سازی در
// production حتماً باید با ترمینال آزمایشی تست شود.
const WSDL_URL = 'https://bpm.shaparak.ir/pgwchannel/services/pgw?wsdl';

// resCode های موفق/idempotent مستندسازی‌شده در راهنمای ملت
const SETTLE_ALREADY_DONE = '45';

interface BpPayRequestResponse {
  return?: string; // "<resCode>,<refId>"
}
interface BpSingleCodeResponse {
  return?: string; // "<resCode>"
}

interface BehPardakhtSoapClient extends soap.Client {
  bpPayRequestAsync(args: {
    terminalId: number;
    userName: string;
    userPassword: string;
    orderId: number;
    amount: number;
    localDate: string;
    localTime: string;
    additionalData: string;
    callBackUrl: string;
    payerId: number;
  }): Promise<[BpPayRequestResponse]>;
  bpVerifyRequestAsync(args: {
    terminalId: number;
    userName: string;
    userPassword: string;
    orderId: number;
    saleOrderId: number;
    saleReferenceId: number;
  }): Promise<[BpSingleCodeResponse]>;
  bpSettleRequestAsync(args: {
    terminalId: number;
    userName: string;
    userPassword: string;
    orderId: number;
    saleOrderId: number;
    saleReferenceId: number;
  }): Promise<[BpSingleCodeResponse]>;
}

@Injectable()
export class BehPardakhtGatewayService implements PaymentGatewayProvider {
  readonly key = 'BEHPARDAKHT' as const;
  private readonly logger = new Logger(BehPardakhtGatewayService.name);
  private clientPromise: Promise<BehPardakhtSoapClient> | null = null;

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

    return { terminalId: Number(terminalId), username, password };
  }

  private async getClient(): Promise<BehPardakhtSoapClient> {
    if (this.clientPromise === null) {
      this.clientPromise = soap.createClientAsync(
        WSDL_URL,
      ) as Promise<BehPardakhtSoapClient>;
    }
    return this.clientPromise;
  }

  private rialAmount(rial: string): number {
    return Math.round(Number(rial));
  }

  private nowLocalDateTime(): { localDate: string; localTime: string } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      localDate: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      localTime: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    };
  }

  // orderId در پروتکل ملت باید عددی باشد؛ شناسه UUID سفارش داخلی ما رشته‌ای است،
  // پس یک orderId عددی یکتا (بر پایه زمان) می‌سازیم — نیازی به بازگشت به UUID نیست
  // چون verify/settle از SaleOrderId اکو‌شده در callback استفاده می‌کنند، نه از این مقدار مستقیماً.
  private toNumericOrderId(): number {
    return Number(`${Date.now()}`.slice(-12));
  }

  async requestPayment(
    params: PaymentRequestParams,
  ): Promise<PaymentRequestResult> {
    const { terminalId, username, password } = await this.getConfig();
    const client = await this.getClient();
    const orderId = this.toNumericOrderId();
    const { localDate, localTime } = this.nowLocalDateTime();

    const [result] = await client.bpPayRequestAsync({
      terminalId,
      userName: username,
      userPassword: password,
      orderId,
      amount: this.rialAmount(params.amountRial),
      localDate,
      localTime,
      additionalData: params.description ?? '',
      callBackUrl: params.callbackUrl,
      payerId: 0,
    });

    const [resCode, refId] = String(result?.return ?? '').split(',');

    if (resCode !== '0' || !refId) {
      this.logger.error(
        `[BehPardakht] bpPayRequest ناموفق: resCode=${resCode}`,
      );
      throw new Error(`خطای به‌پرداخت ملت هنگام ایجاد تراکنش: کد ${resCode}`);
    }

    // درگاه ملت درخواست GET به startpay.mellat را قبول نمی‌کند (فقط POST با فیلد RefId) —
    // چون فرانت با یک redirect ساده (window.location.href) کار می‌کند، یک صفحه واسط در
    // همین بک‌اند فرم را خودکار submit می‌کند (پایین‌تر در shop-orders.controller.ts).
    const base = params.callbackUrl.replace(/\/payment\/callback\/.+$/, '');

    return {
      redirectUrl: `${base}/payment/redirect/behpardakht/${refId}`,
      providerRef: refId,
    };
  }

  async verifyPayment(
    params: PaymentVerifyParams,
  ): Promise<PaymentVerifyResult> {
    const resCode = params.callbackQuery['ResCode'];
    const saleOrderId = params.callbackQuery['SaleOrderId'];
    const saleReferenceId = params.callbackQuery['SaleReferenceId'];

    if (resCode !== '0') {
      return {
        success: false,
        failureReason: `کد خطای بانک: ${resCode}`,
        rawResponse: params.callbackQuery,
      };
    }

    if (!saleOrderId || !saleReferenceId) {
      return {
        success: false,
        failureReason:
          'پاسخ بانک فاقد SaleOrderId/SaleReferenceId است — تایید تراکنش ممکن نیست',
        rawResponse: params.callbackQuery,
      };
    }

    const { terminalId, username, password } = await this.getConfig();
    const client = await this.getClient();
    const orderIdNum = Number(saleOrderId);
    const saleReferenceIdNum = Number(saleReferenceId);

    try {
      const [verifyResult] = await client.bpVerifyRequestAsync({
        terminalId,
        userName: username,
        userPassword: password,
        orderId: orderIdNum,
        saleOrderId: orderIdNum,
        saleReferenceId: saleReferenceIdNum,
      });
      const verifyResCode = String(verifyResult?.return ?? '');

      if (verifyResCode !== '0') {
        this.logger.error(
          `[BehPardakht] bpVerifyRequest ناموفق: ${verifyResCode}`,
        );
        return {
          success: false,
          failureReason: `تایید تراکنش نزد بانک ناموفق بود: کد ${verifyResCode}`,
          rawResponse: { verifyResCode },
        };
      }

      const [settleResult] = await client.bpSettleRequestAsync({
        terminalId,
        userName: username,
        userPassword: password,
        orderId: orderIdNum,
        saleOrderId: orderIdNum,
        saleReferenceId: saleReferenceIdNum,
      });
      const settleResCode = String(settleResult?.return ?? '');

      const success =
        settleResCode === '0' || settleResCode === SETTLE_ALREADY_DONE;

      if (!success) {
        this.logger.error(
          `[BehPardakht] bpSettleRequest ناموفق: ${settleResCode}`,
        );
      }

      return {
        success,
        trackingCode: saleReferenceId,
        failureReason: success
          ? undefined
          : `نهایی‌سازی (Settle) تراکنش ناموفق بود: کد ${settleResCode}`,
        rawResponse: { verifyResCode, settleResCode },
      };
    } catch (err) {
      this.logger.error(
        '[BehPardakht] خطا در ارتباط SOAP هنگام verify/settle',
        err,
      );
      return {
        success: false,
        failureReason: 'خطا در ارتباط با درگاه به‌پرداخت ملت',
        rawResponse: err instanceof Error ? err.message : err,
      };
    }
  }

  refundPayment(params: PaymentRefundParams): Promise<PaymentRefundResult> {
    // bpReversalRequest به orderId/saleOrderId نیاز دارد که در PaymentRefundParams
    // موجود نیست (فقط providerRef/amountRial) — این متد هنوز در هیچ‌جای برنامه صدا زده
    // نمی‌شود (استرداد فعلاً از مسیر دیگری/دستی انجام می‌شود)، پس عمداً fail-closed است
    // تا وقتی PaymentRefundParams با saleOrderId/saleReferenceId تکمیل شود.
    this.logger.warn(
      '[BehPardakht] refundPayment صدا زده شد اما پیاده‌سازی نشده — نیاز به orderId/saleOrderId دارد',
    );
    return Promise.resolve({
      success: false,
      rawResponse: {
        reason:
          'استرداد به‌پرداخت ملت نیاز به orderId/saleOrderId تراکنش اصلی دارد که در این Interface ارسال نمی‌شود',
        providerRef: params.providerRef,
      },
    });
  }
}
