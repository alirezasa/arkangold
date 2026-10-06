// api/src/security/security.module.ts
import { Module } from '@nestjs/common';
import { RetentionModule } from '../common/retention/retention.module';
import { SecurityAdminController } from './security-admin.controller';
import { SecurityAuthController } from './security-auth.controller';
import { SecurityDataProtectionController } from './security-data-protection.controller';

@Module({
  imports: [RetentionModule],
  controllers: [
    SecurityAdminController,
    SecurityAuthController,
    SecurityDataProtectionController,
  ],
})
export class SecurityModule {}
