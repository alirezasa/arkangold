import { Module } from '@nestjs/common';
import { FinotechTokenService } from './finotech-token.service';
import { FinotechHttpClient } from './finotech-http.client';
import { FinotechIdentityProvider } from './finotech-identity.provider';
import { FinotechEnvironmentService } from './finotech-environment.service';

@Module({
  providers: [
    FinotechEnvironmentService,
    FinotechTokenService,
    FinotechHttpClient,
    FinotechIdentityProvider,
  ],
  exports: [FinotechTokenService, FinotechIdentityProvider],
})
export class FinotechModule {}
