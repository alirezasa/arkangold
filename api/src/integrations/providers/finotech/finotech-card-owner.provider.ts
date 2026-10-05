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
  CardNationalIdMatchInput,
  CardNationalIdMatchProvider,
  CardNationalIdMatchResult,
} from '../../interfaces/card-national-id-match.interface';
import {
  InvalidResponseError,
  ValidationError,
} from '../../errors/integration-error';
import { FinotechEnvelope, unwrapFinotech } from './finotech-response.util';

/**
 * تطبیق شماره کارت و کد ملی فینوتک:
 *   POST /kyc/v2/clients/{clientId}/cardOwnerVerification?trackId — body {card, nid}
 *   Scope: kyc:card-owner-verification:post — پاسخ: result.isValid
 */
@Injectable()
export class FinotechCardOwnerProvider implements CardNationalIdMatchProvider {
  readonly providerCode = FINOTECH_PROVIDER_CODE;

  constructor(
    private readonly http: FinotechHttpClient,
    private readonly credentials: ProviderCredentialService,
  ) {}

  async match(
    input: CardNationalIdMatchInput,
  ): Promise<CardNationalIdMatchResult> {
    if (!/^\d{16}$/.test(input.cardNumber)) {
      throw new ValidationError('شماره کارت باید ۱۶ رقم باشد');
    }
    if (!/^\d{10}$/.test(input.nationalCode)) {
      throw new ValidationError('کد ملی باید ۱۰ رقم باشد');
    }

    const clientId = await this.credentials.getCredential(
      FINOTECH_PROVIDER_CODE,
      FINOTECH_CREDENTIAL_KEYS.CLIENT_ID,
    );

    const response = await this.http.post<
      FinotechEnvelope<{ isValid?: boolean }>
    >(
      FINOTECH_CONFIG.CARD_OWNER_VERIFICATION_PATH(clientId),
      { card: input.cardNumber, nid: input.nationalCode },
      { trackId: finotechTrackId('cardowner') },
      { scope: FINOTECH_SCOPES.CARD_OWNER_VERIFICATION },
    );

    const result = unwrapFinotech(response, 'تطبیق کارت و کد ملی');
    if (typeof result.isValid !== 'boolean') {
      throw new InvalidResponseError(
        'پاسخ تطبیق کارت و کد ملی فاقد فیلد isValid بود',
      );
    }

    return {
      matched: result.isValid,
      reason: result.isValid ? undefined : 'کارت متعلق به این کد ملی نیست',
      providerRequestId: response.trackId,
    };
  }
}
