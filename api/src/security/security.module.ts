// api/src/security/security.module.ts
import { Module } from '@nestjs/common';
import { RetentionModule } from '../common/retention/retention.module';
import { SecurityAdminController } from './security-admin.controller';

@Module({
  imports: [RetentionModule],
  controllers: [SecurityAdminController],
})
export class SecurityModule {}
