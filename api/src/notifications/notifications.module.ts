// api/src/notifications/notifications.module.ts
import { Global, Module } from '@nestjs/common';
import { SmsModule } from '../integrations/services/sms.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { SmsTemplateService } from './sms-template.service';
import { SmsAdminService } from './sms-admin.service';
import { SmsAdminController } from './sms-admin.controller';

/**
 * Global: پیامک رویدادها (سفارش، واریز/برداشت، OTP، قرارداد نماینده) از همه‌ی ماژول‌ها
 * بدون import صریح در دسترس است.
 */
@Global()
@Module({
  imports: [SmsModule, PrismaModule],
  controllers: [SmsAdminController],
  providers: [NotificationsService, SmsTemplateService, SmsAdminService],
  exports: [NotificationsService, SmsTemplateService, SmsModule],
})
export class NotificationsModule {}
