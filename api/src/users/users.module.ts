import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

import { IdentityVerificationModule } from '../integrations/services/identity-verification.module';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { UsersAdminListController } from './users-admin-list.controller';
import { UsersMfaAdminController } from './users-mfa-admin.controller';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';
import { ReferralModule } from '../referral/referral.module';
import { KycModule } from '../kyc/kyc.module';
import { AddressesModule } from '../addresses/addresses.module';
@Module({
  imports: [
    IdentityVerificationModule,
    ReferralModule,
    KycModule,
    AddressesModule,
  ],
  controllers: [
    UsersController,
    UsersAdminController,
    UsersAdminListController,
    UsersMfaAdminController,
    LegalDocumentsController,
  ],
  providers: [UsersService, UsersAdminService, LegalDocumentsService],
  exports: [UsersService],
})
export class UsersModule {}
