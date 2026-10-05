// api/src/common/auth-security/credential-expiry.service.ts
//
// FIA_UID_EXT.1.5 — یادآوری به‌موقع پیش از انقضای سازوکارهای احراز هویت:
//  - کلید API شرکای فروش (تاریخ انقضای صریح؛ پس از انقضا پذیرفته نمی‌شود)
//  - Credentialهای سرویس‌های ثالث که به بیشینه‌ی عمر خود (FCS_CKM_EXT.1.2) نزدیک می‌شوند
// زمان‌بندی پیش‌فرض: ۳۰، ۱۵، ۷ و ۱ روز مانده — قابل تنظیم در «تنظیمات سیستم»
// (security.expiry.reminder_days). هر آستانه فقط یک‌بار برای هر اعتبارنامه ارسال می‌شود.
// گیرندگان: مسئول شریک (برای کلید API) و ادمین‌های دارای دسترسی «مدیریت رمزنگاری» با موبایل ثبت‌شده.
// متن پیام مشخص می‌کند چه چیزی، چه زمانی منقضی می‌شود و تمدید از کجا انجام می‌شود.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemConfigService } from '../../system-config/system-config.service';
import { SmsTemplateService } from '../../notifications/sms-template.service';
import { ProviderCredentialService } from '../../integrations/credentials/provider-credential.service';
import { AuditService } from '../audit/audit.service';

const DAY_MS = 86_400_000;
const DEFAULT_THRESHOLDS = [30, 15, 7, 1];

export function parseReminderDays(raw: string | null | undefined): number[] {
  const days = (raw ?? '')
    .split(/[,،\s]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 365);
  const unique = Array.from(new Set(days)).sort((a, b) => b - a);
  return unique.length ? unique : DEFAULT_THRESHOLDS;
}

/** کوچک‌ترین آستانه‌ای که روزهای باقی‌مانده به آن رسیده است (یا null اگر هنوز زود است) */
export function dueThreshold(
  daysLeft: number,
  thresholds: number[],
): number | null {
  const reached = thresholds.filter((t) => daysLeft <= t);
  return reached.length ? Math.min(...reached) : null;
}

/** روزهای باقی‌مانده؛ هر چیزی که گذشته باشد منفی است (حتی یک دقیقه) */
export function daysLeft(expiresAtMs: number, nowMs: number): number {
  const d = (expiresAtMs - nowMs) / DAY_MS;
  return d <= 0 ? Math.floor(d) || -1 : Math.ceil(d);
}

export interface ExpiryItem {
  kind: 'partner_api_key' | 'integration_credential';
  id: string;
  label: string;
  expiresAt: Date;
  daysLeft: number;
}

const formatDate = (d: Date) =>
  new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

@Injectable()
export class CredentialExpiryService {
  private readonly logger = new Logger(CredentialExpiryService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
    private sms: SmsTemplateService,
    private credentials: ProviderCredentialService,
    private audit: AuditService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  async thresholds() {
    return parseReminderDays(
      await this.systemConfig.get('security.expiry.reminder_days', '30,15,7,1'),
    );
  }

  /** فهرست اعتبارنامه‌های دارای تاریخ انقضا (برای پنل امنیت) */
  async upcoming(): Promise<ExpiryItem[]> {
    const now = Date.now();
    const items: ExpiryItem[] = [];
    const partners = await this.prisma.salesPartner.findMany({
      where: { apiKeyHash: { not: null }, apiKeyExpiresAt: { not: null } },
      select: { id: true, name: true, apiKeyExpiresAt: true },
    });
    for (const p of partners) {
      items.push({
        kind: 'partner_api_key',
        id: p.id,
        label: `کلید API شریک «${p.name}»`,
        expiresAt: p.apiKeyExpiresAt,
        daysLeft: daysLeft(p.apiKeyExpiresAt.getTime(), now),
      });
    }
    const inv = await this.credentials.inventory();
    for (const c of inv.items) {
      const expiresAt = new Date(
        c.updatedAt.getTime() + inv.maxAgeDays * DAY_MS,
      );
      items.push({
        kind: 'integration_credential',
        id: `${c.providerCode}:${c.key}`,
        label: `اعتبارنامه‌ی ${c.key} سرویس ${c.providerName}`,
        expiresAt,
        daysLeft: daysLeft(expiresAt.getTime(), now),
      });
    }
    return items.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  private async securityAdmins() {
    return this.prisma.adminUser.findMany({
      where: {
        isActive: true,
        agentId: null,
        phone: { not: null },
        roles: {
          some: {
            role: {
              permissions: {
                some: { permission: { key: 'security.crypto.manage' } },
              },
            },
          },
        },
      },
      select: { id: true, phone: true },
    });
  }

  @Cron('0 0 4 * * *', { name: 'security-expiry-reminders', timeZone: 'UTC' })
  async scheduledRun() {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(
        `[Expiry] ارسال یادآوری‌های انقضا ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  /** بررسی همه‌ی اعتبارنامه‌ها و ارسال یادآوری‌های سررسیدشده */
  async run(): Promise<{ checked: number; reminded: number }> {
    const thresholds = await this.thresholds();
    const items = await this.upcoming();
    const admins = await this.securityAdmins();
    let reminded = 0;

    for (const item of items) {
      if (item.daysLeft < 0) continue;
      const due = dueThreshold(item.daysLeft, thresholds);
      if (due === null) continue;
      const already = await this.lastReminded(item);
      if (already !== null && already <= due) continue;

      const days = Math.max(item.daysLeft, 0).toLocaleString('fa-IR');
      const date = formatDate(item.expiresAt);
      if (item.kind === 'partner_api_key') {
        const partner = await this.prisma.salesPartner.findUnique({
          where: { id: item.id },
          select: { name: true, contactPhone: true, apiKeyPrefix: true },
        });
        if (partner?.contactPhone) {
          await this.sms.send(
            'PARTNER_API_KEY_EXPIRING',
            partner.contactPhone,
            {
              partnerName: partner.name,
              keyPrefix: partner.apiKeyPrefix ?? '',
              days,
              date,
            },
            { referenceType: 'API_KEY_EXPIRY', referenceId: item.id },
          );
        }
      }
      for (const a of admins) {
        await this.sms.send(
          'ADMIN_EXPIRY_ALERT',
          a.phone,
          { item: item.label, days, date },
          { referenceType: 'CREDENTIAL_EXPIRY', referenceId: item.id },
        );
      }
      await this.markReminded(item, due);
      reminded += 1;
    }

    if (reminded > 0) {
      await this.audit.logAdmin({
        adminUserId: null,
        actorLabel: 'system',
        action: 'system.expiry_reminders',
        source: CredentialExpiryService.name,
        success: true,
        newValue: { checked: items.length, reminded, thresholds },
      });
    }
    return { checked: items.length, reminded };
  }

  private async lastReminded(item: ExpiryItem): Promise<number | null> {
    if (item.kind === 'partner_api_key') {
      const p = await this.prisma.salesPartner.findUnique({
        where: { id: item.id },
        select: { apiKeyReminderDays: true },
      });
      return p?.apiKeyReminderDays ?? null;
    }
    const v = await this.redis.get(this.redisKey(item));
    return v === null ? null : Number(v);
  }

  private async markReminded(item: ExpiryItem, due: number) {
    if (item.kind === 'partner_api_key') {
      await this.prisma.salesPartner.update({
        where: { id: item.id },
        data: { apiKeyReminderDays: due },
      });
      return;
    }
    // تا پس از سررسید نگه داشته می‌شود؛ با تعویض Credential تاریخ انقضا و در نتیجه کلید عوض می‌شود
    await this.redis.set(
      this.redisKey(item),
      String(due),
      'EX',
      Math.max(item.daysLeft + 30, 30) * 86_400,
    );
  }

  private redisKey(item: ExpiryItem) {
    return `expiry-reminder:${item.kind}:${item.id}:${item.expiresAt.toISOString().slice(0, 10)}`;
  }
}
