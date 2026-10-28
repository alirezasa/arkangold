// api/src/livechat/livechat.module.ts — چت آنلاین پشتیبانی (جایگزین گفتینو)
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketModule } from '../market/market.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { STORAGE_SERVICE } from '../tickets/storage/storage.service';
import { S3StorageService } from '../tickets/storage/s3-storage.service';
import { LivechatService } from './livechat.service';
import { LivechatSettingsService } from './livechat-settings.service';
import { LivechatRealtimeService } from './livechat-realtime.service';
import { LivechatBotService } from './livechat-bot.service';
import { LivechatSmartService } from './livechat-smart.service';
import { LivechatStorageService } from './livechat-storage.service';
import { LivechatOperatorsService } from './livechat-operators.service';
import { LivechatAdminService } from './livechat-admin.service';
import { LivechatCronService } from './livechat-cron.service';
import { LivechatGateway } from './livechat.gateway';
import { LivechatPublicController } from './livechat-public.controller';
import { LivechatAdminController } from './livechat-admin.controller';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    NotificationsModule,
    MarketModule,
    SystemConfigModule,
  ],
  controllers: [LivechatPublicController, LivechatAdminController],
  providers: [
    LivechatService,
    LivechatSettingsService,
    LivechatRealtimeService,
    LivechatBotService,
    LivechatSmartService,
    LivechatStorageService,
    LivechatOperatorsService,
    LivechatAdminService,
    LivechatCronService,
    LivechatGateway,
    { provide: STORAGE_SERVICE, useClass: S3StorageService },
  ],
})
export class LivechatModule {}
