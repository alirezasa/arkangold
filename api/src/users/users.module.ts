import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

import { IdentityVerificationModule } from '../integrations/services/identity-verification.module';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { UsersAdminListController } from './users-admin-list.controller';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';
@Module({
  imports: [IdentityVerificationModule],
  controllers: [
    UsersController,
    UsersAdminController,
    UsersAdminListController,
    LegalDocumentsController,
  ],
  providers: [UsersService, UsersAdminService, LegalDocumentsService],
  exports: [UsersService],
})
export class UsersModule {}
