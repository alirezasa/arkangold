// api/src/common/auth-security/login-alert.service.ts
//
// FIA_UAU_EXT.2.5 — اطلاع‌رسانی تلاش‌های مشکوک احراز هویت به صاحب حساب از کانال تأییدشده (پیامک
// به شماره‌ای که مالکیت آن با کد یکبارمصرف اثبات شده) و برای کاربران، اعلان درون‌برنامه‌ای:
//  - ورود موفق از دستگاه/مرورگری که پیش‌تر برای این حساب دیده نشده
//  - ورود به دوره‌ی تأخیر به دلیل تلاش‌های ناموفق مکرر (حداکثر یک هشدار در ۶ ساعت)
//  - تغییرات امنیتی حساب (تغییر/بازنشانی رمز، فعال/غیرفعال شدن ورود دومرحله‌ای)
// متن شامل زمان، نوع دستگاه/مرورگر و IP ماسک‌شده (مثل 5.112.x.x) است.
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsTemplateService } from '../../notifications/sms-template.service';
import { SystemConfigService } from '../../system-config/system-config.service';

export type AlertOwner =
  | { kind: 'user'; id: string }
  | {
      kind: 'admin';
      id: string;
      phone: string | null;
      fullName: string;
      username: string;
    };

const FAILED_ALERT_COOLDOWN_SECONDS = 6 * 60 * 60;

export function maskIp(ip?: string | null): string {
  if (!ip) return 'نامشخص';
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split('.');
    return `${a}.${b}.x.x`;
  }
  const parts = ip.split(':').filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}:…` : 'نامشخص';
}

/** خانواده‌ی مرورگر و سیستم‌عامل (بدون نسخه تا به‌روزرسانی مرورگر هشدار کاذب ندهد) */
export function describeDevice(ua?: string | null): string {
  if (!ua) return 'دستگاه نامشخص';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'مرورگر نامشخص';
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'سیستم‌عامل نامشخص';
  return `${browser} روی ${os}`;
}

export function formatTehranTime(d = new Date()): string {
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

@Injectable()
export class LoginAlertService {
  private readonly logger = new Logger(LoginAlertService.name);

  constructor(
    private prisma: PrismaService,
    private sms: SmsTemplateService,
    private systemConfig: SystemConfigService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  private enabled() {
    return this.systemConfig.getBoolean('security.login_alerts.enabled', true);
  }

  /**
   * پس از هر ورود موفق: دستگاه ثبت می‌شود و اگر جدید باشد (و حساب پیش‌تر دستگاهی داشته) هشدار
   * ارسال می‌شود. خطای ارسال هرگز ورود را نمی‌شکند.
   */
  async onSuccessfulLogin(owner: AlertOwner, ip?: string, ua?: string) {
    try {
      const label = describeDevice(ua);
      const fingerprint = createHash('sha256').update(label).digest('hex');
      const ownerWhere =
        owner.kind === 'user'
          ? { userId: owner.id }
          : { adminUserId: owner.id };
      const existing = await this.prisma.loginDevice.findFirst({
        where: { ...ownerWhere, fingerprint },
      });
      if (existing) {
        await this.prisma.loginDevice.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), lastIp: maskIp(ip) },
        });
        return { newDevice: false };
      }
      const knownCount = await this.prisma.loginDevice.count({
        where: ownerWhere,
      });
      await this.prisma.loginDevice.create({
        data: { ...ownerWhere, fingerprint, label, lastIp: maskIp(ip) },
      });
      // اولین دستگاه حساب (ثبت‌نام یا اولین ورود پس از استقرار) هشدار ندارد
      if (knownCount === 0 || !(await this.enabled())) {
        return { newDevice: knownCount > 0 };
      }
      const vars = { device: label, ip: maskIp(ip), time: formatTehranTime() };
      if (owner.kind === 'user') {
        await this.sms.sendToUser('AUTH_NEW_DEVICE_LOGIN', owner.id, vars, {
          referenceType: 'SECURITY_ALERT',
        });
      } else if (owner.phone) {
        await this.sms.send(
          'ADMIN_NEW_DEVICE_LOGIN',
          owner.phone,
          { ...vars, name: owner.fullName, username: owner.username },
          { referenceType: 'SECURITY_ALERT', referenceId: owner.id },
        );
      }
      return { newDevice: true };
    } catch (err) {
      this.logger.warn(
        `[LoginAlert] ثبت دستگاه/ارسال هشدار ناموفق بود: ${(err as Error).message}`,
      );
      return { newDevice: false };
    }
  }

  /** حساب وارد دوره‌ی تأخیر شد — حداکثر یک هشدار در ۶ ساعت */
  async onRepeatedFailures(owner: AlertOwner, failures: number, ip?: string) {
    try {
      if (!(await this.enabled())) return;
      const fresh = await this.redis.set(
        `login-alert:failed:${owner.kind}:${owner.id}`,
        '1',
        'EX',
        FAILED_ALERT_COOLDOWN_SECONDS,
        'NX',
      );
      if (fresh !== 'OK') return;
      const vars = {
        count: failures.toLocaleString('fa-IR'),
        ip: maskIp(ip),
        time: formatTehranTime(),
      };
      if (owner.kind === 'user') {
        await this.sms.sendToUser(
          'AUTH_FAILED_ATTEMPTS_ALERT',
          owner.id,
          vars,
          {
            referenceType: 'SECURITY_ALERT',
          },
        );
      } else if (owner.phone) {
        await this.sms.send(
          'ADMIN_FAILED_ATTEMPTS_ALERT',
          owner.phone,
          { ...vars, name: owner.fullName, username: owner.username },
          { referenceType: 'SECURITY_ALERT', referenceId: owner.id },
        );
      }
    } catch (err) {
      this.logger.warn(
        `[LoginAlert] هشدار تلاش ناموفق ارسال نشد: ${(err as Error).message}`,
      );
    }
  }

  /** تغییر امنیتی حساب (رمز، ورود دومرحله‌ای، کدهای بازیابی) */
  async onSecurityChange(owner: AlertOwner, change: string) {
    try {
      const vars = { change, time: formatTehranTime() };
      if (owner.kind === 'user') {
        await this.sms.sendToUser('AUTH_SECURITY_CHANGE', owner.id, vars, {
          referenceType: 'SECURITY_ALERT',
        });
      } else if (owner.phone) {
        await this.sms.send(
          'ADMIN_SECURITY_CHANGE',
          owner.phone,
          { ...vars, name: owner.fullName, username: owner.username },
          { referenceType: 'SECURITY_ALERT', referenceId: owner.id },
        );
      }
    } catch (err) {
      this.logger.warn(
        `[LoginAlert] اطلاع‌رسانی تغییر امنیتی ارسال نشد: ${(err as Error).message}`,
      );
    }
  }

  async listDevices(owner: { kind: 'user' | 'admin'; id: string }) {
    return this.prisma.loginDevice.findMany({
      where:
        owner.kind === 'user'
          ? { userId: owner.id }
          : { adminUserId: owner.id },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        label: true,
        lastIp: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    });
  }
}
