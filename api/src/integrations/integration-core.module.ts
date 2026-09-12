import { Global, Module } from '@nestjs/common';
import { CredentialEncryptionService } from './credentials/credential-encryption.service';
import { ProviderCredentialService } from './credentials/provider-credential.service';
import { ProviderRegistryService } from './registry/provider-registry.service';
import { ProviderResolverService } from './registry/provider-resolver.service';
import { IntegrationLogService } from './logging/integration-log.service';
import { IntegrationSyncService } from './sync/integration-sync.service';
import { IntegrationsAdminController } from './admin/integrations-admin.controller';
import { IntegrationsAdminService } from './admin/integrations-admin.service';
import { FinotechModule } from './providers/finotech/finotech.module';

/**
 * زیرساخت مشترک لایه Integration (Registry، Resolver، Credential، Logging، Sync، Admin API).
 * @Global است چون مشابه SystemConfigModule/RedisModule/RbacModule پروژه، همه ماژول‌های
 * Business (Users، بعداً SMS، Payment و ...) به این سرویس‌ها نیاز دارند بدون این‌که هر بار
 * لازم باشد صریحاً import شوند.
 *
 * FinotechModule این‌جا import شده فقط برای این‌که IntegrationsAdminService بتواند
 * FinotechTokenService را برای Health Check تزریق کند؛ خودِ FinotechIdentityProvider
 * را باید IdentityVerificationModule جداگانه هم import کند (چون آن ماژول Global نیست).
 */
@Global()
@Module({
  imports: [FinotechModule],
  controllers: [IntegrationsAdminController],
  providers: [
    CredentialEncryptionService,
    ProviderCredentialService,
    ProviderRegistryService,
    ProviderResolverService,
    IntegrationLogService,
    IntegrationSyncService,
    IntegrationsAdminService,
  ],
  exports: [
    CredentialEncryptionService,
    ProviderCredentialService,
    ProviderRegistryService,
    ProviderResolverService,
    IntegrationLogService,
  ],
})
export class IntegrationCoreModule {}
