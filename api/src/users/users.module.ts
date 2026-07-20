import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CivilRegistryService } from './civil-registry.service';
import { UsersAdminController } from './users-admin.controller';
import { UsersAdminService } from './users-admin.service';
import { UsersAdminListController } from './users-admin-list.controller';
@Module({
  controllers: [
    UsersController,
    UsersAdminController,
    UsersAdminListController,
  ],
  providers: [UsersService, CivilRegistryService, UsersAdminService],
  exports: [UsersService],
})
export class UsersModule {}
