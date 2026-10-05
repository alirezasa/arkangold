import { Injectable } from '@nestjs/common';
import { ProviderResolverService } from '../registry/provider-resolver.service';
import {
  MobileNationalIdMatchInput,
  MobileNationalIdMatchProvider,
  MobileNationalIdMatchResult,
} from '../interfaces/mobile-national-id-match.interface';
import {
  CardNationalIdMatchInput,
  CardNationalIdMatchProvider,
  CardNationalIdMatchResult,
} from '../interfaces/card-national-id-match.interface';
import {
  CardToIbanInput,
  CardToIbanProvider,
  CardToIbanResult,
} from '../interfaces/card-to-iban.interface';
import { FinotechShahkarProvider } from '../providers/finotech/finotech-shahkar.provider';
import { FinotechCardOwnerProvider } from '../providers/finotech/finotech-card-owner.provider';
import { FinotechCardToIbanProvider } from '../providers/finotech/finotech-card-to-iban.provider';
import {
  MockCardOwnerProvider,
  MockCardToIbanProvider,
  MockShahkarProvider,
} from '../providers/mock/mock-kyc-inquiry.providers';

export const MOBILE_NATIONAL_ID_MATCH_SERVICE_CODE = 'MOBILE_NATIONAL_ID_MATCH';
export const CARD_NATIONAL_ID_MATCH_SERVICE_CODE = 'CARD_NATIONAL_ID_MATCH';
export const CARD_TO_IBAN_SERVICE_CODE = 'CARD_TO_IBAN';

/**
 * سرویس‌های Contract استعلام‌های KYC — Business Logic فقط این‌ها را صدا می‌زند و
 * انتخاب Provider (فینوتک/Mock، اولویت و فال‌بک) کاملاً از پنل ادمین کنترل می‌شود.
 * اگر سرویس از پنل غیرفعال باشد، ConfigurationError پرتاب می‌شود.
 */
@Injectable()
export class MobileNationalIdMatchService {
  private readonly providerMap: Map<string, MobileNationalIdMatchProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    finotech: FinotechShahkarProvider,
    mock: MockShahkarProvider,
  ) {
    this.providerMap = new Map<string, MobileNationalIdMatchProvider>([
      [finotech.providerCode, finotech],
      [mock.providerCode, mock],
    ]);
  }

  async match(
    input: MobileNationalIdMatchInput,
  ): Promise<MobileNationalIdMatchResult> {
    const { result, providerCode } = await this.resolver.resolveAndExecute(
      MOBILE_NATIONAL_ID_MATCH_SERVICE_CODE,
      this.providerMap,
      (provider) => provider.match(input),
    );
    return { ...result, verifiedByProvider: providerCode };
  }
}

@Injectable()
export class CardNationalIdMatchService {
  private readonly providerMap: Map<string, CardNationalIdMatchProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    finotech: FinotechCardOwnerProvider,
    mock: MockCardOwnerProvider,
  ) {
    this.providerMap = new Map<string, CardNationalIdMatchProvider>([
      [finotech.providerCode, finotech],
      [mock.providerCode, mock],
    ]);
  }

  async match(
    input: CardNationalIdMatchInput,
  ): Promise<CardNationalIdMatchResult> {
    const { result, providerCode } = await this.resolver.resolveAndExecute(
      CARD_NATIONAL_ID_MATCH_SERVICE_CODE,
      this.providerMap,
      (provider) => provider.match(input),
    );
    return { ...result, verifiedByProvider: providerCode };
  }
}

@Injectable()
export class CardToIbanService {
  private readonly providerMap: Map<string, CardToIbanProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    finotech: FinotechCardToIbanProvider,
    mock: MockCardToIbanProvider,
  ) {
    this.providerMap = new Map<string, CardToIbanProvider>([
      [finotech.providerCode, finotech],
      [mock.providerCode, mock],
    ]);
  }

  async convert(input: CardToIbanInput): Promise<CardToIbanResult> {
    const { result, providerCode } = await this.resolver.resolveAndExecute(
      CARD_TO_IBAN_SERVICE_CODE,
      this.providerMap,
      (provider) => provider.convert(input),
    );
    return { ...result, verifiedByProvider: providerCode };
  }
}
