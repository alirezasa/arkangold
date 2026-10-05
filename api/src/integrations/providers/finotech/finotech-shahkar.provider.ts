import { Injectable } from '@nestjs/common';
import { FinotechHttpClient } from './finotech-http.client';
import { ProviderCredentialService } from '../../credentials/provider-credential.service';
import {
  FINOTECH_CONFIG,
  FINOTECH_CREDENTIAL_KEYS,
  FINOTECH_PROVIDER_CODE,
  FINOTECH_SCOPES,
  finotechTrackId,
} from './finotech-config';
import {
  MobileNationalIdMatchInput,
  MobileNationalIdMatchProvider,
  MobileNationalIdMatchResult,
} from '../../interfaces/mobile-national-id-match.interface';
import {
  InvalidResponseError,
  ValidationError,
} from '../../errors/integration-error';
import { FinotechEnvelope, unwrapFinotech } from './finotech-response.util';

/**
 * استعلام شاهکار فینوتک:
 *   GET /facility/v2/clients/{clientId}/shahkar/verify?mobile&nationalCode&trackId
 *   Scope: facility:shahkar:get — پاسخ: result.isValid
 */
@Injectable()
export class FinotechShahkarProvider implements MobileNationalIdMatchProvider {
  readonly providerCode = FINOTECH_PROVIDER_CODE;

  constructor(
    private readonly http: FinotechHttpClient,
    private readonly credentials: ProviderCredentialService,
  ) {}

  async match(
    input: MobileNationalIdMatchInput,
  ): Promise<MobileNationalIdMatchResult> {
    if (!/^\d{10}$/.test(input.nationalCode)) {
      throw new ValidationError('کد ملی باید ۱۰ رقم باشد');
    }
    if (!/^09\d{9}$/.test(input.mobile)) {
      throw new ValidationError('شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود');
    }

    const clientId = await this.credentials.getCredential(
      FINOTECH_PROVIDER_CODE,
      FINOTECH_CREDENTIAL_KEYS.CLIENT_ID,
    );

    const response = await this.http.get<
      FinotechEnvelope<{ isValid?: boolean }>
    >(
      FINOTECH_CONFIG.SHAHKAR_PATH(clientId),
      {
        mobile: input.mobile,
        nationalCode: input.nationalCode,
        trackId: finotechTrackId('shahkar'),
      },
      { scope: FINOTECH_SCOPES.SHAHKAR },
    );

    const result = unwrapFinotech(response, 'شاهکار');
    if (typeof result.isValid !== 'boolean') {
      throw new InvalidResponseError('پاسخ شاهکار فاقد فیلد isValid بود');
    }

    return {
      matched: result.isValid,
      reason: result.isValid
        ? undefined
        : 'شماره موبایل متعلق به این کد ملی نیست',
      providerRequestId: response.trackId,
    };
  }
}
