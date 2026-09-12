import { Module } from '@nestjs/common';
import { FinotechTokenService } from './finotech-token.service';
import { FinotechHttpClient } from './finotech-http.client';
import { FinotechIdentityProvider } from './finotech-identity.provider';

@Module({
  providers: [FinotechTokenService, FinotechHttpClient, FinotechIdentityProvider],
  exports: [FinotechTokenService, FinotechIdentityProvider],
})
export class FinotechModule {}
