// api/src/common/auth-security/session-context.service.ts
//
// FDP_ACC_EXT.2.4 / FDP_ACC_EXT.3.4 — کنترل امنیتی تطبیقی در طول نشست فعال (نه فقط هنگام ورود):
// ویژگی‌های محیطی هر درخواست با ویژگی‌های ثبت‌شده هنگام ساخت نشست مقایسه می‌شود.
//   - تغییر خانواده‌ی مرورگر/سیستم‌عامل (User-Agent) → نشست بلافاصله خاتمه می‌یابد (نشانه‌ی
//     سرقت توکن) — برای کاربر و ادمین
//   - تغییر شبکه‌ی مبدأ (IP؛ با دقت /24 برای IPv4 و /64 برای IPv6):
//       ادمین/نماینده → نشست بسته و ورود مجدد (با عامل دوم) لازم است
//       کاربر عادی → فقط ثبت رویداد (IP موبایل‌ها مدام عوض می‌شود)
//   - رابط مدیریتی (کارشناسان سازمان): فهرست IP مجاز و بازه‌ی ساعت مجاز کاری (اختیاری)
// همه‌ی کنترل‌ها از «تنظیمات سیستم» قابل تنظیم‌اند. مقایسه فقط وقتی انجام می‌شود که IP/UA
// واقعی کاربر در دسترس باشد (INTERNAL_PROXY_SECRET تنظیم شده)؛ در غیر این صورت همه‌ی درخواست‌های
// BFF با مشخصات سرور Next.js دیده می‌شوند و مقایسه بی‌معناست.
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
import Redis from 'ioredis';
import { SystemConfigService } from '../../system-config/system-config.service';
import { AuditService } from '../audit/audit.service';
import { describeDevice } from './login-alert.service';

export type SessionKind = 'user' | 'admin';

export interface SessionContextInput {
  kind: SessionKind;
  /** کارشناس سازمان (نه نماینده‌ی فروش) — مشمول فهرست IP مجاز و ساعت کاری */
  staff?: boolean;
  sessionId: string;
  ownerId: string;
  sessionIp?: string | null;
  sessionUa?: string | null;
  requestIp?: string | null;
  requestUa?: string | null;
}

export type SessionDecision =
  | { action: 'allow' }
  | { action: 'allow_flag'; reason: 'ip_changed' }
  | {
      action: 'terminate';
      reason: 'device_changed' | 'ip_changed';
    };

const normIp = (ip?: string | null) => (ip ?? '').replace(/^::ffff:/, '').trim();

/** آیا دو IP در یک شبکه‌اند؟ (IPv4: /24 — IPv6: /64) */
export function sameNetwork(a?: string | null, b?: string | null): boolean {
  const x = normIp(a);
  const y = normIp(b);
  if (!x || !y) return true; // داده‌ی ناکافی → تغییر قابل‌تشخیص نیست
  if (x === y) return true;
  const vx = isIP(x);
  const vy = isIP(y);
  if (!vx || vx !== vy) return false;
  if (vx === 4) return x.split('.').slice(0, 3).join('.') === y.split('.').slice(0, 3).join('.');
  const expand = (ip: string) => {
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const fill = Array(Math.max(0, 8 - h.length - t.length)).fill('0');
    return [...h, ...fill, ...t].map((p) => p.padStart(4, '0').toLowerCase());
  };
  return expand(x).slice(0, 4).join(':') === expand(y).slice(0, 4).join(':');
}

/** آیا خانواده‌ی مرورگر/سیستم‌عامل یکسان است؟ (نسخه نادیده گرفته می‌شود) */
export function sameDevice(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true;
  return describeDevice(a) === describeDevice(b);
}

/** «07:00-22:00» → دقیقه‌ی شروع/پایان؛ مقدار خالی/نامعتبر یعنی بدون محدودیت */
export function parseAllowedHours(raw?: string | null): { from: number; to: number } | null {
  const m = (raw ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const from = Number(m[1]) * 60 + Number(m[2]);
  const to = Number(m[3]) * 60 + Number(m[4]);
  if (from > 1440 || to > 1440 || from === to) return null;
  return { from, to };
}

export function withinHours(range: { from: number; to: number }, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const min = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const t = h * 60 + min;
  // بازه می‌تواند از نیمه‌شب عبور کند (مثلاً 22:00-06:00)
  return range.from < range.to ? t >= range.from && t < range.to : t >= range.from || t < range.to;
}

/** فهرست IP/CIDR جدا با ویرگول یا فاصله → BlockList (null = بدون محدودیت) */
export function parseIpAllowlist(raw?: string | null): { list: BlockList; invalid: string[] } | null {
  const items = (raw ?? '').split(/[,،\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  const list = new BlockList();
  const invalid: string[] = [];
  for (const item of items) {
    const [addr, prefix] = item.split('/');
    const v = isIP(addr);
    if (!v) {
      invalid.push(item);
      continue;
    }
    const family = v === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) list.addAddress(addr, family);
    else {
      const p = Number(prefix);
      if (!Number.isInteger(p) || p < 0 || p > (v === 4 ? 32 : 128)) invalid.push(item);
      else list.addSubnet(addr, p, family);
    }
  }
  return { list, invalid };
}

export function ipAllowed(list: BlockList, ip?: string | null): boolean {
  const x = normIp(ip);
  const v = isIP(x);
  if (!v) return false;
  return list.check(x, v === 4 ? 'ipv4' : 'ipv6');
}

@Injectable()
export class SessionContextService {
  private readonly logger = new Logger(SessionContextService.name);

  constructor(
    private systemConfig: SystemConfigService,
    private audit: AuditService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  /** آیا IP/UA واقعی کاربر به API می‌رسد؟ */
  contextAvailable(): boolean {
    return !!process.env.INTERNAL_PROXY_SECRET;
  }

  async settings() {
    const [bindingEnabled, adminIpBinding, allowlist, hours] = await Promise.all([
      this.systemConfig.getBoolean('security.session.binding_enabled', true),
      this.systemConfig.getBoolean('security.session.admin_ip_binding', true),
      this.systemConfig.get('security.admin.ip_allowlist', ''),
      this.systemConfig.get('security.admin.allowed_hours', ''),
    ]);
    return {
      bindingEnabled,
      adminIpBinding,
      ipAllowlist: allowlist ?? '',
      allowedHours: hours ?? '',
      contextAvailable: this.contextAvailable(),
    };
  }

  /** مقایسه‌ی ویژگی‌های درخواست با نشست */
  async evaluate(input: SessionContextInput): Promise<SessionDecision> {
    if (!this.contextAvailable()) return { action: 'allow' };
    const s = await this.settings();
    if (!s.bindingEnabled) return { action: 'allow' };
    if (!sameDevice(input.sessionUa, input.requestUa)) {
      return { action: 'terminate', reason: 'device_changed' };
    }
    if (!sameNetwork(input.sessionIp, input.requestIp)) {
      return input.kind === 'admin' && s.adminIpBinding
        ? { action: 'terminate', reason: 'ip_changed' }
        : { action: 'allow_flag', reason: 'ip_changed' };
    }
    return { action: 'allow' };
  }

  /**
   * FDP_ACC_EXT.3.4 — لایه‌های اضافه‌ی رابط مدیریتی برای کارشناسان: IP مجاز و ساعت مجاز.
   * هم هنگام ورود و هم در هر درخواست بررسی می‌شود.
   */
  async assertAdminAccessAllowed(ip?: string | null, now = new Date()) {
    const [allowRaw, hoursRaw] = await Promise.all([
      this.systemConfig.get('security.admin.ip_allowlist', ''),
      this.systemConfig.get('security.admin.allowed_hours', ''),
    ]);
    const allow = parseIpAllowlist(allowRaw);
    if (allow && this.contextAvailable() && !ipAllowed(allow.list, ip)) {
      throw new ForbiddenException({
        message: 'دسترسی به پنل مدیریت از این شبکه مجاز نیست',
        code: 'ADMIN_IP_NOT_ALLOWED',
      });
    }
    const hours = parseAllowedHours(hoursRaw);
    if (hours && !withinHours(hours, now)) {
      throw new ForbiddenException({
        message: 'دسترسی به پنل مدیریت خارج از ساعات مجاز کاری امکان‌پذیر نیست',
        code: 'ADMIN_OUTSIDE_HOURS',
      });
    }
  }

  /** ثبت رویداد و ساخت خطای خاتمه‌ی نشست */
  async onTerminated(input: SessionContextInput, reason: 'device_changed' | 'ip_changed') {
    const event = {
      action:
        input.kind === 'admin' ? 'admin_auth.session_context_changed' : 'auth.session_context_changed',
      source: SessionContextService.name,
      success: false,
      ip: input.requestIp ?? null,
      userAgent: input.requestUa ?? null,
      newValue: {
        reason,
        sessionId: input.sessionId,
        sessionDevice: describeDevice(input.sessionUa),
        requestDevice: describeDevice(input.requestUa),
      },
    };
    if (input.kind === 'admin') {
      await this.audit.logAdmin({ ...event, adminUserId: input.ownerId });
    } else {
      await this.audit.logUser({ ...event, userId: input.ownerId, entityType: 'session' });
    }
    this.logger.warn(`نشست ${input.kind} به‌دلیل ${reason} خاتمه یافت (${input.sessionId})`);
    return new UnauthorizedException({
      message:
        reason === 'device_changed'
          ? 'مشخصات دستگاه شما در طول نشست تغییر کرد؛ برای امنیت حساب، دوباره وارد شوید'
          : 'شبکه‌ی اتصال شما در طول نشست تغییر کرد؛ برای امنیت، دوباره وارد شوید',
      code: 'SESSION_CONTEXT_CHANGED',
    });
  }

  /** ثبت تغییر شبکه‌ی کاربر عادی (بدون خاتمه) — یک‌بار برای هر شبکه‌ی جدید در هر نشست */
  async onFlagged(input: SessionContextInput) {
    const key = `sess-net:${input.sessionId}:${normIp(input.requestIp)}`;
    const first = await this.redis
      .set(key, '1', 'EX', 7 * 86_400, 'NX')
      .catch(() => null);
    if (first !== 'OK') return;
    await this.audit.logUser({
      userId: input.ownerId,
      action: 'auth.session_network_changed',
      entityType: 'session',
      entityId: input.sessionId,
      ip: input.requestIp ?? null,
      userAgent: input.requestUa ?? null,
      source: SessionContextService.name,
      success: true,
    });
  }
}
