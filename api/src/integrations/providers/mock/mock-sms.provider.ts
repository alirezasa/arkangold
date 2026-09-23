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
    // FAU_GEN_EXT.1.4: متن پیامک معمولاً کد OTP دارد؛ فقط با OTP_DEBUG_LOG در محیط غیر production چاپ می‌شود
    const showText =
      process.env.NODE_ENV !== 'production' &&
      process.env.OTP_DEBUG_LOG === 'true';
    this.logger.log(
      `[MOCK SMS] -> ${input.phone}: ${showText ? input.text : `[${input.text.length} chars]`}`,
    );
    await this.delay(150); // شبیه‌سازی تاخیر شبکه، مثل MockIdentityProvider
    return { sent: true, providerRequestId: `mock-${randomUUID()}` };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
