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
  CardToIbanInput,
  CardToIbanProvider,
  CardToIbanResult,
} from '../../interfaces/card-to-iban.interface';
import { ValidationError } from '../../errors/integration-error';
import {
  FinotechEnvelope,
  trimOrUndefined,
  unwrapFinotech,
} from './finotech-response.util';

interface FinotechCardToIbanResult {
  IBAN?: string;
  bankName?: string;
  deposit?: string;
  card?: string;
  depositStatus?: string;
  depositOwners?: string;
}

/**
 * تبدیل کارت به شبا فینوتک:
 *   GET /facility/v2/clients/{clientId}/cardToIban?card&version=2&trackId
 *   Scope: facility:card-to-iban:get
 */
@Injectable()
export class FinotechCardToIbanProvider implements CardToIbanProvider {
  readonly providerCode = FINOTECH_PROVIDER_CODE;

  constructor(
    private readonly http: FinotechHttpClient,
    private readonly credentials: ProviderCredentialService,
  ) {}

  async convert(input: CardToIbanInput): Promise<CardToIbanResult> {
    if (!/^\d{16}$/.test(input.cardNumber)) {
      throw new ValidationError('شماره کارت باید ۱۶ رقم باشد');
    }

    const clientId = await this.credentials.getCredential(
      FINOTECH_PROVIDER_CODE,
      FINOTECH_CREDENTIAL_KEYS.CLIENT_ID,
    );

    const response = await this.http.get<
      FinotechEnvelope<FinotechCardToIbanResult>
    >(
      FINOTECH_CONFIG.CARD_TO_IBAN_PATH(clientId),
      {
        card: input.cardNumber,
        version: 2,
        trackId: finotechTrackId('card2iban'),
      },
      { scope: FINOTECH_SCOPES.CARD_TO_IBAN },
    );

    const result = unwrapFinotech(response, 'تبدیل کارت به شبا');
    const iban = trimOrUndefined(result.IBAN)?.toUpperCase().replace(/\s/g, '');
    if (!iban) {
      return {
        found: false,
        reason: 'شماره شبای این کارت توسط بانک اعلام نشد',
        providerRequestId: response.trackId,
      };
    }

    return {
      found: true,
      iban: iban.startsWith('IR') ? iban : `IR${iban}`,
      bankName: trimOrUndefined(result.bankName),
      deposit: trimOrUndefined(result.deposit),
      depositStatus: trimOrUndefined(result.depositStatus),
      depositOwners: trimOrUndefined(result.depositOwners),
      providerRequestId: response.trackId,
    };
  }
}
