import { Module } from '@nestjs/common';
import { MockSmsProvider } from '../providers/mock/mock-sms.provider';
import { GhasedakSmsProvider } from '../providers/ghasedak/ghasedak-sms.provider';
import { SmsIrSmsProvider } from '../providers/smsir/smsir-sms.provider';
import { SmsService } from './sms.service';

/**
 * فقط این ماژول را در هر ماژول Business که به ارسال پیامک نیاز دارد import کن
 * (مثلاً NotificationsModule). ProviderRegistryService/ProviderResolverService و
 * ProviderCredentialService از IntegrationCoreModule (که @Global است) در دسترس هستند.
 */
@Module({
  providers: [
    MockSmsProvider,
    GhasedakSmsProvider,
    SmsIrSmsProvider,
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
