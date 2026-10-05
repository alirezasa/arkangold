import { Module } from '@nestjs/common';
import { IntegrationCoreModule } from './integration-core.module';
import { IdentityVerificationModule } from './services/identity-verification.module';
import { KycInquiryModule } from './services/kyc-inquiry.module';
import { IntegrationsTestController } from './admin/integrations-test.controller';

/**
 * این ماژول را یک‌بار در app.module.ts اضافه کن (برای بالا آمدن Admin API + Sync در Boot).
 * برای استفاده در UsersModule، به‌جای این ماژول مستقیماً IdentityVerificationModule را
 * import کن (services/identity-verification.module.ts) — چون IntegrationCoreModule خودش
 * Global است و نیازی به import مجدد در ماژول‌های دیگر ندارد.
 */
@Module({
  imports: [IntegrationCoreModule, IdentityVerificationModule, KycInquiryModule],
  controllers: [IntegrationsTestController],
})
export class IntegrationsModule {}
