// api/src/referral/referral.module.ts
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { ReferralAdminController } from './referral-admin.controller';

@Module({
  imports: [AccountingModule, NotificationsModule],
  controllers: [ReferralController, ReferralAdminController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
