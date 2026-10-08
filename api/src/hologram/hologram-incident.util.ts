// api/src/hologram/hologram-incident.util.ts
//
// کمکی‌های بدون وابستگی (DI) برای گزارش سرقت/مفقودی شمش — تا ماژول‌های دیگر (فروش نماینده،
// تخصیص به سفارش، انتقال مالکیت) بدون وابستگی چرخه‌ای همین قاعده را اعمال کنند.
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** وضعیت‌هایی که شمش را «گزارش‌شده» نگه می‌دارند */
export const ACTIVE_INCIDENT_STATUSES = ['OPEN', 'CONFIRMED'] as const;

export const INCIDENT_TYPE_FA: Record<string, string> = {
  THEFT: 'سرقت',
  LOSS: 'مفقودی',
};

export const INCIDENT_STATUS_FA: Record<string, string> = {
  OPEN: 'ثبت‌شده — در انتظار بررسی',
  CONFIRMED: 'تأییدشده',
  RECOVERED: 'بازیابی‌شده',
  REJECTED: 'ردشده',
  CANCELLED: 'لغوشده توسط گزارش‌دهنده',
};

export function findActiveIncident(db: Db, hologramCodeId: string) {
  return db.hologramIncidentReport.findFirst({
    where: {
      hologramCodeId,
      status: { in: [...ACTIVE_INCIDENT_STATUSES] },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** شمشی که گزارش سرقت/مفقودی فعال دارد قابل انتقال، تخصیص یا فروش نیست */
export async function assertNoActiveIncident(
  db: Db,
  hologramCodeId: string,
): Promise<void> {
  const incident = await findActiveIncident(db, hologramCodeId);
  if (incident) {
    throw new ConflictException(
      `برای این شمش گزارش «${INCIDENT_TYPE_FA[incident.type]}» (شماره ${incident.reportNumber}) ثبت شده است؛ تا رسیدگی و بسته‌شدن گزارش، هیچ انتقال یا فروشی برای آن مجاز نیست`,
    );
  }
}
