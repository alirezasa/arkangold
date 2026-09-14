// api/src/notifications/notifications.module.ts
import { Module } from '@nestjs/common';
import { SmsModule } from '../integrations/services/sms.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [SmsModule, PrismaModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
