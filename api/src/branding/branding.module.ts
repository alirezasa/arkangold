// api/src/branding/branding.module.ts
import { Global, Module } from '@nestjs/common';
import { BrandingService } from './branding.service';
import { BrandingAdminController } from './branding-admin.controller';
import { BrandingPublicController } from './branding-public.controller';
import { AppearanceService } from './appearance.service';
import { AppearanceAdminController } from './appearance-admin.controller';

@Global()
@Module({
  controllers: [
    AppearanceAdminController,
    BrandingAdminController,
    BrandingPublicController,
  ],
  providers: [BrandingService, AppearanceService],
  exports: [BrandingService, AppearanceService],
})
export class BrandingModule {}
