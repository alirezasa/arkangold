// api/src/common/audit/audit.module.ts
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit.service';
import { HorizontalAccessInterceptor } from './horizontal-access.interceptor';

@Global()
@Module({
  providers: [
    AuditService,
    // فقط روی handlerهای دارای @OwnedResource فعال است؛ بقیه‌ی مسیرها بدون هزینه عبور می‌کنند
    { provide: APP_INTERCEPTOR, useClass: HorizontalAccessInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
