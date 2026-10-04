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

export const GHASEDAK_PROVIDER_CODE = 'GHASEDAK';

export const GHASEDAK_CREDENTIAL_KEYS = {
  /** کلید وب‌سرویس (هدر ApiKey) از پنل قاصدک ← تنظیمات ← وب‌سرویس */
  API_KEY: 'API_KEY',
  /** شماره خط اختصاصی/عمومی ارسال (مثلاً 30005006009009) */
  LINE_NUMBER: 'LINE_NUMBER',
} as const;

/** نشانی پایه‌ی REST نسخه‌ی جدید قاصدک (gateway) */
const BASE_URL = 'https://gateway.ghasedak.me/rest/api/v1/WebService';

/** قالب پاسخ همه‌ی متدهای وب‌سرویس قاصدک */
interface GhasedakResponse<T> {
  isSuccess: boolean;
  statusCode: number;
  message?: string;
  data?: T;
}

interface GhasedakSingleData {
  receptor?: string;
  lineNumber?: string;
  cost?: number;
  messageId?: string;
  clientReferenceId?: string;
}

interface GhasedakOtpData {
  lineNumber?: string;
  messageBody?: string;
  totalCost?: number;
  items?: { receptor?: string; cost?: number; messageId?: string }[];
}

interface GhasedakAccountData {
  credit?: number;
  expireDate?: string;
  plan?: string;
}

/**
 * Adapter سامانه‌ی پیامک قاصدک (ghasedak.me) — مطابق وب‌سرویس REST نسخه‌ی ۱:
 *   POST {BASE}/SendSingleSMS       ارسال متن آزاد از خط           { lineNumber, receptor, message, clientReferenceId, udh }
 *   POST {BASE}/SendOtpSMS          ارسال با قالب (OTP جدید)        { receptors:[{mobile, clientReferenceId}], templateName, inputs:[{param, value}], udh }
 *   GET  {BASE}/GetAccountInformation  اعتبار و پلن حساب
 * احراز هویت با هدر «ApiKey». پاسخ: { isSuccess, statusCode, message, data }.
 */
@Injectable()
export class GhasedakSmsProvider implements SmsProvider {
  readonly providerCode = GHASEDAK_PROVIDER_CODE;
  private readonly logger = new Logger(GhasedakSmsProvider.name);

  constructor(private readonly credentials: ProviderCredentialService) {}

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const mobile = normalizeIranMobile(input.phone);
    if (!mobile)
      throw new ValidationError(`شماره موبایل نامعتبر: ${input.phone}`);

    const pattern = input.pattern?.ghasedakTemplateName ? input.pattern : null;
    const usePattern = !!pattern;
    if (!usePattern && !input.text.trim()) {
      throw new ValidationError('متن پیامک خالی است');
    }

    if (!isLiveSmsAllowed()) {
      this.logger.log(
        `[قاصدک — ارسال آزمایشی، محیط غیرعملیاتی] → ${mobile} (${usePattern ? 'قالب' : 'متن'})`,
      );
      return {
        sent: false,
        dryRun: true,
        providerRequestId: `dry-${randomUUID()}`,
      };
    }

    const apiKey = await this.credential(GHASEDAK_CREDENTIAL_KEYS.API_KEY);
    const clientReferenceId = (input.clientReferenceId ?? randomUUID()).slice(
      0,
      50,
    );

    if (pattern) {
      const { body } = await smsHttpRequest<GhasedakResponse<GhasedakOtpData>>(
        'قاصدک',
        {
          method: 'POST',
          url: `${BASE_URL}/SendOtpSMS`,
          headers: this.headers(apiKey),
          data: {
            receptors: [{ mobile, clientReferenceId }],
            templateName: pattern.ghasedakTemplateName,
            inputs: pattern.params.map((p) => ({
              param: p.name,
              value: p.value,
            })),
            udh: false,
          },
        },
        (b) => (b as GhasedakResponse<unknown>)?.message,
      );
      const data = this.unwrap(body);
      const item = data.items?.[0];
      return {
        sent: true,
        providerRequestId: item?.messageId
          ? String(item.messageId)
          : clientReferenceId,
        cost: data.totalCost ?? item?.cost,
      };
    }

    const lineNumber = await this.credential(
      GHASEDAK_CREDENTIAL_KEYS.LINE_NUMBER,
    );
    const { body } = await smsHttpRequest<GhasedakResponse<GhasedakSingleData>>(
      'قاصدک',
      {
        method: 'POST',
        url: `${BASE_URL}/SendSingleSMS`,
        headers: this.headers(apiKey),
        data: {
          lineNumber,
          receptor: mobile,
          message: input.text,
          clientReferenceId,
          udh: false,
        },
      },
      (b) => (b as GhasedakResponse<unknown>)?.message,
    );
    const data = this.unwrap(body);
    return {
      sent: true,
      providerRequestId: data.messageId
        ? String(data.messageId)
        : clientReferenceId,
      cost: data.cost,
    };
  }

  async getAccountInfo(): Promise<SmsAccountInfo> {
    const apiKey = await this.credential(GHASEDAK_CREDENTIAL_KEYS.API_KEY);
    const { body } = await smsHttpRequest<
      GhasedakResponse<GhasedakAccountData>
    >(
      'قاصدک',
      {
        method: 'GET',
        url: `${BASE_URL}/GetAccountInformation`,
        headers: this.headers(apiKey),
      },
      (b) => (b as GhasedakResponse<unknown>)?.message,
    );
    const data = this.unwrap(body);
    let line: string | null = null;
    try {
      line = await this.credential(GHASEDAK_CREDENTIAL_KEYS.LINE_NUMBER);
    } catch {
      line = null;
    }
    return {
      credit: typeof data.credit === 'number' ? data.credit : null,
      creditUnit: 'ریال',
      expireDate: data.expireDate ?? null,
      plan: data.plan ?? null,
      lines: line ? [line] : [],
    };
  }

  private headers(apiKey: string) {
    return {
      ApiKey: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'cache-control': 'no-cache',
    };
  }

  private unwrap<T>(body: GhasedakResponse<T> | undefined): T {
    if (!body || typeof body !== 'object') {
      throw new InvalidResponseError('پاسخ قاصدک قابل خواندن نبود');
    }
    if (!body.isSuccess) {
      throw new BusinessRejectionError(
        `قاصدک: ${body.message || 'درخواست رد شد'}`,
        String(body.statusCode ?? ''),
      );
    }
    return (body.data ?? {}) as T;
  }

  private async credential(key: string): Promise<string> {
    try {
      const value = (
        await this.credentials.getCredential(GHASEDAK_PROVIDER_CODE, key)
      ).trim();
      if (!value) throw new Error('empty');
      return value;
    } catch {
      throw new ConfigurationError(
        `تنظیمات قاصدک ناقص است: مقدار ${key} را در مرکز پیامک ثبت کنید`,
      );
    }
  }
}
