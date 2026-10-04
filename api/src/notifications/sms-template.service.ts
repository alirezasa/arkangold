// api/src/notifications/sms-template.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../integrations/services/sms.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import {
  SmsLogStatus,
  SmsSendMode,
  SmsTemplate,
} from '../generated/prisma/client';
import {
  SMS_TEMPLATE_BY_KEY,
  SMS_TEMPLATE_CATALOG,
} from './sms-templates.catalog';

export type SmsVars = Record<string, string | number | null | undefined>;

export interface SmsEventContext {
  userId?: string | null;
  referenceType?: string;
  referenceId?: string;
  /** اگر true باشد شکست ارسال به‌صورت Exception به فراخواننده برمی‌گردد (مثلاً OTP) */
  throwOnFailure?: boolean;
}

export interface SmsEventResult {
  status: SmsLogStatus;
  providerCode: string | null;
  logId: string | null;
  error?: string;
}

const CACHE_TTL_MS = 30_000;

/**
 * ارسال پیامک رویدادهای سیستم بر اساس قالب‌های قابل ویرایش در پنل ادمین.
 * - متن قالب با متغیرها رندر و از سامانه‌ی تعیین‌شده (یا اولویت پیش‌فرض) ارسال می‌شود.
 * - هر ارسال در sms_logs ثبت می‌شود (متن قالب‌های حساس ماسک‌شده).
 * - شکست پیامک هرگز جریان اصلی کسب‌وکار را نمی‌شکند، مگر throwOnFailure.
 */
@Injectable()
export class SmsTemplateService implements OnModuleInit {
  private readonly logger = new Logger(SmsTemplateService.name);
  private cache = new Map<string, { at: number; row: SmsTemplate | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      for (const def of SMS_TEMPLATE_CATALOG) {
        await this.prisma.smsTemplate.upsert({
          where: { key: def.key },
          create: {
            key: def.key,
            title: def.title,
            category: def.category,
            body: def.body,
            isActive: def.defaultActive ?? true,
          },
          // فقط عنوان/دسته از کد همگام می‌شود؛ متن و تنظیمات ادمین دست نمی‌خورد
          update: { title: def.title, category: def.category },
        });
      }
      this.logger.log(
        `[SMS] ${SMS_TEMPLATE_CATALOG.length} قالب پیامک بررسی شد`,
      );
    } catch (err) {
      this.logger.error(
        `[SMS] همگام‌سازی قالب‌های پیامک ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  invalidate(key?: string) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  async getTemplate(key: string): Promise<SmsTemplate | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.row;
    const row = await this.prisma.smsTemplate.findUnique({ where: { key } });
    this.cache.set(key, { at: Date.now(), row });
    return row;
  }

  /** جایگذاری {متغیر}ها؛ متغیر تعریف‌نشده با رشته‌ی خالی جایگزین می‌شود */
  render(body: string, vars: SmsVars): string {
    return body
      .replace(/\{(\w+)\}/g, (_, name: string) => {
        const v = vars[name];
        return v === null || v === undefined ? '' : String(v);
      })
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  /** متغیرهای پایه (نام تجاری) + متغیرهای رویداد */
  async buildVars(vars: SmsVars): Promise<SmsVars> {
    let brand = '';
    try {
      brand = await this.systemConfig.get('company.brand_name');
    } catch {
      brand = '';
    }
    return { brand: brand || 'آرکان گلد', ...vars };
  }

  /** ارسال رویداد برای کاربر (شماره از پروفایل کاربر) */
  async sendToUser(
    key: string,
    userId: string,
    vars: SmsVars,
    ctx: Omit<SmsEventContext, 'userId'> = {},
  ): Promise<SmsEventResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        identity: { select: { firstName: true, lastName: true } },
        legalProfile: { select: { companyName: true } },
      },
    });
    if (!user?.phone) {
      return {
        status: 'SKIPPED',
        providerCode: null,
        logId: null,
        error: 'کاربر شماره موبایل ندارد',
      };
    }
    const name =
      user.legalProfile?.companyName ??
      (`${user.identity?.firstName ?? ''} ${user.identity?.lastName ?? ''}`.trim() ||
        'کاربر');
    const result = await this.send(
      key,
      user.phone,
      { name, ...vars },
      { ...ctx, userId },
    );
    if (result.status === 'SENT' || result.status === 'DRY_RUN') {
      const tpl = SMS_TEMPLATE_BY_KEY.get(key);
      if (!tpl?.sensitive) {
        // اعلان درون‌برنامه‌ای (تاریخچه پیامک‌های کاربر)
        await this.prisma.notification
          .create({
            data: {
              userId,
              type: 'SMS',
              content: await this.renderForLog(key, { name, ...vars }),
              sentAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }
    return result;
  }

  /** ارسال رویداد به یک شماره‌ی مشخص */
  async send(
    key: string,
    phone: string,
    vars: SmsVars,
    ctx: SmsEventContext = {},
  ): Promise<SmsEventResult> {
    const def = SMS_TEMPLATE_BY_KEY.get(key);
    const tpl = await this.getTemplate(key);
    const mobile = normalizeIranMobile(phone);
    const allVars = await this.buildVars(vars);
    const body = tpl?.body ?? def?.body ?? '';
    const text = this.render(body, allVars);
    // کدهای یکبارمصرف و کد تحویل هرگز به‌صورت خوانا در لاگ ذخیره نمی‌شوند
    const logText = this.mask(text, allVars);

    // قالب‌های حساس (کد یکبارمصرف) قابل غیرفعال‌سازی نیستند — ورود و امضا بدون آن‌ها ممکن نیست
    const active = !!tpl && (tpl.isActive || !!def?.sensitive);
    if (!tpl || !active || !mobile || !text) {
      const reason = !tpl
        ? 'قالب پیامک تعریف نشده است'
        : !active
          ? 'قالب پیامک غیرفعال است'
          : !mobile
            ? 'شماره موبایل نامعتبر است'
            : 'متن پیامک خالی است';
      const log = await this.writeLog({
        phone: mobile ?? phone,
        key,
        ctx,
        text: logText,
        status: 'SKIPPED',
        mode: tpl?.sendMode ?? 'TEXT',
        error: reason,
      });
      if (ctx.throwOnFailure) {
        // رویدادهای حساس (OTP) بدون قالب فعال نباید بی‌صدا شکست بخورند
        throw new Error(reason);
      }
      return {
        status: 'SKIPPED',
        providerCode: null,
        logId: log?.id ?? null,
        error: reason,
      };
    }

    const pattern =
      tpl.sendMode === 'PATTERN'
        ? {
            smsirTemplateId: tpl.smsirTemplateId,
            ghasedakTemplateName: tpl.ghasedakTemplateName,
            params: this.patternParams(tpl.body, allVars),
          }
        : null;

    try {
      const res = await this.sms.send(
        { phone: mobile, text, pattern, clientReferenceId: ctx.referenceId },
        { providerCode: tpl.providerCode },
      );
      const status: SmsLogStatus = res.dryRun
        ? 'DRY_RUN'
        : res.sent
          ? 'SENT'
          : 'FAILED';
      const log = await this.writeLog({
        phone: mobile,
        key,
        ctx,
        text: logText,
        status,
        mode: tpl.sendMode,
        providerCode: res.providerCode,
        providerMessageId: res.providerRequestId,
        cost: res.cost,
      });
      return { status, providerCode: res.providerCode, logId: log?.id ?? null };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(
        `[SMS] ارسال «${key}» به ${mobile} ناموفق بود: ${message}`,
      );
      const log = await this.writeLog({
        phone: mobile,
        key,
        ctx,
        text: logText,
        status: 'FAILED',
        mode: tpl.sendMode,
        providerCode: tpl.providerCode,
        error: message,
      });
      if (ctx.throwOnFailure) throw err;
      return {
        status: 'FAILED',
        providerCode: tpl.providerCode,
        logId: log?.id ?? null,
        error: message,
      };
    }
  }

  /** پارامترهای قالب سامانه = متغیرهای به‌کاررفته در متن قالب، به همان ترتیب */
  patternParams(
    body: string,
    vars: SmsVars,
  ): { name: string; value: string }[] {
    const names = [
      ...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1])),
    ];
    return names
      .filter((n) => n !== 'brand')
      .map((name) => ({ name, value: String(vars[name] ?? '').trim() || '-' }));
  }

  private async renderForLog(key: string, vars: SmsVars): Promise<string> {
    const tpl = await this.getTemplate(key);
    const def = SMS_TEMPLATE_BY_KEY.get(key);
    return this.render(
      tpl?.body ?? def?.body ?? '',
      await this.buildVars(vars),
    );
  }

  /** ماسک کد یکبارمصرف در متن لاگ */
  private mask(text: string, vars: SmsVars): string {
    let out = text;
    for (const k of ['code', 'deliveryCode']) {
      const v = vars[k];
      if (v !== null && v !== undefined && /^\d{4,}$/.test(String(v))) {
        out = out.split(String(v)).join('*'.repeat(String(v).length));
      }
    }
    return out;
  }

  private async writeLog(p: {
    phone: string;
    key: string;
    ctx: SmsEventContext;
    text: string;
    status: SmsLogStatus;
    mode: SmsSendMode;
    providerCode?: string | null;
    providerMessageId?: string;
    cost?: number;
    error?: string;
  }) {
    try {
      return await this.prisma.smsLog.create({
        data: {
          phone: p.phone,
          userId: p.ctx.userId ?? null,
          templateKey: p.key,
          providerCode: p.providerCode ?? null,
          sendMode: p.mode,
          text: p.text.slice(0, 2000),
          status: p.status,
          providerMessageId: p.providerMessageId ?? null,
          cost:
            typeof p.cost === 'number' && Number.isFinite(p.cost)
              ? p.cost
              : null,
          errorMessage: p.error?.slice(0, 500) ?? null,
          referenceType: p.ctx.referenceType ?? null,
          referenceId: p.ctx.referenceId ?? null,
        },
        select: { id: true },
      });
    } catch (err) {
      this.logger.warn(
        `[SMS] ثبت لاگ پیامک ناموفق بود: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
