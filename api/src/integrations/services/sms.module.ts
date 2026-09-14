import { Module } from '@nestjs/common';
import { MockSmsProvider } from '../providers/mock/mock-sms.provider';
import { SmsService } from './sms.service';

/**
 * فقط این ماژول را در هر ماژول Business که به ارسال پیامک نیاز دارد import کن
 * (مثلاً NotificationsModule). ProviderRegistryService/ProviderResolverService از
 * IntegrationCoreModule (که @Global است) به‌صورت خودکار در دسترس هستند.
 */
@Module({
  providers: [MockSmsProvider, SmsService],
  exports: [SmsService],
})
export class SmsModule {}
