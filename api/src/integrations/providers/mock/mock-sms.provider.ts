import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SendSmsInput,
  SendSmsResult,
  SmsProvider,
} from '../../interfaces/sms.interface';

/**
 * پیاده‌سازی شبیه‌سازی‌شده برای dev/staging — فقط در لاگ سرور چاپ می‌کند.
 * وقتی Adapter واقعی (کاوه‌نگار/ملی‌پیامک/...) نوشته شد، طبق همان الگوی
 * IdentityVerification (Finotech + Mock)، از پنل ادمین Priority آن را جابه‌جا کنید.
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly providerCode = 'MOCK';
  private readonly logger = new Logger(MockSmsProvider.name);

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    this.logger.log(`[MOCK SMS] -> ${input.phone}: ${input.text}`);
    await this.delay(150); // شبیه‌سازی تاخیر شبکه، مثل MockIdentityProvider
    return { sent: true, providerRequestId: `mock-${randomUUID()}` };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
