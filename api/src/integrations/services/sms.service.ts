import { Injectable } from '@nestjs/common';
import { ProviderResolverService } from '../registry/provider-resolver.service';
import {
  SendSmsInput,
  SendSmsResult,
  SmsProvider,
} from '../interfaces/sms.interface';
import { MockSmsProvider } from '../providers/mock/mock-sms.provider';

export const SMS_SERVICE_CODE = 'SMS';

/**
 * Contract مشترک ارسال پیامک — Business Logic (مثلاً TicketsService از طریق
 * NotificationsService) فقط همین را صدا می‌زند و هیچ‌وقت مستقیماً MockSmsProvider
 * یا Adapter واقعی را نمی‌شناسد. انتخاب Provider واقعی بر عهده ProviderResolverService
 * (بر اساس Configuration دیتابیس — پنل ادمین) است.
 */
@Injectable()
export class SmsService {
  private readonly providerMap: Map<string, SmsProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    mock: MockSmsProvider,
  ) {
    this.providerMap = new Map<string, SmsProvider>([
      [mock.providerCode, mock],
    ]);
  }

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const { result } = await this.resolver.resolveAndExecute(
      SMS_SERVICE_CODE,
      this.providerMap,
      (provider) => provider.send(input),
    );
    return result;
  }
}
