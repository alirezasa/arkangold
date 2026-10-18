// api/src/branding/branding.module.ts
import { Global, Module } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { BrandingAdminController } from './branding-admin.controller';
import { BrandingPublicController } from './branding-public.controller';

@Global()
@Module({
  controllers: [BrandingAdminController, BrandingPublicController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
