// api/src/packaging/packaging.module.ts
import { Module } from '@nestjs/common';
import { PackagingService } from './packaging.service';
import { PackagingAdminController } from './packaging-admin.controller';

@Module({
  controllers: [PackagingAdminController],
  providers: [PackagingService],
  exports: [PackagingService],
})
export class PackagingModule {}
