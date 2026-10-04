// api/src/notifications/sms-admin.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SmsLogStatus, SmsSendMode } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SmsService,
  SMS_SERVICE_CODE,
} from '../integrations/services/sms.service';
import { ProviderCredentialService } from '../integrations/credentials/provider-credential.service';
import {
  isLiveSmsAllowed,
  normalizeIranMobile,
} from '../integrations/providers/sms-common/sms-live.util';
import { GHASEDAK_CREDENTIAL_KEYS } from '../integrations/providers/ghasedak/ghasedak-sms.provider';
import { SMSIR_CREDENTIAL_KEYS } from '../integrations/providers/smsir/smsir-sms.provider';
import { SmsTemplateService } from './sms-template.service';
import {
  SMS_CATEGORY_LABEL,
  SMS_TEMPLATE_BY_KEY,
  SMS_TEMPLATE_CATALOG,
} from './sms-templates.catalog';

/** کلیدهای مجاز تنظیمات هر سامانه در مرکز پیامک */
const SMS_PROVIDER_FIELDS: Record<
  string,
  { key: string; label: string; secret: boolean; hint: string }[]
> = {
  GHASEDAK: [
    {
      key: GHASEDAK_CREDENTIAL_KEYS.API_KEY,
      label: 'کلید وب‌سرویس (ApiKey)',
      secret: true,
      hint: 'پنل قاصدک ← تنظیمات ← کلید وب‌سرویس',
    },
    {
      key: GHASEDAK_CREDENTIAL_KEYS.LINE_NUMBER,
      label: 'شماره خط ارسال',
      secret: false,
      hint: 'مثلاً 30005006009009 — برای ارسال متن آزاد الزامی است',
    },
  ],
  SMSIR: [
    {
      key: SMSIR_CREDENTIAL_KEYS.API_KEY,
      label: 'کلید API (X-API-KEY)',
      secret: true,
      hint: 'پنل sms.ir ← برنامه‌نویسان ← لیست کلیدهای API',
    },
    {
      key: SMSIR_CREDENTIAL_KEYS.LINE_NUMBER,
      label: 'شماره خط ارسال',
      secret: false,
      hint: 'فقط رقم، مثلاً 30007732000000 — برای ارسال متن آزاد الزامی است',
    },
  ],
  MOCK: [],
};

const PROVIDER_LABEL: Record<string, string> = {
  GHASEDAK: 'قاصدک',
  SMSIR: 'sms.ir',
  MOCK: 'شبیه‌ساز داخلی (فقط لاگ)',
};

export interface UpdateSmsTemplateInput {
  body?: string;
  isActive?: boolean;
  providerCode?: string | null;
  sendMode?: SmsSendMode;
  smsirTemplateId?: string | null;
  ghasedakTemplateName?: string | null;
}

@Injectable()
export class SmsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly templates: SmsTemplateService,
    private readonly credentials: ProviderCredentialService,
  ) {}

  // ═══════════════════════ قالب‌ها ═══════════════════════

  async listTemplates() {
    const rows = await this.prisma.smsTemplate.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
    const order = new Map(SMS_TEMPLATE_CATALOG.map((t, i) => [t.key, i]));
    return rows
      .map((r) => {
        const def = SMS_TEMPLATE_BY_KEY.get(r.key);
        return {
          ...r,
          categoryLabel:
            SMS_CATEGORY_LABEL[r.category as keyof typeof SMS_CATEGORY_LABEL] ??
            r.category,
          variables: def?.variables ?? [],
          sensitive: !!def?.sensitive,
          defaultBody: def?.body ?? null,
          preview: this.templates.render(r.body, this.sampleVars(r.key)),
        };
      })
      .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  }

  async updateTemplate(
    key: string,
    dto: UpdateSmsTemplateInput,
    adminId: string,
  ) {
    const row = await this.prisma.smsTemplate.findUnique({ where: { key } });
    if (!row) throw new NotFoundException('قالب پیامک یافت نشد');
    const def = SMS_TEMPLATE_BY_KEY.get(key);

    if (dto.body !== undefined) {
      const body = dto.body.trim();
      if (body.length < 3) throw new BadRequestException('متن پیامک خالی است');
      if (body.length > 600)
        throw new BadRequestException('متن پیامک حداکثر ۶۰۰ کاراکتر است');
      const allowed = new Set([
        'brand',
        ...(def?.variables.map((v) => v.name) ?? []),
      ]);
      const unknown = [...body.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .filter((n) => !allowed.has(n));
      if (unknown.length) {
        throw new BadRequestException(
          `متغیر نامعتبر در متن: ${[...new Set(unknown)].map((u) => `{${u}}`).join('، ')}`,
        );
      }
      if (def?.sensitive && !/\{code\}|\{deliveryCode\}/.test(body)) {
        throw new BadRequestException(
          'متن این قالب باید متغیر کد را داشته باشد',
        );
      }
      dto.body = body;
    }
    if (dto.isActive === false && def?.sensitive) {
      throw new BadRequestException(
        'قالب‌های حاوی کد یکبارمصرف قابل غیرفعال‌سازی نیستند',
      );
    }
    if (
      dto.providerCode &&
      !this.sms.listProviderCodes().includes(dto.providerCode)
    ) {
      throw new BadRequestException('سامانه‌ی پیامک نامعتبر است');
    }
    const mode = dto.sendMode ?? row.sendMode;
    const smsirId =
      dto.smsirTemplateId !== undefined
        ? dto.smsirTemplateId?.trim() || null
        : row.smsirTemplateId;
    const ghasedakName =
      dto.ghasedakTemplateName !== undefined
        ? dto.ghasedakTemplateName?.trim() || null
        : row.ghasedakTemplateName;
    if (smsirId && !/^\d+$/.test(smsirId)) {
      throw new BadRequestException('شناسه‌ی قالب sms.ir باید عددی باشد');
    }
    if (mode === 'PATTERN' && !smsirId && !ghasedakName) {
      throw new BadRequestException(
        'برای ارسال با قالب سامانه، شناسه‌ی قالب sms.ir یا نام قالب قاصدک را وارد کنید',
      );
    }

    const updated = await this.prisma.smsTemplate.update({
      where: { key },
      data: {
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.providerCode !== undefined
          ? { providerCode: dto.providerCode || null }
          : {}),
        sendMode: mode,
        smsirTemplateId: smsirId,
        ghasedakTemplateName: ghasedakName,
        updatedById: adminId,
      },
    });
    this.templates.invalidate(key);
    return { message: 'قالب پیامک ذخیره شد', template: updated };
  }

  async resetTemplate(key: string, adminId: string) {
    const def = SMS_TEMPLATE_BY_KEY.get(key);
    if (!def) throw new NotFoundException('قالب پیش‌فرض یافت نشد');
    await this.prisma.smsTemplate.update({
      where: { key },
      data: { body: def.body, updatedById: adminId },
    });
    this.templates.invalidate(key);
    return { message: 'متن پیش‌فرض بازگردانده شد' };
  }

  async testTemplate(key: string, phone: string) {
    const mobile = normalizeIranMobile(phone);
    if (!mobile) throw new BadRequestException('شماره موبایل نامعتبر است');
    const result = await this.templates.send(
      key,
      mobile,
      this.sampleVars(key),
      {
        referenceType: 'SMS_TEST',
      },
    );
    return {
      message:
        result.status === 'SENT'
          ? 'پیامک آزمایشی ارسال شد'
          : result.status === 'DRY_RUN'
            ? 'محیط غیرعملیاتی است؛ ارسال واقعی انجام نشد و فقط در لاگ ثبت شد'
            : `ارسال انجام نشد: ${result.error ?? result.status}`,
      ...result,
    };
  }

  private sampleVars(key: string): Record<string, string> {
    const def = SMS_TEMPLATE_BY_KEY.get(key);
    return Object.fromEntries(
      (def?.variables ?? []).map((v) => [v.name, v.sample]),
    );
  }

  // ═══════════════════════ سامانه‌ها ═══════════════════════

  async listProviders() {
    const service = await this.prisma.integrationService.findUnique({
      where: { code: SMS_SERVICE_CODE },
      include: {
        providers: {
          include: { provider: { include: { credentials: true } } },
        },
      },
    });
    const supported = this.sms.listProviderCodes();
    const links = (service?.providers ?? []).filter((l) =>
      supported.includes(l.provider.code),
    );
    return {
      serviceActive: service?.isActive ?? false,
      liveSendAllowed: isLiveSmsAllowed(),
      environment: process.env.NODE_ENV ?? 'development',
      providers: links
        .sort((a, b) => a.priority - b.priority)
        .map((l) => {
          const fields = SMS_PROVIDER_FIELDS[l.provider.code] ?? [];
          const configured = new Set(l.provider.credentials.map((c) => c.key));
          return {
            code: l.provider.code,
            name: PROVIDER_LABEL[l.provider.code] ?? l.provider.name,
            providerActive: l.provider.isActive,
            linkActive: l.isActive,
            effectiveActive: l.provider.isActive && l.isActive,
            priority: l.priority,
            isFallback: l.isFallback,
            fields: fields.map((f) => ({
              ...f,
              configured: configured.has(f.key),
            })),
            ready: fields.every(
              (f) => f.key === 'LINE_NUMBER' || configured.has(f.key),
            ),
          };
        }),
    };
  }

  async updateProvider(
    code: string,
    dto: { isActive?: boolean; priority?: number; isFallback?: boolean },
  ) {
    const [provider, service] = await Promise.all([
      this.prisma.integrationProvider.findUnique({ where: { code } }),
      this.prisma.integrationService.findUnique({
        where: { code: SMS_SERVICE_CODE },
      }),
    ]);
    if (!provider || !service) throw new NotFoundException('سامانه یافت نشد');
    if (dto.isActive && code !== 'MOCK') {
      const fields = SMS_PROVIDER_FIELDS[code] ?? [];
      const creds = await this.prisma.integrationProviderCredential.findMany({
        where: { providerId: provider.id },
        select: { key: true },
      });
      const have = new Set(creds.map((c) => c.key));
      const missing = fields.filter((f) => f.secret && !have.has(f.key));
      if (missing.length) {
        throw new BadRequestException(
          `پیش از فعال‌سازی، ${missing.map((m) => m.label).join(' و ')} را ثبت کنید`,
        );
      }
    }
    if (dto.priority !== undefined && (dto.priority < 1 || dto.priority > 99)) {
      throw new BadRequestException('اولویت باید بین ۱ تا ۹۹ باشد');
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.isActive !== undefined) {
        await tx.integrationProvider.update({
          where: { id: provider.id },
          data: { isActive: dto.isActive || provider.isActive },
        });
      }
      await tx.integrationProviderService.upsert({
        where: {
          providerId_serviceId: {
            providerId: provider.id,
            serviceId: service.id,
          },
        },
        create: {
          providerId: provider.id,
          serviceId: service.id,
          isActive: dto.isActive ?? false,
          priority: dto.priority ?? 5,
          isFallback: dto.isFallback ?? false,
        },
        update: {
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.isFallback !== undefined
            ? { isFallback: dto.isFallback }
            : {}),
        },
      });
    });
    return { message: 'تنظیمات سامانه ذخیره شد' };
  }

  async setCredential(code: string, key: string, value: string) {
    const fields = SMS_PROVIDER_FIELDS[code];
    if (!fields?.some((f) => f.key === key)) {
      throw new BadRequestException('کلید تنظیمات برای این سامانه مجاز نیست');
    }
    const v = value.trim();
    if (!v) throw new BadRequestException('مقدار خالی است');
    if (key === 'LINE_NUMBER' && !/^\+?\d{4,20}$/.test(v)) {
      throw new BadRequestException('شماره خط فقط باید شامل رقم باشد');
    }
    await this.credentials.setCredential(code, key, v);
    return { message: 'ذخیره شد' };
  }

  async listCredentials(code: string) {
    if (!SMS_PROVIDER_FIELDS[code])
      throw new NotFoundException('سامانه یافت نشد');
    return this.credentials.listMasked(code);
  }

  async accountInfo(code: string) {
    const info = await this.sms.getAccountInfo(code);
    return info ?? { credit: null, creditUnit: '', lines: [] };
  }

  async testProvider(code: string, phone: string, text: string) {
    const mobile = normalizeIranMobile(phone);
    if (!mobile) throw new BadRequestException('شماره موبایل نامعتبر است');
    const body = (text || 'پیامک آزمایشی مرکز پیامک').slice(0, 300);
    try {
      const res = await this.sms.sendVia(code, { phone: mobile, text: body });
      await this.prisma.smsLog.create({
        data: {
          phone: mobile,
          templateKey: null,
          providerCode: code,
          text: body,
          status: res.dryRun ? 'DRY_RUN' : 'SENT',
          providerMessageId: res.providerRequestId ?? null,
          cost: typeof res.cost === 'number' ? res.cost : null,
          referenceType: 'SMS_TEST',
        },
      });
      return {
        message: res.dryRun
          ? 'محیط غیرعملیاتی است؛ درخواستی به سامانه ارسال نشد (ارسال آزمایشی)'
          : 'پیامک آزمایشی ارسال شد',
        ...res,
      };
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.smsLog.create({
        data: {
          phone: mobile,
          providerCode: code,
          text: body,
          status: 'FAILED',
          errorMessage: message.slice(0, 500),
          referenceType: 'SMS_TEST',
        },
      });
      throw new BadRequestException(message);
    }
  }

  // ═══════════════════════ لاگ و گزارش ═══════════════════════

  async listLogs(q: {
    status?: string;
    providerCode?: string;
    templateKey?: string;
    phone?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 30));
    const where: Prisma.SmsLogWhereInput = {
      ...(q.status ? { status: q.status as SmsLogStatus } : {}),
      ...(q.providerCode ? { providerCode: q.providerCode } : {}),
      ...(q.templateKey ? { templateKey: q.templateKey } : {}),
      ...(q.phone ? { phone: { contains: q.phone.replace(/\D/g, '') } } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to
                ? { lt: new Date(new Date(q.to).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    };
    const [total, items, byStatus, byProvider] = await Promise.all([
      this.prisma.smsLog.count({ where }),
      this.prisma.smsLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.smsLog.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
      this.prisma.smsLog.groupBy({
        by: ['providerCode'],
        where,
        _count: { _all: true },
        _sum: { cost: true },
      }),
    ]);
    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: {
        byStatus: Object.fromEntries(
          byStatus.map((s) => [s.status, s._count._all]),
        ),
        byProvider: byProvider.map((p) => ({
          providerCode: p.providerCode,
          count: p._count._all,
          cost: p._sum.cost?.toString() ?? '0',
        })),
      },
      items: items.map((i) => ({ ...i, cost: i.cost?.toString() ?? null })),
    };
  }
}
