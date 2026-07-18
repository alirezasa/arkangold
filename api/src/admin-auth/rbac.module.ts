// api/src/admin-auth/rbac.module.ts
import { Global, Module } from '@nestjs/common';
import { RbacSyncService } from './rbac-sync.service';

@Global()
@Module({
  providers: [RbacSyncService],
  exports: [RbacSyncService],
})
export class RbacModule {}
