import { Module } from '@nestjs/common';
import { FinotechTokenService } from './finotech-token.service';
import { FinotechHttpClient } from './finotech-http.client';
import { FinotechIdentityProvider } from './finotech-identity.provider';
import { FinotechEnvironmentService } from './finotech-environment.service';
import { FinotechShahkarProvider } from './finotech-shahkar.provider';
import { FinotechCardOwnerProvider } from './finotech-card-owner.provider';
import { FinotechCardToIbanProvider } from './finotech-card-to-iban.provider';

@Module({
  providers: [
    FinotechEnvironmentService,
    FinotechTokenService,
    FinotechHttpClient,
    FinotechIdentityProvider,
    FinotechShahkarProvider,
    FinotechCardOwnerProvider,
    FinotechCardToIbanProvider,
  ],
  exports: [
    FinotechEnvironmentService,
    FinotechTokenService,
    FinotechIdentityProvider,
    FinotechShahkarProvider,
    FinotechCardOwnerProvider,
    FinotechCardToIbanProvider,
  ],
})
export class FinotechModule {}
