import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CivilRegistryService } from './civil-registry.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, CivilRegistryService],
  exports: [UsersService],
})
export class UsersModule {}
