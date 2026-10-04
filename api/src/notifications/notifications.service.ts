// api/src/notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../integrations/services/sms.service';
import { NotificationType } from '../generated/prisma';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';

/**
 * لایه نازک بالای SmsService برای پیامک‌های متن آزاد (تیکت، دعوت از دوستان و ...):
 * برای کاربر هم پیامک ارسال می‌کند هم رکورد Notification ثبت می‌کند؛ برای شماره‌های
 * دیگر (مثلاً موبایل ادمین) فقط پیامک ارسال می‌شود. هر ارسال در sms_logs ثبت می‌شود.
 * شکست پیامک هرگز جریان اصلی کسب‌وکار (ثبت تیکت، تغییر وضعیت و...) را نمی‌شکند.
 *
 * پیامک رویدادهای قالب‌دار (سفارش، مالی، OTP، قرارداد) از SmsTemplateService ارسال می‌شود.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async notifyUserSms(userId: string, text: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true },
      });
      if (!user?.phone) return;

      const ok = await this.sendAndLog(user.phone, text, userId);
      if (!ok) return;

      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.SMS,
          content: text,
          sentAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(
        `ارسال پیامک به کاربر ${userId} ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  async notifyPhoneSms(phone: string, text: string): Promise<void> {
    await this.sendAndLog(phone, text, null);
  }

  private async sendAndLog(
    phone: string,
    text: string,
    userId: string | null,
  ): Promise<boolean> {
    const mobile = normalizeIranMobile(phone) ?? phone;
    try {
      const res = await this.sms.send({ phone: mobile, text });
      await this.prisma.smsLog
        .create({
          data: {
            phone: mobile,
            userId,
            providerCode: res.providerCode,
            text: text.slice(0, 2000),
            status: res.dryRun ? 'DRY_RUN' : 'SENT',
            providerMessageId: res.providerRequestId ?? null,
            cost: typeof res.cost === 'number' ? res.cost : null,
            referenceType: 'GENERAL',
          },
        })
        .catch(() => undefined);
      return true;
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`ارسال پیامک به ${mobile} ناموفق بود: ${message}`);
      await this.prisma.smsLog
        .create({
          data: {
            phone: mobile,
            userId,
            text: text.slice(0, 2000),
            status: 'FAILED',
            errorMessage: message.slice(0, 500),
            referenceType: 'GENERAL',
          },
        })
        .catch(() => undefined);
      return false;
    }
  }
}
