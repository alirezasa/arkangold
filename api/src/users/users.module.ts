import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CivilRegistryService } from './civil-registry.service';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { UsersAdminListController } from './users-admin-list.controller';
import { LegalDocumentsController } from './legal-documents.controller';
import { LegalDocumentsService } from './legal-documents.service';
@Module({
  controllers: [
    UsersController,
    UsersAdminController,
    UsersAdminListController,
    LegalDocumentsController,
  ],
  providers: [
    UsersService,
    CivilRegistryService,
    UsersAdminService,
    LegalDocumentsService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
