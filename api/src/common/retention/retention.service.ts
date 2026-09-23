// api/src/common/retention/retention.service.ts
// FCS_CKM_EXT.1.4 (حذف خودکار و ایمن داده‌ی حساس طبق خط‌مشی نگهداری) و FCS_CKM_EXT.1.2:
// نشست‌ها و کدهای یک‌بارمصرف منقضی‌شده (شامل hash توکن‌ها و کدها) روزانه از دیتابیس حذف می‌شوند.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // هر روز ساعت ۰۳:۳۰ UTC
  @Cron('0 30 3 * * *', { name: 'security-retention', timeZone: 'UTC' })
  async purgeExpired(): Promise<Record<string, number>> {
    const now = new Date();
    const [userSessions, adminSessions, otps] = await Promise.all([
      this.prisma.userSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.userOtp.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    const counts = {
      userSessions: userSessions.count,
      adminSessions: adminSessions.count,
      otps: otps.count,
    };
    this.logger.log(`پاک‌سازی داده‌های منقضی: ${JSON.stringify(counts)}`);
    await this.auditService.logUser({
      userId: null,
      action: 'system.retention_purge',
      source: RetentionService.name,
      success: true,
      newValue: counts,
    });
    return counts;
  }
}
