// api/src/livechat/livechat-cron.service.ts
// کارهای دوره‌ای چت: انتقال صف بی‌پاسخ به حالت آفلاین، تخصیص صف و بستن گفتگوهای بی‌فعالیت
import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { LivechatService } from './livechat.service';

@Injectable()
export class LivechatCronService {
  private readonly logger = new Logger(LivechatCronService.name);
  private running = false;

  constructor(private readonly livechat: LivechatService) {}

  @Interval(30_000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.livechat.drainQueue();
      await this.livechat.expireQueue();
      await this.livechat.autoCloseIdle();
    } catch (err) {
      this.logger.warn(`کار دوره‌ای چت ناموفق بود: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** پاک‌سازی بازدیدکنندگان بی‌گفتگوی قدیمی (بازدیدهای گذرا، خزنده‌ها) — هر شب ۰۴:۰۰ تهران (۰۰:۳۰ UTC) */
  @Cron('0 30 0 * * *')
  async prune() {
    try {
      await this.livechat.pruneStaleVisitors();
    } catch (err) {
      this.logger.warn(
        `پاک‌سازی بازدیدکنندگان چت ناموفق بود: ${(err as Error).message}`,
      );
    }
  }
}
