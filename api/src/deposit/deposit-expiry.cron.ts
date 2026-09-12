// api/src/deposit/deposit-expiry.cron.ts

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DepositExpiryCron {
  private readonly logger = new Logger(DepositExpiryCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * فقط درخواست‌هایی که هنوز رسیدی برایشان نیامده منقضی می‌شوند.
   * اگر کاربر رسید فرستاده باشد، حتی با گذشت مهلت، درخواست در صف
   * بررسی می‌ماند — پول واریزشده نباید به‌خاطر تایمر گم شود.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleRequests() {
    const now = new Date();

    const stale = await this.prisma.depositRequest.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lt: now } },
      select: { id: true, proformaInvoiceId: true, requestNumber: true },
      take: 200,
    });
    if (!stale.length) return;

    for (const d of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${d.id}::uuid FOR UPDATE`;
          const fresh = await tx.depositRequest.findUnique({
            where: { id: d.id },
          });
          if (fresh?.status !== 'PENDING_PAYMENT') return; // کاربر همین لحظه رسید فرستاد

          await tx.depositRequest.update({
            where: { id: d.id },
            data: { status: 'EXPIRED' },
          });

          if (d.proformaInvoiceId) {
            await tx.invoice.update({
              where: { id: d.proformaInvoiceId },
              data: {
                status: 'EXPIRED',
                cancelReason: 'گذشت مهلت اعتبار پیش‌فاکتور',
              },
            });
          }
        });
      } catch (err) {
        this.logger.error(
          `[DepositCron] انقضای ${d.requestNumber} ناموفق بود: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `[DepositCron] ${stale.length} درخواست واریز منقضی بررسی شد`,
    );
  }
}
