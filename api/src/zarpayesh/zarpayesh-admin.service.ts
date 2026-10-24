// api/src/zarpayesh/zarpayesh-admin.service.ts
//
// پنل مدیریت سامانه ناظر: تنظیمات، اعتبارنامه‌ها، آزمون اتصال مرحله‌به‌مرحله، روشن/خاموش کردن
// (فقط پس از آزمون موفق)، استعلام‌های زنده، کاربران ثبت‌شده، معاملات، ارسال‌ها و لاگ کامل.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ZarPayeshConfig } from '../generated/prisma/client';
import { maskNationalCode } from '../common/privacy/masking';
import { maskPhone } from '../common/audit/mask.util';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import {
  CallContext,
  ZarPayeshClientService,
} from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { ZarPayeshError } from './zarpayesh-errors';
import {
  isValidNationalCode,
  zarPayeshDecrypt,
  zarPayeshEncrypt,
  zarPayeshSelfTest,
} from './zarpayesh-crypto';
import {
  DELIVERY_STATUS_FA,
  ORDER_TYPE_FA,
  PAY_TYPE_FA,
  TXN_STATUS_FA,
  ZARPAYESH_ENDPOINTS,
  ZARPAYESH_ERROR_CODES,
} from './zarpayesh.constants';
import { ListQueryDto, UpdateZarPayeshSettingsDto } from './zarpayesh.dto';

/** آزمون اتصال پس از این مدت برای روشن کردن دوباره لازم است */
const VERIFICATION_VALID_MS = 7 * 24 * 3600_000;

/** تبدیل BigInt/Decimal به رشته برای JSON */
export function serialize<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
}

interface TestStep {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  errorCode?: string | null;
}

@Injectable()
export class ZarPayeshAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ZarPayeshConfigService,
    private readonly client: ZarPayeshClientService,
    private readonly users: ZarPayeshUsersService,
  ) {}

  private ctx(adminId: string, extra: Partial<CallContext> = {}): CallContext {
    return { trigger: 'ADMIN', adminId, ...extra };
  }

  // ════════════════════════════════════════════════════════
  // نمای کلی و تنظیمات
  // ════════════════════════════════════════════════════════

  private async readiness(cfg: ZarPayeshConfig) {
    const creds = await this.config.listCredentials();
    const credsOk = creds.every((c) => c.isSet);
    const verifiedOk =
      !!cfg.connectionVerifiedAt &&
      Date.now() - cfg.connectionVerifiedAt.getTime() < VERIFICATION_VALID_MS;
    const checks = [
      {
        key: 'credentials',
        label: 'نام کاربری، رمز عبور و کلید AES ثبت شده‌اند',
        ok: credsOk,
      },
      {
        key: 'connection',
        label: 'آزمون کامل اتصال در ۷ روز اخیر موفق بوده است',
        ok: verifiedOk,
      },
      {
        key: 'typeId',
        label: 'نوع فلز (Typelist) انتخاب شده است',
        ok: cfg.typeId != null,
      },
      {
        key: 'vaultId',
        label: 'خزانه (Vaultlist) انتخاب شده است',
        ok: cfg.vaultId != null,
      },
    ];
    return { checks, ready: checks.every((c) => c.ok), credentials: creds };
  }

  async overview() {
    const cfg = await this.config.getConfig();
    const since = new Date(Date.now() - 24 * 3600_000);
    const [
      readiness,
      session,
      byStatus,
      needsReview,
      logs24,
      fail24,
      users,
      missingBirthDate,
    ] = await Promise.all([
      this.readiness(cfg),
      this.client.sessionStatus(),
      this.prisma.zarPayeshTrade.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.zarPayeshTrade.count({ where: { needsReview: true } }),
      this.prisma.zarPayeshApiLog.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.zarPayeshApiLog.count({
        where: { createdAt: { gte: since }, success: false },
      }),
      this.prisma.zarPayeshUser.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      // تاریخ تولد برای AddPlatformUsers اجباری است؛ این کاربران پس از روشن شدن نمی‌توانند معامله کنند
      this.prisma.userIdentity.count({
        where: { status: 'VERIFIED', birthDate: null },
      }),
    ]);
    return serialize({
      config: cfg,
      readiness: readiness.checks,
      ready: readiness.ready,
      credentials: readiness.credentials,
      session,
      stats: {
        trades: Object.fromEntries(
          byStatus.map((r) => [r.status, r._count._all]),
        ),
        needsReview,
        calls24h: logs24,
        failed24h: fail24,
        users: Object.fromEntries(users.map((r) => [r.status, r._count._all])),
        verifiedMissingBirthDate: missingBirthDate,
      },
      reference: {
        endpoints: ZARPAYESH_ENDPOINTS,
        errors: ZARPAYESH_ERROR_CODES,
        payTypes: PAY_TYPE_FA,
        orderTypes: ORDER_TYPE_FA,
        txnStatus: TXN_STATUS_FA,
        deliveryStatus: DELIVERY_STATUS_FA,
      },
    });
  }

  async updateSettings(adminId: string, dto: UpdateZarPayeshSettingsDto) {
    const cfg = await this.config.getConfig();
    const data: Prisma.ZarPayeshConfigUpdateInput = {
      updatedByAdminId: adminId,
    };
    if (dto.baseUrl !== undefined && dto.baseUrl !== cfg.baseUrl) {
      data.baseUrl = dto.baseUrl.replace(/\/+$/, '');
      // سرور دیگر = اتصال تأییدنشده و نشست قبلی بی‌اعتبار
      data.connectionVerifiedAt = null;
      await this.client.clearSession();
    }
    if (dto.timeoutMs !== undefined) data.timeoutMs = dto.timeoutMs;
    if (dto.typeId !== undefined) {
      data.typeId = BigInt(dto.typeId);
      data.typeTitle = dto.typeTitle ?? null;
    }
    if (dto.vaultId !== undefined) {
      data.vaultId = BigInt(dto.vaultId);
      data.vaultTitle = dto.vaultTitle ?? null;
    }
    if (dto.buyPayType !== undefined) data.buyPayType = dto.buyPayType;
    if (dto.sellPayType !== undefined) data.sellPayType = dto.sellPayType;
    if (dto.unitPriceBasis !== undefined)
      data.unitPriceBasis = dto.unitPriceBasis;
    if (dto.autoRegisterUsers !== undefined)
      data.autoRegisterUsers = dto.autoRegisterUsers;
    const updated = await this.config.updateConfig(data);
    return serialize({
      message: 'تنظیمات سامانه ناظر ذخیره شد',
      config: updated,
    });
  }

  async setCredential(key: string, value: string) {
    try {
      await this.config.setCredential(key, value);
    } catch (err) {
      if (err instanceof ZarPayeshError)
        throw new BadRequestException(err.message);
      throw err;
    }
    if (key !== 'AES_KEY') await this.client.clearSession();
    return { message: 'اعتبارنامه ذخیره شد — آزمون اتصال را دوباره اجرا کنید' };
  }

  /** روشن/خاموش کردن گزارش خودکار معاملات — روشن کردن فقط با همه‌ی پیش‌شرط‌ها */
  async toggle(adminId: string, enabled: boolean) {
    const cfg = await this.config.getConfig();
    if (enabled) {
      const r = await this.readiness(cfg);
      if (!r.ready) {
        const missing = r.checks.filter((c) => !c.ok).map((c) => c.label);
        throw new BadRequestException(
          `پیش‌شرط‌های روشن کردن کامل نیست: ${missing.join('، ')}`,
        );
      }
    }
    await this.config.updateConfig({
      enabled,
      updatedByAdminId: adminId,
      ...(enabled ? { enabledAt: new Date(), enabledByAdminId: adminId } : {}),
    });
    return {
      message: enabled
        ? 'ثبت خودکار معاملات طلای آب‌شده در سامانه ناظر روشن شد'
        : 'ثبت خودکار معاملات در سامانه ناظر خاموش شد',
    };
  }

  // ════════════════════════════════════════════════════════
  // آزمون اتصال مرحله‌به‌مرحله
  // ════════════════════════════════════════════════════════

  async testConnection(adminId: string) {
    const steps: TestStep[] = [];
    const ctx = this.ctx(adminId);
    const data: Record<string, unknown> = {};
    const run = async (step: string, fn: () => Promise<string | void>) => {
      const t = Date.now();
      try {
        const detail = await fn();
        steps.push({
          step,
          ok: true,
          durationMs: Date.now() - t,
          detail: detail || undefined,
        });
        return true;
      } catch (err) {
        steps.push({
          step,
          ok: false,
          durationMs: Date.now() - t,
          error: (err as Error).message,
          errorCode: err instanceof ZarPayeshError ? err.logCode : null,
        });
        return false;
      }
    };

    this.config.invalidateCredentialCache();
    const credsOk = await run(
      'اعتبارنامه‌ها (ACCOUNT / PASSWORD / AES_KEY)',
      async () => {
        await this.config.getCredentials();
      },
    );
    const cryptoOk =
      credsOk &&
      (await run(
        'رمزنگاری AES-128-GCM (رفت‌وبرگشت با کلید ثبت‌شده)',
        async () => {
          const { aesKey } = await this.config.getCredentials();
          if (!zarPayeshSelfTest(aesKey)) throw new Error('رفت‌وبرگشت ناموفق');
          return 'چیدمان Version(1)+Nonce(12)+CipherText+Tag(16) — Base64';
        },
      ));
    let loginOk = false;
    if (credsOk) {
      await this.client.clearSession();
      loginOk = await run('Login — POST /api/auth/session', async () => {
        const r = await this.client.login(ctx);
        return `userType=${r.userType ?? '—'} · nextStep=${r.nextStep ?? '—'} · انقضای توکن ${r.userTokenInfo?.expire ?? '—'}`;
      });
    }
    let refreshOk = false;
    if (loginOk) {
      refreshOk = await run(
        'Refresh Token — PUT /api/auth/session',
        async () => {
          const r = await this.client.refreshToken(ctx);
          return `انقضای توکن جدید ${r.expire ?? '—'}`;
        },
      );
      await run('Typelist', async () => {
        const list = await this.client.typeList(ctx);
        data.types = list;
        return `${list.length} نوع فلز`;
      });
      await run('Vaultlist', async () => {
        const list = await this.client.vaultList(ctx);
        data.vaults = list;
        return `${list.length} خزانه`;
      });
      await run('PayTypelist', async () => {
        const list = await this.client.payTypeList(ctx);
        data.payTypes = list;
        return `${list.length} ابزار پرداخت`;
      });
      await run('states', async () => {
        const list = await this.client.states(ctx);
        data.states = list;
        return `${list.length} استان`;
      });
    }
    const allOk = steps.every((s) => s.ok) && cryptoOk && loginOk && refreshOk;
    await this.config.updateConfig({
      lastTestAt: new Date(),
      lastTestResult: serialize({ ok: allOk, steps }) as Prisma.InputJsonValue,
      ...(allOk
        ? { connectionVerifiedAt: new Date() }
        : { connectionVerifiedAt: null }),
      updatedByAdminId: adminId,
    });
    return serialize({
      ok: allOk,
      message: allOk
        ? 'اتصال به سامانه ناظر با موفقیت آزمون شد'
        : 'آزمون اتصال کامل نشد — جزئیات مراحل را ببینید',
      steps,
      data,
    });
  }

  // ════════════════════════════════════════════════════════
  // نشست و رمزنگاری
  // ════════════════════════════════════════════════════════

  async sessionAction(adminId: string, action: 'login' | 'refresh' | 'logout') {
    return this.wrap(async () => {
      const ctx = this.ctx(adminId);
      if (action === 'login') {
        const r = await this.client.login(ctx);
        return {
          message: 'ورود انجام شد',
          userType: r.userType,
          nextStep: r.nextStep,
          mobile: r.mobile,
        };
      }
      if (action === 'refresh') {
        const r = await this.client.refreshToken(ctx);
        return {
          message: 'توکن تمدید شد',
          expire: r.expire,
          refreshExpire: r.refreshExpire,
        };
      }
      await this.client.logout(ctx);
      return { message: 'خروج از سامانه ناظر انجام شد' };
    });
  }

  async cryptoEncrypt(value: string) {
    const { aesKey } = await this.config.getCredentials().catch(() => {
      throw new BadRequestException('کلید AES ثبت نشده است');
    });
    return { cipherText: zarPayeshEncrypt(value.trim(), aesKey) };
  }

  /** برای مقایسه با نمونه‌ی رمزشده‌ای که سامانه ناظر با کلید اختصاصی سکو ارائه می‌کند */
  async cryptoDecrypt(value: string) {
    const { aesKey } = await this.config.getCredentials().catch(() => {
      throw new BadRequestException('کلید AES ثبت نشده است');
    });
    try {
      const plain = zarPayeshDecrypt(value.trim(), aesKey);
      const masked = isValidNationalCode(plain)
        ? maskNationalCode(plain)
        : /^09\d{9}$/.test(plain)
          ? maskPhone(plain)
          : plain.length > 4
            ? `${plain.slice(0, 2)}***${plain.slice(-2)}`
            : '***';
      return {
        ok: true,
        message: 'رمزگشایی با کلید ثبت‌شده موفق بود',
        plainMasked: masked,
      };
    } catch (err) {
      return {
        ok: false,
        message: `رمزگشایی ناموفق: ${(err as Error).message}`,
      };
    }
  }

  // ════════════════════════════════════════════════════════
  // استعلام‌های زنده
  // ════════════════════════════════════════════════════════

  lookup(adminId: string, kind: string, fkstate?: number) {
    return this.wrap(async () => {
      const ctx = this.ctx(adminId);
      switch (kind) {
        case 'types':
          return this.client.typeList(ctx);
        case 'vaults':
          return this.client.vaultList(ctx);
        case 'pay-types':
          return this.client.payTypeList(ctx);
        case 'states':
          return this.client.states(ctx);
        case 'cities':
          if (!fkstate)
            throw new BadRequestException('کد استان (fkstate) لازم است');
          return this.client.cities(fkstate, ctx);
        default:
          throw new NotFoundException('استعلام نامعتبر');
      }
    });
  }

  async txnFollowup(adminId: string, srcTrackingNumber: string) {
    if (!/^\d{1,19}$/.test(srcTrackingNumber)) {
      throw new BadRequestException('کد پیگیری نامعتبر است');
    }
    return this.wrap(() =>
      this.client.txnFollowup(srcTrackingNumber, this.ctx(adminId)),
    );
  }

  /** GetUserBalance در سامانه ناظر در کنار موجودی کیف طلای آرکان گلد */
  async userBalance(adminId: string, userId: string) {
    const cfg = await this.config.getConfig();
    if (cfg.typeId == null)
      throw new BadRequestException('نوع فلز تنظیم نشده است');
    const [identity, wallet, holds] = await Promise.all([
      this.prisma.userIdentity.findUnique({
        where: { userId },
        select: { nationalCode: true },
      }),
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.walletHold.aggregate({
        where: { wallet: { userId }, expiresAt: { gt: new Date() } },
        _sum: { amountGrams: true },
      }),
    ]);
    if (!identity?.nationalCode)
      throw new BadRequestException('کد ملی کاربر ثبت نشده است');
    const remote = await this.wrap(() =>
      this.client.getUserBalance(
        identity.nationalCode,
        cfg.typeId.toString(),
        this.ctx(adminId, { userId }),
      ),
    );
    return serialize({
      remote,
      local: {
        goldBalanceGrams: wallet?.goldBalanceGrams ?? null,
        goldBalanceMg: wallet ? wallet.goldBalanceGrams.times(1000) : null,
        heldGrams: holds._sum.amountGrams ?? 0,
      },
    });
  }

  // ════════════════════════════════════════════════════════
  // کاربران
  // ════════════════════════════════════════════════════════

  async listUsers(q: ListQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.ZarPayeshUserWhereInput = {
      ...(q.status
        ? { status: q.status as 'PENDING' | 'REGISTERED' | 'FAILED' }
        : {}),
      ...(q.q ? { user: { phone: { contains: q.q } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.zarPayeshUser.findMany({
        where,
        include: {
          user: {
            select: {
              phone: true,
              identity: {
                select: { firstName: true, lastName: true, nationalCode: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.zarPayeshUser.count({ where }),
    ]);
    return serialize({
      data: rows.map((r) => ({
        userId: r.userId,
        status: r.status,
        registeredAt: r.registeredAt,
        lastSyncedAt: r.lastSyncedAt,
        fkCity: r.fkCity,
        lastError: r.lastError,
        lastErrorCode: r.lastErrorCode,
        fullName:
          `${r.user.identity?.firstName ?? ''} ${r.user.identity?.lastName ?? ''}`.trim(),
        phone: maskPhone(r.user.phone),
        nationalCode: maskNationalCode(r.user.identity?.nationalCode),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }

  previewUser(userId: string) {
    return this.wrap(() => this.users.preview(userId));
  }

  async registerUser(adminId: string, userId: string) {
    await this.wrap(() =>
      this.users.ensureRegistered(userId, this.ctx(adminId, { userId }), {
        autoRegister: true,
        force: true,
      }),
    );
    return { message: 'کاربر در سامانه ناظر ثبت شد' };
  }

  editUser(adminId: string, userId: string, fkCity?: number) {
    return this.wrap(() =>
      this.users.edit(userId, this.ctx(adminId, { userId }), fkCity),
    );
  }

  // ════════════════════════════════════════════════════════
  // معاملات، ارسال‌ها و لاگ‌ها
  // ════════════════════════════════════════════════════════

  async listTrades(q: ListQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.ZarPayeshTradeWhereInput = {
      ...(q.status
        ? {
            status: q.status as Prisma.EnumZarPayeshTradeStatusFilter['equals'],
          }
        : {}),
      ...(q.needsReview === 'true' ? { needsReview: true } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.q && /^\d{1,19}$/.test(q.q)
        ? {
            OR: [
              { srcTrackingNumber: BigInt(q.q) },
              { reserveCode: BigInt(q.q) },
              { referenceNumber: BigInt(q.q) },
            ],
          }
        : q.q
          ? /^[0-9a-f-]{36}$/i.test(q.q)
            ? { orderId: q.q }
            : { user: { phone: { contains: q.q } } }
          : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.zarPayeshTrade.findMany({
        where,
        include: {
          user: {
            select: {
              phone: true,
              identity: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.zarPayeshTrade.count({ where }),
    ]);
    return serialize({
      data: rows.map(({ user, ...t }) => ({
        ...t,
        fullName:
          `${user.identity?.firstName ?? ''} ${user.identity?.lastName ?? ''}`.trim(),
        phone: maskPhone(user.phone),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }

  async getTrade(id: string) {
    const t = await this.prisma.zarPayeshTrade.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('رکورد یافت نشد');
    const logs = await this.prisma.zarPayeshApiLog.findMany({
      where: { srcTrackingNumber: t.srcTrackingNumber },
      orderBy: { createdAt: 'asc' },
    });
    return serialize({ trade: t, logs });
  }

  async listDeliveries(q: ListQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const where: Prisma.ZarPayeshDeliveryWhereInput = q.userId
      ? { userId: q.userId }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.zarPayeshDelivery.findMany({
        where,
        include: {
          user: {
            select: {
              phone: true,
              identity: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.zarPayeshDelivery.count({ where }),
    ]);
    return serialize({
      data: rows.map(({ user, ...d }) => ({
        ...d,
        fullName:
          `${user.identity?.firstName ?? ''} ${user.identity?.lastName ?? ''}`.trim(),
        phone: maskPhone(user.phone),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }

  async listLogs(q: ListQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const where: Prisma.ZarPayeshApiLogWhereInput = {
      ...(q.method ? { method: q.method } : {}),
      ...(q.success ? { success: q.success === 'true' } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.q && /^\d{1,19}$/.test(q.q)
        ? { srcTrackingNumber: BigInt(q.q) }
        : {}),
      ...(q.q && !/^\d+$/.test(q.q) ? { errorCode: q.q } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.zarPayeshApiLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.zarPayeshApiLog.count({ where }),
    ]);
    return serialize({
      data: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }

  /** خطای سامانه ناظر → 400 با پیام فارسی (به‌جای 500) */
  private async wrap<T>(fn: () => Promise<T>): Promise<unknown> {
    try {
      return serialize(await fn());
    } catch (err) {
      if (err instanceof ZarPayeshError)
        throw new BadRequestException(err.message);
      throw err;
    }
  }
}
