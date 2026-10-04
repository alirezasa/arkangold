import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ProviderCredentialService } from '../../credentials/provider-credential.service';
import {
  SendSmsInput,
  SendSmsResult,
  SmsAccountInfo,
  SmsProvider,
} from '../../interfaces/sms.interface';
import {
  BusinessRejectionError,
  ConfigurationError,
  InvalidResponseError,
  ValidationError,
} from '../../errors/integration-error';
import { smsHttpRequest } from '../sms-common/sms-http';
import {
  isLiveSmsAllowed,
  normalizeIranMobile,
} from '../sms-common/sms-live.util';

export const SMSIR_PROVIDER_CODE = 'SMSIR';

export const SMSIR_CREDENTIAL_KEYS = {
  /** کلید API (هدر X-API-KEY) از پنل sms.ir ← برنامه‌نویسان ← لیست کلیدهای API */
  API_KEY: 'API_KEY',
  /** شماره خط ارسال (عددی، مثلاً 30007732000000) */
  LINE_NUMBER: 'LINE_NUMBER',
} as const;

const BASE_URL = 'https://api.sms.ir/v1';

/** قالب پاسخ همه‌ی متدهای API نسخه‌ی ۱ sms.ir */
interface SmsIrResponse<T> {
  status: number;
  message?: string;
  data?: T;
}

/** پیام کدهای وضعیت مستندات sms.ir (وقتی message سامانه خالی باشد) */
const SMSIR_STATUS_MESSAGES: Record<number, string> = {
  0: 'خطای داخلی سامانه',
  10: 'کلید وب‌سرویس نامعتبر است',
  11: 'کلید وب‌سرویس غیرفعال است',
  12: 'کلید وب‌سرویس محدود به IPهای تعریف‌شده است',
  13: 'حساب کاربری غیرفعال است',
  14: 'حساب کاربری در حالت تعلیق است',
  15: 'برای استفاده از وب‌سرویس پلن را ارتقا دهید',
  16: 'مقدار پارامتر ارسالی نادرست است',
  20: 'تعداد درخواست بیش از حد مجاز است',
  101: 'شماره خط نامعتبر است',
  102: 'اعتبار کافی نیست',
  103: 'متن پیامک خالی است',
  104: 'شماره موبایل نادرست است',
  105: 'تعداد موبایل‌ها بیش از حد مجاز است',
  109: 'زمان ارسال نامعتبر است',
  113: 'قالب یافت نشد',
  114: 'طول مقدار پارامتر بیش از حد مجاز (۲۵ کاراکتر) است',
  115: 'شماره موبایل در لیست سیاه سامانه است',
  116: 'نام یک یا چند پارامتر قالب مقداردهی نشده است',
  117: 'متن ارسال‌شده مورد تأیید نیست',
  119: 'برای قالب شخصی‌سازی‌شده پلن را ارتقا دهید',
  123: 'خط ارسال‌کننده نیاز به فعال‌سازی دارد',
};

/**
 * Adapter سامانه‌ی پیامک sms.ir — مطابق API نسخه‌ی ۱ (https://api.sms.ir/v1):
 *   POST /send/bulk    ارسال متن آزاد از خط        { lineNumber, messageText, mobiles[], sendDateTime }
 *   POST /send/verify  ارسال با قالب (Verify)       { mobile, templateId, parameters:[{name, value}] }
 *   GET  /credit       اعتبار حساب (تعداد پیامک)
 *   GET  /line         خطوط ارسال
 * احراز هویت با هدر «X-API-KEY». پاسخ: { status (1 = موفق), message, data }.
 */
@Injectable()
export class SmsIrSmsProvider implements SmsProvider {
  readonly providerCode = SMSIR_PROVIDER_CODE;
  private readonly logger = new Logger(SmsIrSmsProvider.name);

  constructor(private readonly credentials: ProviderCredentialService) {}

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const mobile = normalizeIranMobile(input.phone);
    if (!mobile)
      throw new ValidationError(`شماره موبایل نامعتبر: ${input.phone}`);

    const templateId = input.pattern?.smsirTemplateId?.trim();
    const usePattern = !!templateId;
    if (usePattern && !/^\d+$/.test(templateId)) {
      throw new ValidationError('شناسه‌ی قالب sms.ir باید عددی باشد');
    }
    if (!usePattern && !input.text.trim()) {
      throw new ValidationError('متن پیامک خالی است');
    }

    if (!isLiveSmsAllowed()) {
      this.logger.log(
        `[sms.ir — ارسال آزمایشی، محیط غیرعملیاتی] → ${mobile} (${usePattern ? 'قالب' : 'متن'})`,
      );
      return {
        sent: false,
        dryRun: true,
        providerRequestId: `dry-${randomUUID()}`,
      };
    }

    const apiKey = await this.credential(SMSIR_CREDENTIAL_KEYS.API_KEY);

    if (usePattern) {
      const { body } = await smsHttpRequest<
        SmsIrResponse<{ messageId?: number; cost?: number }>
      >(
        'sms.ir',
        {
          method: 'POST',
          url: `${BASE_URL}/send/verify`,
          headers: this.headers(apiKey),
          data: {
            mobile,
            templateId: Number(templateId),
            parameters: (input.pattern?.params ?? []).map((p) => ({
              name: p.name,
              value: p.value,
            })),
          },
        },
        (b) => (b as SmsIrResponse<unknown>)?.message,
      );
      const data = this.unwrap(body);
      return {
        sent: true,
        providerRequestId:
          data.messageId != null ? String(data.messageId) : undefined,
        cost: data.cost,
      };
    }

    const lineNumber = await this.credential(SMSIR_CREDENTIAL_KEYS.LINE_NUMBER);
    if (!/^\d+$/.test(lineNumber)) {
      throw new ConfigurationError('شماره خط sms.ir باید فقط رقم باشد');
    }
    const { body } = await smsHttpRequest<
      SmsIrResponse<{ packId?: string; messageIds?: number[]; cost?: number }>
    >(
      'sms.ir',
      {
        method: 'POST',
        url: `${BASE_URL}/send/bulk`,
        headers: this.headers(apiKey),
        data: {
          lineNumber: Number(lineNumber),
          messageText: input.text,
          mobiles: [mobile],
          sendDateTime: null,
        },
      },
      (b) => (b as SmsIrResponse<unknown>)?.message,
    );
    const data = this.unwrap(body);
    const messageId = data.messageIds?.[0];
    return {
      sent: true,
      providerRequestId: messageId != null ? String(messageId) : data.packId,
      cost: data.cost,
    };
  }

  async getAccountInfo(): Promise<SmsAccountInfo> {
    const apiKey = await this.credential(SMSIR_CREDENTIAL_KEYS.API_KEY);
    const [credit, lines] = await Promise.all([
      smsHttpRequest<SmsIrResponse<number>>(
        'sms.ir',
        {
          method: 'GET',
          url: `${BASE_URL}/credit`,
          headers: this.headers(apiKey),
        },
        (b) => (b as SmsIrResponse<unknown>)?.message,
      ),
      smsHttpRequest<SmsIrResponse<(string | number)[]>>(
        'sms.ir',
        {
          method: 'GET',
          url: `${BASE_URL}/line`,
          headers: this.headers(apiKey),
        },
        (b) => (b as SmsIrResponse<unknown>)?.message,
      ),
    ]);
    const creditValue = this.unwrap(credit.body);
    const lineValues = this.unwrap(lines.body);
    return {
      credit:
        typeof creditValue === 'number'
          ? creditValue
          : Number(creditValue) || null,
      creditUnit: 'پیامک',
      lines: Array.isArray(lineValues) ? lineValues.map(String) : [],
    };
  }

  private headers(apiKey: string) {
    return {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private unwrap<T>(body: SmsIrResponse<T> | undefined): T {
    if (!body || typeof body !== 'object' || typeof body.status !== 'number') {
      throw new InvalidResponseError('پاسخ sms.ir قابل خواندن نبود');
    }
    if (body.status !== 1) {
      const msg =
        body.message || SMSIR_STATUS_MESSAGES[body.status] || 'درخواست رد شد';
      throw new BusinessRejectionError(`sms.ir: ${msg}`, String(body.status));
    }
    return body.data;
  }

  private async credential(key: string): Promise<string> {
    try {
      const value = (
        await this.credentials.getCredential(SMSIR_PROVIDER_CODE, key)
      ).trim();
      if (!value) throw new Error('empty');
      return value;
    } catch {
      throw new ConfigurationError(
        `تنظیمات sms.ir ناقص است: مقدار ${key} را در مرکز پیامک ثبت کنید`,
      );
    }
  }
}
