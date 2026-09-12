import { Module } from '@nestjs/common';
import { FinotechModule } from '../providers/finotech/finotech.module';
import { MockIdentityProvider } from '../providers/mock/mock-identity.provider';
import { IdentityVerificationService } from './identity-verification.service';

/**
 * فقط این ماژول را در UsersModule (یا هر ماژول Business دیگری که به احراز هویت
 * نیاز دارد) import کن. ProviderRegistryService/ProviderResolverService/... از
 * IntegrationCoreModule (که @Global است) به‌صورت خودکار در دسترس هستند.
 */
@Module({
  imports: [FinotechModule],
  providers: [MockIdentityProvider, IdentityVerificationService],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
