// api/src/zarpayesh/zarpayesh.module.ts
import { Module } from '@nestjs/common';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import { ZarPayeshApiLogService } from './zarpayesh-api-log.service';
import { ZarPayeshClientService } from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { ZarPayeshTradeService } from './zarpayesh-trade.service';
import { ZarPayeshDeliveryService } from './zarpayesh-delivery.service';
import { ZarPayeshAdminService } from './zarpayesh-admin.service';
import { ZarPayeshAdminController } from './zarpayesh-admin.controller';

/**
 * سامانه ناظر بر خرید و فروش بر خط طلا و نقره (زر پایش — api.rpmms.ir).
 * Prisma، Redis و سرویس‌های اعتبارنامه‌ی لایه‌ی Integration سراسری (Global) هستند.
 */
@Module({
  controllers: [ZarPayeshAdminController],
  providers: [
    ZarPayeshConfigService,
    ZarPayeshApiLogService,
    ZarPayeshClientService,
    ZarPayeshUsersService,
    ZarPayeshTradeService,
    ZarPayeshDeliveryService,
    ZarPayeshAdminService,
  ],
  exports: [ZarPayeshTradeService],
})
export class ZarPayeshModule {}
