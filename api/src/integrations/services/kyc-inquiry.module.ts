import { Module } from '@nestjs/common';
import { FinotechModule } from '../providers/finotech/finotech.module';
import {
  MockCardOwnerProvider,
  MockCardToIbanProvider,
  MockShahkarProvider,
} from '../providers/mock/mock-kyc-inquiry.providers';
import {
  CardNationalIdMatchService,
  CardToIbanService,
  MobileNationalIdMatchService,
} from './kyc-inquiry.services';

/**
 * استعلام‌های شاهکار، تطبیق کارت با کد ملی و تبدیل کارت به شبا.
 * در ماژول‌های Business (Users/Bank) و IntegrationCoreModule (تست از پنل ادمین) import می‌شود.
 */
@Module({
  imports: [FinotechModule],
  providers: [
    MockShahkarProvider,
    MockCardOwnerProvider,
    MockCardToIbanProvider,
    MobileNationalIdMatchService,
    CardNationalIdMatchService,
    CardToIbanService,
  ],
  exports: [
    MobileNationalIdMatchService,
    CardNationalIdMatchService,
    CardToIbanService,
  ],
})
export class KycInquiryModule {}
