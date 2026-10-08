// api/src/hologram/hologram-incident.service.ts
//
// گزارش سرقت/مفقودی شمش:
//   - مالک از پنل کاربری اعلام می‌کند (یا کارشناس برای شمش خزانه/نماینده ثبت می‌کند)؛
//   - هشدار از لحظه‌ی ثبت فعال است و در همه‌ی کانال‌های استعلام نمایش داده می‌شود؛
//   - تا گزارش فعال است، انتقال مالکیت/تخصیص/فروش شمش مسدود است (assertNoActiveIncident)؛
//   - مدیریت گزارش را تأیید، رد یا «بازیابی‌شده» اعلام می‌کند و هر استعلامی که پس از
//     گزارش روی این شمش انجام شود (IP، کانال، کاربر/نماینده) در پرونده‌ی گزارش دیده می‌شود.
//
// ماشین وضعیت:
//   OPEN ──تأیید──► CONFIRMED
//   OPEN | CONFIRMED ──رد──► REJECTED   (پایانی)
//   OPEN | CONFIRMED ──بازیابی──► RECOVERED (پایانی)
//   OPEN ──لغو توسط مالک──► CANCELLED (پایانی)
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { HologramTransferService } from './hologram-transfer.service';
import {
  ACTIVE_INCIDENT_STATUSES,
  findActiveIncident,
  INCIDENT_STATUS_FA,
  INCIDENT_TYPE_FA,
} from './hologram-incident.util';
import { isValidHologramCodeFormat } from './hologram-code.util';
import {
  AdminCreateHologramIncidentDto,
  CreateHologramIncidentDto,
  GetHologramIncidentsQueryDto,
} from '@arkan-gold/shared';

type IncidentStatus =
  'OPEN' | 'CONFIRMED' | 'RECOVERED' | 'REJECTED' | 'CANCELLED';

const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  OPEN: ['CONFIRMED', 'REJECTED', 'RECOVERED', 'CANCELLED'],
  CONFIRMED: ['REJECTED', 'RECOVERED'],
  RECOVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

const REPORT_INCLUDE = {
  hologramCode: {
    select: {
      id: true,
      code: true,
      status: true,
      weightGrams: true,
      purityKarat: true,
      factorySerialNumber: true,
      batch: { select: { batchNumber: true } },
      product: { select: { id: true, name: true } },
      agent: { select: { id: true, code: true, name: true } },
    },
  },
  reportedByUser: { select: { id: true, phone: true } },
  reportedByAdmin: { select: { id: true, fullName: true } },
  reviewedByAdmin: { select: { id: true, fullName: true } },
} satisfies Prisma.HologramIncidentReportInclude;

@Injectable()
export class HologramIncidentService {
  private readonly logger = new Logger(HologramIncidentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentSequence: DocumentSequenceService,
    private readonly transferService: HologramTransferService,
    private readonly smsTemplates: SmsTemplateService,
  ) {}

  // ══════════════════════════════════════════
  // پنل کاربری — اعلام توسط مالک
  // ══════════════════════════════════════════
  async createByOwner(userId: string, dto: CreateHologramIncidentDto) {
    const report = await this.runCreate(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "id" = ${dto.hologramCodeId}::uuid FOR UPDATE`;
      const code = await tx.hologramCode.findUnique({
        where: { id: dto.hologramCodeId },
        include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
      });
      if (!code) throw new NotFoundException('شمش یافت نشد');

      const owner = code.ownerships[0];
      if (!owner || owner.ownerUserId !== userId) {
        throw new ForbiddenException(
          'فقط مالک فعلی شمش می‌تواند سرقت یا مفقودی آن را اعلام کند',
        );
      }
      await this.assertNoActiveReport(tx, code.id);

      // انتقالی که خود مالک آغاز کرده و هنوز تأیید نشده لغو می‌شود تا شمش گزارش‌شده
      // به نام کس دیگری ثبت نشود
      if (code.status === 'TRANSFER_PENDING') {
        await this.transferService.cancelPendingForCode(
          tx,
          code.id,
          'ثبت گزارش سرقت/مفقودی توسط مالک',
        );
        await tx.hologramCode.update({
          where: { id: code.id },
          data: { status: 'ASSIGNED' },
        });
      }

      return tx.hologramIncidentReport.create({
        data: {
          reportNumber: await this.documentSequence.next(tx, 'HIR'),
          hologramCodeId: code.id,
          type: dto.type,
          status: 'OPEN',
          reportedByUserId: userId,
          ownerFullName: owner.fullName,
          ownerNationalCode: owner.nationalCode,
          ...this.details(dto),
        },
        include: { hologramCode: { select: { code: true } } },
      });
    });

    this.logger.warn(
      `[HologramIncident] گزارش ${INCIDENT_TYPE_FA[report.type]} ${report.reportNumber} برای شمش ${report.hologramCode.code} توسط مالک ${userId} ثبت شد`,
    );
    this.notify(userId, 'HOLOGRAM_INCIDENT_REPORTED', report);
    return report;
  }

  async listMine(userId: string) {
    const items = await this.prisma.hologramIncidentReport.findMany({
      where: { reportedByUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        hologramCode: {
          select: {
            id: true,
            code: true,
            weightGrams: true,
            purityKarat: true,
            batch: { select: { batchNumber: true } },
          },
        },
      },
    });
    return { data: items };
  }

  /** مالک تا پیش از تأیید مدیریت می‌تواند گزارش را پس بگیرد (مثلاً شمش پیدا شد) */
  async cancelByOwner(userId: string, id: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const report = await this.lockReport(tx, id);
      if (report.reportedByUserId !== userId) {
        throw new NotFoundException('گزارش یافت نشد');
      }
      if (report.status === 'CANCELLED') {
        return {
          message: 'این گزارش قبلاً لغو شده است',
          alreadyProcessed: true,
        };
      }
      if (report.status !== 'OPEN') {
        throw new ConflictException(
          report.status === 'CONFIRMED'
            ? 'این گزارش توسط مدیریت تأیید شده است؛ برای اعلام پیدا شدن شمش با پشتیبانی تماس بگیرید'
            : 'این گزارش دیگر قابل لغو نیست',
        );
      }
      await tx.hologramIncidentReport.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          closedAt: new Date(),
          closeReason: reason?.trim() || 'لغو توسط مالک',
        },
      });
      return { message: 'گزارش لغو شد', alreadyProcessed: false };
    });
  }

  // ══════════════════════════════════════════
  // پنل ادمین — مدیریت گزارش‌ها
  // ══════════════════════════════════════════
  async createByAdmin(adminId: string, dto: AdminCreateHologramIncidentDto) {
    if (!isValidHologramCodeFormat(dto.code)) {
      throw new BadRequestException('کد هولوگرام معتبر نیست');
    }
    const report = await this.runCreate(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "hologram_codes" WHERE "code" = ${dto.code} FOR UPDATE`;
      const code = await tx.hologramCode.findUnique({
        where: { code: dto.code },
        include: { ownerships: { where: { status: 'ACTIVE' }, take: 1 } },
      });
      if (!code) throw new NotFoundException('کد هولوگرام یافت نشد');
      if (code.status === 'REVOKED') {
        throw new ConflictException('این کد باطل شده است');
      }
      await this.assertNoActiveReport(tx, code.id);

      if (code.status === 'TRANSFER_PENDING') {
        // انتقال در جریان (هدیه/فروش یا تخصیص اولیه) لغو و کد به وضعیت قبلی برمی‌گردد
        const pending = await tx.ownershipTransferRequest.findFirst({
          where: { hologramCodeId: code.id, status: 'PENDING' },
        });
        await this.transferService.cancelPendingForCode(
          tx,
          code.id,
          'ثبت گزارش سرقت/مفقودی توسط مدیریت',
        );
        await tx.hologramCode.update({
          where: { id: code.id },
          data:
            pending?.transferType === 'INITIAL_PURCHASE'
              ? {
                  status: 'UNASSIGNED',
                  shopOrderItemId: null,
                  assignedByAdminId: null,
                  assignedAt: null,
                }
              : { status: 'ASSIGNED' },
        });
      }

      const owner = code.ownerships[0];
      return tx.hologramIncidentReport.create({
        data: {
          reportNumber: await this.documentSequence.next(tx, 'HIR'),
          hologramCodeId: code.id,
          type: dto.type,
          // گزارشی که کارشناس ثبت می‌کند نیازی به بررسی مجدد ندارد
          status: 'CONFIRMED',
          reportedByAdminId: adminId,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          ownerFullName: owner?.fullName ?? null,
          ownerNationalCode: owner?.nationalCode ?? null,
          ...this.details(dto),
        },
        include: { hologramCode: { select: { code: true } } },
      });
    });

    this.logger.warn(
      `[HologramIncident] گزارش ${INCIDENT_TYPE_FA[report.type]} ${report.reportNumber} برای شمش ${report.hologramCode.code} توسط ادمین ${adminId} ثبت شد`,
    );
    return report;
  }

  async confirm(adminId: string, id: string, note?: string) {
    return this.transition(adminId, id, 'CONFIRMED', { adminNote: note });
  }

  async reject(adminId: string, id: string, reason: string) {
    return this.transition(adminId, id, 'REJECTED', { closeReason: reason });
  }

  async recover(adminId: string, id: string, reason: string) {
    return this.transition(adminId, id, 'RECOVERED', { closeReason: reason });
  }

  private async transition(
    adminId: string,
    id: string,
    to: IncidentStatus,
    data: { adminNote?: string; closeReason?: string },
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const report = await this.lockReport(tx, id);
      if (report.status === to) return null; // idempotent
      if (!TRANSITIONS[report.status].includes(to)) {
        throw new ConflictException(
          `تغییر وضعیت گزارش از «${INCIDENT_STATUS_FA[report.status]}» به «${INCIDENT_STATUS_FA[to]}» مجاز نیست`,
        );
      }
      const closing = to !== 'CONFIRMED';
      return tx.hologramIncidentReport.update({
        where: { id },
        data: {
          status: to,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          ...(data.adminNote?.trim()
            ? { adminNote: data.adminNote.trim() }
            : {}),
          ...(closing
            ? { closedAt: new Date(), closeReason: data.closeReason?.trim() }
            : {}),
        },
        include: { hologramCode: { select: { code: true } } },
      });
    });

    if (!updated) {
      return {
        message: 'وضعیت گزارش قبلاً ثبت شده است',
        alreadyProcessed: true,
      };
    }
    this.logger.log(
      `[HologramIncident] گزارش ${updated.reportNumber} توسط ادمین ${adminId} به «${INCIDENT_STATUS_FA[to]}» تغییر کرد`,
    );
    if (updated.reportedByUserId) {
      this.notify(
        updated.reportedByUserId,
        'HOLOGRAM_INCIDENT_UPDATED',
        updated,
      );
    }
    return { message: 'وضعیت گزارش به‌روزرسانی شد', alreadyProcessed: false };
  }

  async list(query: GetHologramIncidentsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.HologramIncidentReportWhereInput = {
      ...(query.status
        ? { status: query.status }
        : query.activeOnly
          ? { status: { in: [...ACTIVE_INCIDENT_STATUSES] } }
          : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(search
        ? {
            OR: [
              { reportNumber: { contains: search, mode: 'insensitive' } },
              { hologramCode: { code: { contains: search } } },
              { ownerFullName: { contains: search, mode: 'insensitive' } },
              { ownerNationalCode: { contains: search } },
              { reportedByUser: { phone: { contains: search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.hologramIncidentReport.findMany({
        where,
        // گزارش‌های فعال اول، سپس جدیدترها
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          ...REPORT_INCLUDE,
          _count: { select: { inquiryLogs: true } },
        },
      }),
      this.prisma.hologramIncidentReport.count({ where }),
    ]);

    return {
      data: items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  /** گزارش مدیریتی: وضعیت گزارش‌ها و ردپای استعلام شمش‌های گزارش‌شده */
  async summary() {
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [grouped, flaggedInquiries30d, recentFlaggedInquiries] =
      await Promise.all([
        this.prisma.hologramIncidentReport.groupBy({
          by: ['status', 'type'],
          _count: { _all: true },
        }),
        this.prisma.hologramInquiryLog.count({
          where: {
            incidentReportId: { not: null },
            createdAt: { gte: since30d },
          },
        }),
        this.prisma.hologramInquiryLog.findMany({
          where: { incidentReportId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: this.inquiryLogInclude(),
        }),
      ]);

    const count = (statuses: string[], type?: string) =>
      grouped
        .filter(
          (g) => statuses.includes(g.status) && (!type || g.type === type),
        )
        .reduce((sum, g) => sum + g._count._all, 0);

    return {
      activeTheft: count([...ACTIVE_INCIDENT_STATUSES], 'THEFT'),
      activeLoss: count([...ACTIVE_INCIDENT_STATUSES], 'LOSS'),
      awaitingReview: count(['OPEN']),
      confirmed: count(['CONFIRMED']),
      recovered: count(['RECOVERED']),
      rejected: count(['REJECTED']),
      cancelled: count(['CANCELLED']),
      total: count(['OPEN', 'CONFIRMED', 'RECOVERED', 'REJECTED', 'CANCELLED']),
      flaggedInquiries30d,
      recentFlaggedInquiries,
    };
  }

  async getDetail(id: string) {
    const report = await this.prisma.hologramIncidentReport.findUnique({
      where: { id },
      include: {
        ...REPORT_INCLUDE,
        inquiryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: this.inquiryLogInclude(),
        },
      },
    });
    if (!report) throw new NotFoundException('گزارش یافت نشد');

    const [currentOwner, history] = await Promise.all([
      this.prisma.hologramOwnership.findFirst({
        where: { hologramCodeId: report.hologramCodeId, status: 'ACTIVE' },
        select: {
          fullName: true,
          nationalCode: true,
          ownershipStartAt: true,
          ownerUser: { select: { id: true, phone: true } },
        },
      }),
      this.prisma.hologramIncidentReport.findMany({
        where: { hologramCodeId: report.hologramCodeId, id: { not: id } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reportNumber: true,
          type: true,
          status: true,
          createdAt: true,
          closedAt: true,
        },
      }),
    ]);

    return { ...report, currentOwner, history };
  }

  // ══════════════════════════════════════════
  // کمکی‌ها
  // ══════════════════════════════════════════

  /** گزارش‌های فعال یک مجموعه شمش — برای نشانه‌گذاری در فهرست‌ها */
  async activeByCodeIds(codeIds: string[]) {
    if (!codeIds.length) return new Map<string, ActiveIncidentSummary>();
    const rows = await this.prisma.hologramIncidentReport.findMany({
      where: {
        hologramCodeId: { in: codeIds },
        status: { in: [...ACTIVE_INCIDENT_STATUSES] },
      },
      select: ACTIVE_INCIDENT_SELECT,
    });
    return new Map(rows.map((r) => [r.hologramCodeId, r]));
  }

  private inquiryLogInclude() {
    return {
      user: { select: { id: true, phone: true } },
      adminUser: {
        select: {
          id: true,
          fullName: true,
          agent: { select: { id: true, code: true, name: true } },
        },
      },
      hologramCode: { select: { code: true } },
      incidentReport: { select: { id: true, reportNumber: true, type: true } },
    } satisfies Prisma.HologramInquiryLogInclude;
  }

  private details(dto: {
    description: string;
    incidentAt?: string;
    incidentLocation?: string;
    policeReportNumber?: string;
    contactPhone?: string;
  }) {
    const incidentAt = dto.incidentAt ? new Date(dto.incidentAt) : null;
    if (incidentAt && incidentAt.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('تاریخ وقوع نمی‌تواند در آینده باشد');
    }
    return {
      description: dto.description.trim(),
      incidentAt,
      incidentLocation: dto.incidentLocation?.trim() || null,
      policeReportNumber: dto.policeReportNumber?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
    };
  }

  private async assertNoActiveReport(
    tx: Prisma.TransactionClient,
    hologramCodeId: string,
  ) {
    const existing = await findActiveIncident(tx, hologramCodeId);
    if (existing) {
      throw new ConflictException(
        `برای این شمش قبلاً گزارش «${INCIDENT_TYPE_FA[existing.type]}» با شماره ${existing.reportNumber} ثبت شده و در حال پیگیری است`,
      );
    }
  }

  private async lockReport(tx: Prisma.TransactionClient, id: string) {
    await tx.$executeRaw`SELECT 1 FROM "hologram_incident_reports" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const report = await tx.hologramIncidentReport.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException('گزارش یافت نشد');
    return report;
  }

  /** ثبت همزمان دو گزارش فعال برای یک شمش به partial unique index برخورد می‌کند */
  private async runCreate<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        maxWait: 5000,
        timeout: 15000,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'برای این شمش همین حالا یک گزارش فعال ثبت شده است',
        );
      }
      throw err;
    }
  }

  private notify(
    userId: string,
    key: 'HOLOGRAM_INCIDENT_REPORTED' | 'HOLOGRAM_INCIDENT_UPDATED',
    report: {
      id: string;
      reportNumber: string;
      type: string;
      status: string;
      hologramCode: { code: string };
    },
  ) {
    void this.smsTemplates
      .sendToUser(
        key,
        userId,
        {
          hologramCode: report.hologramCode.code,
          requestNumber: report.reportNumber,
          incidentType: INCIDENT_TYPE_FA[report.type],
          status: INCIDENT_STATUS_FA[report.status],
        },
        { referenceType: 'HOLOGRAM_INCIDENT', referenceId: report.id },
      )
      .catch(() => undefined);
  }
}

export const ACTIVE_INCIDENT_SELECT = {
  id: true,
  hologramCodeId: true,
  reportNumber: true,
  type: true,
  status: true,
  createdAt: true,
} satisfies Prisma.HologramIncidentReportSelect;

export type ActiveIncidentSummary = Prisma.HologramIncidentReportGetPayload<{
  select: typeof ACTIVE_INCIDENT_SELECT;
}>;
