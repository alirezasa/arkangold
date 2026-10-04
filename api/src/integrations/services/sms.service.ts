import { Injectable } from '@nestjs/common';
import { ProviderResolverService } from '../registry/provider-resolver.service';
import {
  SendSmsInput,
  SendSmsResult,
  SmsAccountInfo,
  SmsProvider,
} from '../interfaces/sms.interface';
import { MockSmsProvider } from '../providers/mock/mock-sms.provider';
import { GhasedakSmsProvider } from '../providers/ghasedak/ghasedak-sms.provider';
import { SmsIrSmsProvider } from '../providers/smsir/smsir-sms.provider';
import { ConfigurationError } from '../errors/integration-error';

export const SMS_SERVICE_CODE = 'SMS';

export interface SmsSendOptions {
  /** سامانه‌ی ترجیحی (از تنظیمات قالب رویداد)؛ در صورت غیرفعال بودن، اولویت پیش‌فرض */
  providerCode?: string | null;
}

/**
 * Contract مشترک ارسال پیامک — Business Logic فقط همین (یا SmsTemplateService) را صدا می‌زند
 * و هیچ‌وقت مستقیماً Adapterها (قاصدک، sms.ir، Mock) را نمی‌شناسد. انتخاب سامانه بر عهده‌ی
 * ProviderResolverService (بر اساس فعال بودن و اولویت در پنل ادمین) است و روی خطای فنی
 * (Timeout/اتصال/خطای سرور) خودکار سراغ سامانه‌ی پشتیبان می‌رود.
 */
@Injectable()
export class SmsService {
  private readonly providerMap: Map<string, SmsProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    mock: MockSmsProvider,
    ghasedak: GhasedakSmsProvider,
    smsir: SmsIrSmsProvider,
  ) {
    this.providerMap = new Map<string, SmsProvider>([
      [mock.providerCode, mock],
      [ghasedak.providerCode, ghasedak],
      [smsir.providerCode, smsir],
    ]);
  }

  async send(
    input: SendSmsInput,
    options: SmsSendOptions = {},
  ): Promise<SendSmsResult & { providerCode: string }> {
    const { result, providerCode } = await this.resolver.resolveAndExecute(
      SMS_SERVICE_CODE,
      this.providerMap,
      (provider) => provider.send(input),
      undefined,
      { preferredProviderCode: options.providerCode },
    );
    return { ...result, providerCode };
  }

  /** ارسال مستقیم از یک سامانه‌ی مشخص (ارسال آزمایشی پنل ادمین) — بدون Fallback */
  async sendVia(
    providerCode: string,
    input: SendSmsInput,
  ): Promise<SendSmsResult & { providerCode: string }> {
    const provider = this.getProvider(providerCode);
    const result = await provider.send(input);
    return { ...result, providerCode };
  }

  async getAccountInfo(providerCode: string): Promise<SmsAccountInfo | null> {
    const provider = this.getProvider(providerCode);
    return provider.getAccountInfo ? provider.getAccountInfo() : null;
  }

  listProviderCodes(): string[] {
    return [...this.providerMap.keys()];
  }

  private getProvider(code: string): SmsProvider {
    const provider = this.providerMap.get(code);
    if (!provider) {
      throw new ConfigurationError(`سامانه‌ی پیامک «${code}» پشتیبانی نمی‌شود`);
    }
    return provider;
  }
}
