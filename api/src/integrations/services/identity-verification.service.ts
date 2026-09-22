import { Injectable } from '@nestjs/common';
import { ProviderResolverService } from '../registry/provider-resolver.service';
import {
  IdentityVerificationInput,
  IdentityVerificationProvider,
  IdentityVerificationResult,
} from '../interfaces/identity-verification.interface';
import { FinotechIdentityProvider } from '../providers/finotech/finotech-identity.provider';
import { MockIdentityProvider } from '../providers/mock/mock-identity.provider';

export const IDENTITY_VERIFICATION_SERVICE_CODE = 'IDENTITY_VERIFICATION';

/**
 * این کلاس همان چیزی است که در سند اولیه به‌عنوان
 *   identityVerificationService.verifyIdentity()
 * معرفی شده — Business Logic (مثلاً UsersService) فقط همین را صدا می‌زند و
 * هیچ‌وقت مستقیماً FinotechIdentityProvider یا MockIdentityProvider را نمی‌شناسد.
 *
 * انتخاب این‌که کدام Provider واقعاً اجرا شود، کاملاً بر عهده ProviderResolverService
 * (بر اساس Configuration دیتابیس) است.
 */
@Injectable()
export class IdentityVerificationService {
  private readonly providerMap: Map<string, IdentityVerificationProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    finotech: FinotechIdentityProvider,
    mock: MockIdentityProvider,
  ) {
    this.providerMap = new Map<string, IdentityVerificationProvider>([
      [finotech.providerCode, finotech],
      [mock.providerCode, mock],
    ]);
  }

  async verifyIdentity(
    input: IdentityVerificationInput,
  ): Promise<IdentityVerificationResult> {
    const { result, providerCode } = await this.resolver.resolveAndExecute(
      IDENTITY_VERIFICATION_SERVICE_CODE,
      this.providerMap,
      (provider) => provider.verifyIdentity(input),
    );
    return { ...result, verifiedByProvider: providerCode };
  }
}
