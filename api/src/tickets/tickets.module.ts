// api/src/tickets/tickets.module.ts
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConfigModule } from '@nestjs/config';
import { TicketsController } from './tickets.controller';
import { TicketsAdminController } from './tickets-admin.controller';
import { TicketCategoriesAdminController } from './ticket-categories-admin.controller';
import { TicketsService } from './tickets.service';
import { TicketsAdminService } from './tickets-admin.service';
import { TicketsSlaWorkerService } from './sla-worker.service';
import { STORAGE_SERVICE } from './storage/storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    NotificationsModule,
    // memoryStorage لازم است چون در سرویس از file.buffer برای آپلود مستقیم به S3 استفاده می‌کنیم
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // هماهنگ با TICKET_MAX_FILE_SIZE_BYTES
    }),
  ],
  controllers: [
    TicketsController,
    TicketsAdminController,
    TicketCategoriesAdminController,
  ],
  providers: [
    TicketsService,
    TicketsAdminService,
    // @Cron در این سرویس توسط ScheduleExplorer در سطح کل اپ کشف می‌شود؛
    // ScheduleModule.forRoot() همین الان در MarketModule (global) فعال است.
    TicketsSlaWorkerService,
    { provide: STORAGE_SERVICE, useClass: S3StorageService },
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
