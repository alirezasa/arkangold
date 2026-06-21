import { Global, Module } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { SystemConfigController } from './system-config.controller';

@Global() // Global تا همه ماژول‌ها بتونن inject کنن بدون import مجدد
@Module({
  providers: [SystemConfigService],
  controllers: [SystemConfigController],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
