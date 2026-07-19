import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CivilRegistryService } from './civil-registry.service';
import { UsersAdminController } from './users-admin.controller';
@Module({
  controllers: [UsersController, UsersAdminController],
  providers: [UsersService, CivilRegistryService],
  exports: [UsersService],
})
export class UsersModule {}
