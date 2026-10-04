// api/src/agent/agent-contract.service.ts
//
// قرارداد الکترونیک نمایندگان:
//   پیش‌نویس (از قالب یا متن آزاد) ← صدور (متن قفل + SHA-256) ← مشاهده در پرتال نماینده
//   ← درخواست کد یکبارمصرف ۶ رقمی به موبایل ثبت‌شده‌ی نماینده ← پذیرش و امضا با کد
//   ← گواهی امضا (زمان، امضاکننده، موبایل، IP، دستگاه، hash) و به‌روزرسانی اطلاعات قرارداد نماینده.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import {
  formatJalaliDate,
  formatJalaliDateTime,
} from '../common/utils/jalali.util';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import {
  CONTRACT_VARIABLES,
  DEFAULT_CONTRACT_BODY,
  DEFAULT_CONTRACT_TITLE,
} from './agent-contract.template';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_GAP_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS = 6;

export interface ContractActor {
  adminUserId: string;
  ip?: string;
  userAgent?: string;
}

export const CONTRACT_STATUS_FA: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  ISSUED: 'در انتظار امضای نماینده',
  SIGNED: 'امضاشده',
  CANCELLED: 'ابطال‌شده',
  EXPIRED: 'منقضی (امضا نشد)',
};

@Injectable()
export class AgentContractService implements OnModuleInit {
  private readonly logger = new Logger(AgentContractService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentSequence: DocumentSequenceService,
    private readonly systemConfig: SystemConfigService,
    private readonly smsTemplates: SmsTemplateService,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.prisma.agentContractTemplate.count();
      if (count === 0) {
        await this.prisma.agentContractTemplate.create({
          data: {
            title: DEFAULT_CONTRACT_TITLE,
            body: DEFAULT_CONTRACT_BODY,
            description:
              'قالب پیش‌فرض سیستم — پیش از استفاده‌ی رسمی توسط مشاور حقوقی بازبینی شود',
          },
        });
        this.logger.log('[Agent] قالب پیش‌فرض قرارداد نمایندگی ساخته شد');
      }
    } catch (err) {
      this.logger.error(
        `[Agent] ساخت قالب قرارداد ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  // ═══════════════════════════ قالب‌ها ═══════════════════════════

  async listTemplates() {
    const rows = await this.prisma.agentContractTemplate.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      include: { _count: { select: { contracts: true } } },
    });
    return {
      variables: CONTRACT_VARIABLES,
      items: rows.map(({ _count, ...t }) => ({
        ...t,
        contractCount: _count.contracts,
      })),
    };
  }

  async createTemplate(
    dto: { title: string; body: string; description?: string },
    adminId: string,
  ) {
    this.validateBody(dto.body);
    const row = await this.prisma.agentContractTemplate.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        description: dto.description?.trim() || null,
        createdById: adminId,
        updatedById: adminId,
      },
    });
    return { message: 'قالب قرارداد ایجاد شد', template: row };
  }

  async updateTemplate(
    id: string,
    dto: {
      title?: string;
      body?: string;
      description?: string | null;
      isActive?: boolean;
    },
    adminId: string,
  ) {
    const row = await this.prisma.agentContractTemplate.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('قالب قرارداد یافت نشد');
    if (dto.body !== undefined) this.validateBody(dto.body);
    const bodyChanged = dto.body !== undefined && dto.body.trim() !== row.body;
    const updated = await this.prisma.agentContractTemplate.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(bodyChanged ? { version: { increment: 1 } } : {}),
        updatedById: adminId,
      },
    });
    return { message: 'قالب قرارداد ذخیره شد', template: updated };
  }

  private validateBody(body: string) {
    const b = body?.trim() ?? '';
    if (b.length < 50)
      throw new BadRequestException('متن قرارداد بسیار کوتاه است');
    if (b.length > 60_000)
      throw new BadRequestException('متن قرارداد بیش از حد طولانی است');
    const allowed = new Set(CONTRACT_VARIABLES.map((v) => v.name));
    const unknown = [...b.matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1])
      .filter((n) => !allowed.has(n));
    if (unknown.length) {
      throw new BadRequestException(
        `متغیر ناشناخته در متن: ${[...new Set(unknown)].map((u) => `{${u}}`).join('، ')}`,
      );
    }
  }

  // ═══════════════════════════ رندر متن ═══════════════════════════

  private async contractVars(
    agent: Prisma.AgentGetPayload<object>,
    contractNumber: string,
    startsAt: Date | null,
    endsAt: Date | null,
  ): Promise<Record<string, string>> {
    const company = await this.systemConfig.getGroup('company.');
    const commission =
      agent.commissionType === 'PERCENT'
        ? `${Number(agent.commissionValue).toLocaleString('fa-IR')} درصد مبلغ فروش`
        : agent.commissionType === 'PER_GRAM'
          ? `${Math.round(Number(agent.commissionValue) / 10).toLocaleString('fa-IR')} تومان به ازای هر گرم`
          : `${Math.round(Number(agent.commissionValue) / 10).toLocaleString('fa-IR')} تومان به ازای هر شمش`;
    const dash = '—';
    return {
      contractNumber,
      today: formatJalaliDate(new Date()),
      startDate: startsAt ? formatJalaliDate(startsAt) : dash,
      endDate: endsAt ? formatJalaliDate(endsAt) : dash,
      agentName: agent.name,
      agentCode: agent.code,
      managerName: agent.managerName,
      nationalCode: agent.nationalCode ?? dash,
      phone: agent.phone,
      address: agent.address ?? dash,
      city: agent.city ?? dash,
      province: agent.province ?? dash,
      postalCode: agent.postalCode ?? dash,
      commission,
      creditLimit: agent.creditLimitRial
        ? Math.round(Number(agent.creditLimitRial) / 10).toLocaleString('fa-IR')
        : 'بدون سقف',
      companyName:
        company['company.legal_name'] || company['company.brand_name'] || dash,
      companyNationalId: company['company.national_id'] || dash,
      companyRegistrationNumber: company['company.registration_number'] || dash,
      companyAddress: company['company.address'] || dash,
      companyPhone: company['company.phone'] || dash,
      brand: company['company.brand_name'] || 'آرکان گلد',
    };
  }

  private render(body: string, vars: Record<string, string>) {
    return body
      .replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m)
      .trim();
  }

  private sha256(s: string) {
    return createHash('sha256').update(s, 'utf8').digest('hex');
  }

  // ═══════════════════════════ مدیریت (پنل) ═══════════════════════════

  async listContracts(q: {
    agentId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 30));
    const where: Prisma.AgentContractWhereInput = {
      ...(q.agentId ? { agentId: q.agentId } : {}),
      ...(q.status
        ? { status: q.status as Prisma.EnumAgentContractStatusFilter['equals'] }
        : {}),
    };
    const [items, total, byStatus] = await Promise.all([
      this.prisma.agentContract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          contractNumber: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          signDeadline: true,
          issuedAt: true,
          signedAt: true,
          firstViewedAt: true,
          createdAt: true,
          agent: {
            select: {
              id: true,
              code: true,
              name: true,
              managerName: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.agentContract.count({ where }),
      this.prisma.agentContract.groupBy({
        by: ['status'],
        where: q.agentId ? { agentId: q.agentId } : {},
        _count: { _all: true },
      }),
    ]);
    return {
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      statusCounts: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count._all]),
      ),
      items: items.map((c) => ({
        ...c,
        statusLabel: CONTRACT_STATUS_FA[c.status],
      })),
    };
  }

  async getContractAdmin(contractId: string) {
    const c = await this.prisma.agentContract.findUnique({
      where: { id: contractId },
      include: {
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            managerName: true,
            phone: true,
            nationalCode: true,
          },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('قرارداد یافت نشد');
    return this.present(c, true);
  }

  async createDraft(
    agentId: string,
    dto: {
      templateId?: string;
      title?: string;
      body?: string;
      startsAt?: string;
      endsAt?: string;
      signDeadline?: string;
    },
    actor: ContractActor,
  ) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');
    if (agent.status === 'TERMINATED') {
      throw new ConflictException(
        'برای نماینده‌ی خاتمه‌یافته قرارداد صادر نمی‌شود',
      );
    }
    const template = dto.templateId
      ? await this.prisma.agentContractTemplate.findUnique({
          where: { id: dto.templateId },
        })
      : null;
    if (dto.templateId && (!template || !template.isActive)) {
      throw new BadRequestException('قالب قرارداد یافت نشد یا غیرفعال است');
    }
    const rawBody = dto.body?.trim() || template?.body;
    if (!rawBody)
      throw new BadRequestException('قالب یا متن قرارداد را مشخص کنید');
    this.validateBody(rawBody);

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException(
        'تاریخ پایان قرارداد باید بعد از تاریخ شروع باشد',
      );
    }

    const contract = await this.prisma.$transaction(async (tx) => {
      const contractNumber = await this.documentSequence.next(tx, 'CTR');
      const c = await tx.agentContract.create({
        data: {
          contractNumber,
          agentId,
          templateId: template?.id ?? null,
          templateVersion: template?.version ?? null,
          title: dto.title?.trim() || template?.title || DEFAULT_CONTRACT_TITLE,
          // متغیرها در زمان صدور دوباره جایگذاری می‌شوند تا اطلاعات به‌روز نماینده درج شود؛
          // پیش‌نویس متن خام قالب را نگه می‌دارد و پیش‌نمایش رندرشده برمی‌گردد
          body: rawBody,
          startsAt,
          endsAt,
          signDeadline: dto.signDeadline ? new Date(dto.signDeadline) : null,
          createdById: actor.adminUserId,
        },
      });
      await this.event(
        tx,
        c.id,
        'CREATED',
        'ADMIN',
        actor,
        template
          ? `از قالب «${template.title}» نسخه ${template.version}`
          : 'متن اختصاصی',
      );
      return c;
    });
    return {
      message: 'پیش‌نویس قرارداد ایجاد شد',
      id: contract.id,
      contractNumber: contract.contractNumber,
    };
  }

  async updateDraft(
    contractId: string,
    dto: {
      title?: string;
      body?: string;
      startsAt?: string | null;
      endsAt?: string | null;
      signDeadline?: string | null;
    },
    actor: ContractActor,
  ) {
    const c = await this.prisma.agentContract.findUnique({
      where: { id: contractId },
    });
    if (!c) throw new NotFoundException('قرارداد یافت نشد');
    if (c.status !== 'DRAFT')
      throw new ConflictException('فقط پیش‌نویس قابل ویرایش است');
    if (dto.body !== undefined) this.validateBody(dto.body);
    const startsAt =
      dto.startsAt === undefined
        ? c.startsAt
        : dto.startsAt
          ? new Date(dto.startsAt)
          : null;
    const endsAt =
      dto.endsAt === undefined
        ? c.endsAt
        : dto.endsAt
          ? new Date(dto.endsAt)
          : null;
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException(
        'تاریخ پایان قرارداد باید بعد از تاریخ شروع باشد',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.agentContract.update({
        where: { id: c.id },
        data: {
          ...(dto.title ? { title: dto.title.trim() } : {}),
          ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
          startsAt,
          endsAt,
          ...(dto.signDeadline !== undefined
            ? {
                signDeadline: dto.signDeadline
                  ? new Date(dto.signDeadline)
                  : null,
              }
            : {}),
        },
      });
      await this.event(tx, c.id, 'UPDATED', 'ADMIN', actor);
    });
    return { message: 'پیش‌نویس ذخیره شد' };
  }

  /** صدور: جایگذاری نهایی متغیرها با اطلاعات فعلی نماینده، قفل متن و اطلاع پیامکی به نماینده */
  async issue(contractId: string, actor: ContractActor) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_contracts" WHERE "id" = ${contractId}::uuid FOR UPDATE`;
      const c = await tx.agentContract.findUnique({
        where: { id: contractId },
        include: { agent: true },
      });
      if (!c) throw new NotFoundException('قرارداد یافت نشد');
      if (c.status !== 'DRAFT')
        throw new ConflictException('فقط پیش‌نویس قابل صدور است');
      if (!c.startsAt || !c.endsAt) {
        throw new BadRequestException(
          'پیش از صدور، تاریخ شروع و پایان قرارداد را مشخص کنید',
        );
      }
      if (!normalizeIranMobile(c.agent.phone)) {
        throw new BadRequestException(
          'شماره همراه نماینده نامعتبر است؛ امکان امضای الکترونیک وجود ندارد',
        );
      }
      const finalBody = this.render(
        c.body,
        await this.contractVars(
          c.agent,
          c.contractNumber,
          c.startsAt,
          c.endsAt,
        ),
      );
      const updated = await tx.agentContract.update({
        where: { id: c.id },
        data: {
          body: finalBody,
          bodyHash: this.sha256(finalBody),
          status: 'ISSUED',
          issuedAt: new Date(),
          issuedById: actor.adminUserId,
          signDeadline:
            c.signDeadline ?? new Date(Date.now() + 30 * 86_400_000),
        },
      });
      await this.event(tx, c.id, 'ISSUED', 'ADMIN', actor);
      return { c: updated, agent: c.agent };
    });
    await this.smsTemplates.send(
      'AGENT_CONTRACT_ISSUED',
      result.agent.phone,
      { agentName: result.agent.name, contractNumber: result.c.contractNumber },
      { referenceType: 'AGENT_CONTRACT', referenceId: result.c.id },
    );
    return { message: 'قرارداد صادر و برای امضای نماینده ارسال شد' };
  }

  async cancel(contractId: string, reason: string, actor: ContractActor) {
    const r = reason?.trim();
    if (!r || r.length < 5)
      throw new BadRequestException('دلیل ابطال را وارد کنید');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_contracts" WHERE "id" = ${contractId}::uuid FOR UPDATE`;
      const c = await tx.agentContract.findUnique({
        where: { id: contractId },
      });
      if (!c) throw new NotFoundException('قرارداد یافت نشد');
      if (c.status === 'CANCELLED') return;
      if (c.status === 'EXPIRED')
        throw new ConflictException('قرارداد منقضی‌شده قابل ابطال نیست');
      await tx.agentContract.update({
        where: { id: c.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: actor.adminUserId,
          cancelReason: r,
          otpHash: null,
          otpExpiresAt: null,
        },
      });
      await this.event(tx, c.id, 'CANCELLED', 'ADMIN', actor, r);
    });
    return { message: 'قرارداد ابطال شد' };
  }

  // ═══════════════════════════ پرتال نماینده ═══════════════════════════

  async listForAgent(agentId: string) {
    const rows = await this.prisma.agentContract.findMany({
      where: { agentId, status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        contractNumber: true,
        title: true,
        status: true,
        startsAt: true,
        endsAt: true,
        signDeadline: true,
        issuedAt: true,
        signedAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      statusLabel: CONTRACT_STATUS_FA[r.status],
    }));
  }

  async getForAgent(agentId: string, contractId: string, actor: ContractActor) {
    const c = await this.prisma.agentContract.findFirst({
      where: { id: contractId, agentId, status: { not: 'DRAFT' } },
      include: {
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            managerName: true,
            phone: true,
            nationalCode: true,
          },
        },
      },
    });
    if (!c) throw new NotFoundException('قرارداد یافت نشد');
    if (!c.firstViewedAt && c.status === 'ISSUED') {
      await this.prisma.$transaction(async (tx) => {
        await tx.agentContract.update({
          where: { id: c.id },
          data: { firstViewedAt: new Date() },
        });
        await this.event(tx, c.id, 'VIEWED', 'AGENT', actor);
      });
    }
    return this.present({ ...c, events: [] }, false);
  }

  async requestSignOtp(
    agentId: string,
    contractId: string,
    actor: ContractActor,
  ) {
    const prep = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_contracts" WHERE "id" = ${contractId}::uuid FOR UPDATE`;
      const c = await tx.agentContract.findFirst({
        where: { id: contractId, agentId },
        include: { agent: true },
      });
      if (!c) throw new NotFoundException('قرارداد یافت نشد');
      this.assertSignable(c);
      const now = Date.now();
      if (c.otpSentAt && now - c.otpSentAt.getTime() < OTP_RESEND_GAP_MS) {
        const wait = Math.ceil(
          (OTP_RESEND_GAP_MS - (now - c.otpSentAt.getTime())) / 1000,
        );
        throw new HttpException(
          `لطفاً ${wait.toLocaleString('fa-IR')} ثانیه دیگر دوباره تلاش کنید`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (c.otpSendCount >= OTP_MAX_SENDS) {
        throw new ForbiddenException(
          'سقف ارسال کد برای این قرارداد پر شده است؛ با پشتیبانی تماس بگیرید',
        );
      }
      const phone = normalizeIranMobile(c.agent.phone);
      if (!phone)
        throw new BadRequestException('شماره همراه نماینده نامعتبر است');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.agentContract.update({
        where: { id: c.id },
        data: {
          otpHash: this.otpHash(c.id, code),
          otpExpiresAt: new Date(now + OTP_TTL_MS),
          otpAttempts: 0,
          otpSentAt: new Date(now),
          otpSendCount: { increment: 1 },
        },
      });
      await this.event(
        tx,
        c.id,
        'OTP_SENT',
        'AGENT',
        actor,
        `ارسال کد به ${this.maskPhone(phone)}`,
      );
      return { phone, code, contractNumber: c.contractNumber };
    });

    try {
      await this.smsTemplates.send(
        'AGENT_CONTRACT_SIGN_OTP',
        prep.phone,
        { code: prep.code, contractNumber: prep.contractNumber },
        {
          throwOnFailure: true,
          referenceType: 'AGENT_CONTRACT',
          referenceId: contractId,
        },
      );
    } catch (err) {
      this.logger.error(
        `ارسال کد امضای قرارداد ${contractId} ناموفق بود: ${(err as Error).message}`,
      );
      // کد ارسال‌نشده نباید معتبر بماند و سهمیه‌ی ارسال را مصرف کند
      await this.prisma.agentContract.update({
        where: { id: contractId },
        data: {
          otpHash: null,
          otpExpiresAt: null,
          otpSentAt: null,
          otpSendCount: { decrement: 1 },
        },
      });
      throw new ServiceUnavailableException(
        'ارسال پیامک کد امضا ناموفق بود؛ لحظاتی دیگر تلاش کنید',
      );
    }
    return {
      message: `کد امضا به شماره ${this.maskPhone(prep.phone)} ارسال شد`,
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_RESEND_GAP_MS / 1000,
    };
  }

  async sign(
    agentId: string,
    contractId: string,
    dto: { code: string; accept: boolean; signerName?: string },
    actor: ContractActor,
  ) {
    if (!dto.accept)
      throw new BadRequestException('برای امضا باید مفاد قرارداد را بپذیرید');
    const code = (dto.code ?? '')
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/\D/g, '');

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "agent_contracts" WHERE "id" = ${contractId}::uuid FOR UPDATE`;
      const c = await tx.agentContract.findFirst({
        where: { id: contractId, agentId },
        include: { agent: true },
      });
      if (!c) throw new NotFoundException('قرارداد یافت نشد');
      this.assertSignable(c);
      if (!c.otpHash || !c.otpExpiresAt) {
        throw new BadRequestException('ابتدا کد امضا را دریافت کنید');
      }
      if (c.otpExpiresAt < new Date()) {
        throw new BadRequestException(
          'کد امضا منقضی شده است؛ کد جدید دریافت کنید',
        );
      }
      if (c.otpAttempts >= OTP_MAX_ATTEMPTS) {
        throw new ForbiddenException(
          'تعداد تلاش ناموفق بیش از حد مجاز است؛ کد جدید دریافت کنید',
        );
      }
      const expected = Buffer.from(c.otpHash, 'hex');
      const given = Buffer.from(this.otpHash(c.id, code), 'hex');
      if (
        code.length !== 6 ||
        expected.length !== given.length ||
        !timingSafeEqual(expected, given)
      ) {
        await tx.agentContract.update({
          where: { id: c.id },
          data: { otpAttempts: { increment: 1 } },
        });
        await this.event(tx, c.id, 'OTP_FAILED', 'AGENT', actor);
        return {
          ok: false as const,
          remaining: Math.max(0, OTP_MAX_ATTEMPTS - c.otpAttempts - 1),
        };
      }

      // اطمینان از عدم تغییر متن از زمان صدور
      if (c.bodyHash && c.bodyHash !== this.sha256(c.body)) {
        throw new ConflictException(
          'یکپارچگی متن قرارداد تأیید نشد؛ با پشتیبانی تماس بگیرید',
        );
      }

      const signedAt = new Date();
      const phone = normalizeIranMobile(c.agent.phone) ?? c.agent.phone;
      const signerName = dto.signerName?.trim() || c.agent.managerName;
      const signatureHash = this.sha256(
        [
          c.contractNumber,
          c.bodyHash ?? this.sha256(c.body),
          phone,
          signedAt.toISOString(),
          actor.adminUserId,
          signerName,
        ].join('|'),
      );
      await tx.agentContract.update({
        where: { id: c.id },
        data: {
          status: 'SIGNED',
          signedAt,
          signerAdminUserId: actor.adminUserId,
          signerName,
          signerNationalCode: c.agent.nationalCode,
          signerPhone: phone,
          signerIp: actor.ip ?? null,
          signerUserAgent: actor.userAgent?.slice(0, 300) ?? null,
          signatureHash,
          otpHash: null,
          otpExpiresAt: null,
        },
      });
      // قرارداد امضاشده مبنای اطلاعات قرارداد جاری نماینده می‌شود
      await tx.agent.update({
        where: { id: c.agentId },
        data: {
          contractNumber: c.contractNumber,
          contractStartAt: c.startsAt,
          contractEndAt: c.endsAt,
        },
      });
      await this.event(
        tx,
        c.id,
        'SIGNED',
        'AGENT',
        actor,
        `امضاکننده: ${signerName}`,
      );
      return {
        ok: true as const,
        agent: c.agent,
        contractNumber: c.contractNumber,
      };
    });

    if (!outcome.ok) {
      throw new BadRequestException(
        outcome.remaining > 0
          ? `کد امضا نادرست است (${outcome.remaining.toLocaleString('fa-IR')} تلاش باقی‌مانده)`
          : 'کد امضا نادرست است؛ کد جدید دریافت کنید',
      );
    }
    void this.smsTemplates.send(
      'AGENT_CONTRACT_SIGNED',
      outcome.agent.phone,
      { agentName: outcome.agent.name, contractNumber: outcome.contractNumber },
      { referenceType: 'AGENT_CONTRACT', referenceId: contractId },
    );
    return { message: 'قرارداد با موفقیت امضا شد' };
  }

  // ═══════════════════════════ منقضی‌سازی ═══════════════════════════

  @Cron('17 * * * *', { name: 'expire-agent-contracts' })
  async expireOverdue() {
    const overdue = await this.prisma.agentContract.findMany({
      where: { status: 'ISSUED', signDeadline: { lt: new Date() } },
      select: { id: true },
    });
    for (const c of overdue) {
      await this.prisma.$transaction(async (tx) => {
        await tx.agentContract.update({
          where: { id: c.id },
          data: { status: 'EXPIRED', otpHash: null, otpExpiresAt: null },
        });
        await tx.agentContractEvent.create({
          data: {
            contractId: c.id,
            type: 'EXPIRED',
            actorType: 'SYSTEM',
            note: 'پایان مهلت امضا',
          },
        });
      });
    }
  }

  // ═══════════════════════════ کمکی ═══════════════════════════

  private assertSignable(c: {
    status: string;
    signDeadline: Date | null;
    agent?: { status: string };
  }) {
    if (c.status === 'SIGNED')
      throw new ConflictException('این قرارداد قبلاً امضا شده است');
    if (c.status !== 'ISSUED')
      throw new ConflictException('این قرارداد قابل امضا نیست');
    if (c.signDeadline && c.signDeadline < new Date()) {
      throw new ConflictException('مهلت امضای این قرارداد به پایان رسیده است');
    }
  }

  /** HMAC کد با کلید سرور و شناسه‌ی قرارداد (کد خام هرگز ذخیره نمی‌شود) */
  private otpHash(contractId: string, code: string) {
    const key =
      process.env.JWT_ADMIN_SECRET ||
      process.env.INTEGRATION_ENCRYPTION_KEY ||
      'agent-contract-otp';
    return createHmac('sha256', key)
      .update(`${contractId}:${code}`)
      .digest('hex');
  }

  private maskPhone(phone: string) {
    return phone.length >= 11
      ? `${phone.slice(0, 4)}***${phone.slice(-4)}`
      : phone;
  }

  private async event(
    tx: Prisma.TransactionClient,
    contractId: string,
    type: string,
    actorType: 'ADMIN' | 'AGENT' | 'SYSTEM',
    actor?: ContractActor,
    note?: string,
  ) {
    await tx.agentContractEvent.create({
      data: {
        contractId,
        type,
        actorType,
        actorId: actor?.adminUserId ?? null,
        ip: actor?.ip ?? null,
        userAgent: actor?.userAgent?.slice(0, 300) ?? null,
        note: note?.slice(0, 500) ?? null,
      },
    });
  }

  private async present(
    c: Prisma.AgentContractGetPayload<{
      include: {
        agent: {
          select: {
            id: true;
            code: true;
            name: true;
            managerName: true;
            phone: true;
            nationalCode: true;
          };
        };
      };
    }> & { events: Prisma.AgentContractEventGetPayload<object>[] },
    forAdmin: boolean,
  ) {
    // پیش‌نویس: پیش‌نمایش با اطلاعات فعلی نماینده
    let body = c.body;
    if (c.status === 'DRAFT') {
      const agent = await this.prisma.agent.findUniqueOrThrow({
        where: { id: c.agentId },
      });
      body = this.render(
        c.body,
        await this.contractVars(agent, c.contractNumber, c.startsAt, c.endsAt),
      );
    }
    return {
      id: c.id,
      contractNumber: c.contractNumber,
      title: c.title,
      body,
      rawBody: forAdmin && c.status === 'DRAFT' ? c.body : undefined,
      bodyHash: c.bodyHash,
      status: c.status,
      statusLabel: CONTRACT_STATUS_FA[c.status],
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      signDeadline: c.signDeadline,
      issuedAt: c.issuedAt,
      firstViewedAt: c.firstViewedAt,
      cancelReason: c.cancelReason,
      cancelledAt: c.cancelledAt,
      agent: {
        ...c.agent,
        phone: forAdmin
          ? c.agent.phone
          : this.maskPhone(normalizeIranMobile(c.agent.phone) ?? c.agent.phone),
      },
      otpPending: !!c.otpExpiresAt && c.otpExpiresAt > new Date(),
      signature:
        c.status === 'SIGNED' && c.signedAt
          ? {
              signedAt: c.signedAt,
              signedAtJalali: formatJalaliDateTime(c.signedAt),
              signerName: c.signerName,
              signerNationalCode: c.signerNationalCode,
              signerPhone: forAdmin
                ? c.signerPhone
                : this.maskPhone(c.signerPhone ?? ''),
              signerIp: c.signerIp,
              signerUserAgent: forAdmin ? c.signerUserAgent : undefined,
              signatureHash: c.signatureHash,
              method: 'کد یکبارمصرف پیامکی به شماره همراه ثبت‌شده‌ی نماینده',
            }
          : null,
      events: c.events.map((e) => ({
        id: e.id,
        type: e.type,
        actorType: e.actorType,
        ip: e.ip,
        note: e.note,
        createdAt: e.createdAt,
      })),
    };
  }
}
