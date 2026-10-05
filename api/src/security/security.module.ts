// api/src/security/security.module.ts
import { Module } from '@nestjs/common';
import { RetentionModule } from '../common/retention/retention.module';
import { SecurityAdminController } from './security-admin.controller';
import { SecurityAuthController } from './security-auth.controller';

@Module({
  imports: [RetentionModule],
  controllers: [SecurityAdminController, SecurityAuthController],
})
export class SecurityModule {}
