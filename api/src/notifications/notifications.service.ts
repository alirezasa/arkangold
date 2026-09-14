// api/src/notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../integrations/services/sms.service';
import { NotificationType } from '../generated/prisma';

/**
 * لایه نازک بالای SmsService: برای کاربر هم پیامک ارسال می‌کند هم رکورد
 * Notification ثبت می‌کند؛ برای شماره‌های دیگر (مثلاً موبایل ادمین) فقط پیامک
 * ارسال می‌شود. شکست پیامک هرگز جریان اصلی کسب‌وکار (ثبت تیکت، تغییر وضعیت و...)
 * را نمی‌شکند — فقط لاگ می‌شود.
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

      await this.sms.send({ phone: user.phone, text });

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
    try {
      await this.sms.send({ phone, text });
    } catch (err) {
      this.logger.warn(
        `ارسال پیامک به ${phone} ناموفق بود: ${(err as Error).message}`,
      );
    }
  }
}
