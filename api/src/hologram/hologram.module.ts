import { Module } from '@nestjs/common';
import { HologramService } from './hologram.service';
import { HologramTransferService } from './hologram-transfer.service';
import { HologramSecurityService } from './hologram-security.service';
import { HologramPublicController } from './hologram-public.controller';
import { HologramUserController } from './hologram-user.controller';
import { HologramAdminController } from './hologram-admin.controller';
import { IdentityVerificationModule } from '../integrations/services/identity-verification.module';

@Module({
  imports: [IdentityVerificationModule],
  controllers: [
    HologramPublicController,
    HologramUserController,
    HologramAdminController,
  ],
  providers: [
    HologramService,
    HologramTransferService,
    HologramSecurityService,
  ],
  exports: [HologramService, HologramTransferService],
})
export class HologramModule {}
