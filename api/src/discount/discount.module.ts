// api/src/discount/discount.module.ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DiscountService } from './discount.service';
import { DiscountController } from './discount.controller';
import { DiscountAdminController } from './discount-admin.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [DiscountController, DiscountAdminController],
  providers: [DiscountService],
  exports: [DiscountService],
})
export class DiscountModule {}
