import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KycInquiryModule } from '../integrations/services/kyc-inquiry.module';
import { MobileVerificationController } from './mobile-verification.controller';
import { MobileVerificationService } from './mobile-verification.service';

/** تطبیق شاهکار شماره موبایل و تغییر شماره‌ی ناهمخوان */
@Module({
  imports: [AuthModule, KycInquiryModule],
  controllers: [MobileVerificationController],
  providers: [MobileVerificationService],
  exports: [MobileVerificationService],
})
export class KycModule {}
