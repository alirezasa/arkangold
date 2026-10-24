// api/src/zarpayesh/zarpayesh-client.service.ts
//
// کلاینت HTTP سامانه ناظر (زر پایش) — پیاده‌سازی خط به خط ۱۶ متد مستند ۳.۰.۰.۴:
//   Account:  Login (POST)، Refresh Token (PUT)، Logout (DELETE) روی /api/auth/session
//   Aurelink: Reserve، Approve، Cancel، TxnFollowup، GetUserBalance، MakeDeliveries،
//             MakeDeliverFollowup، SetDeliveries، GetDeliveries، Vaultlist، AddPlatformUsers،
//             EditPlatformUsers، Typelist، cities، states، PayTypelist
//
// - Authorization: Bearer {ACCESS_TOKEN} و Accept: application/json روی همه‌ی متدها
// - توکن (و رفرش‌توکن) رمزشده در Redis نگه داشته می‌شود تا بین همه‌ی نمونه‌های API مشترک باشد؛
//   پیش از انقضا با Refresh Token تمدید و در صورت شکست، دوباره Login می‌شود. پاسخ 401 یک‌بار
//   ورود مجدد و تکرار درخواست را در پی دارد.
// - پاسخ‌ها ممکن است داخل پوشش { version, statusCode, message, isError, responseException, result }
//   باشند (مطابق نمونه‌ی Login/Logout) یا مستقیم؛ هر دو حالت پشتیبانی می‌شود.
// - کد ملی (cid) و موبایل پیش از ارسال با AES-128-GCM رمز می‌شوند (zarpayesh-crypto).
// - هر فراخوانی (موفق/ناموفق) با بدنه‌ی پاک‌سازی‌شده در zarpayesh_api_logs ثبت می‌شود.
import { Inject, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, isAxiosError } from 'axios';
import Redis from 'ioredis';
import { CredentialEncryptionService } from '../integrations/credentials/credential-encryption.service';
import { maskNationalCode } from '../common/privacy/masking';
import { maskPhone } from '../common/audit/mask.util';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import {
  ZarPayeshApiLogService,
  ZarPayeshTrigger,
} from './zarpayesh-api-log.service';
import {
  AUTH_ERROR_CODES,
  ZARPAYESH_DEFAULT_BASE_URL,
  ZARPAYESH_ENDPOINTS,
  ZarPayeshMethod,
} from './zarpayesh.constants';
import { ZarPayeshError } from './zarpayesh-errors';
import {
  isValidNationalCode,
  normalizeMobileForZarPayesh,
  zarPayeshEncrypt,
  ZarPayeshCryptoError,
} from './zarpayesh-crypto';

// ─────────────────────────── انواع درخواست/پاسخ (عیناً مطابق مستند) ───────────────────────────

/** شناسه‌های long: در JSON به‌صورت عدد ارسال می‌شوند؛ عدد خارج از محدوده‌ی امن به رشته تبدیل می‌شود */
export type Long = number | string | bigint;

export interface ZarPayeshTokenInfo {
  token: string;
  expire: string;
  refreshToken: string;
  refreshExpire: string;
}

export interface LoginResult {
  userType?: number;
  nextStep?: number;
  mobile?: string;
  userTokenInfo?: ZarPayeshTokenInfo;
}

export interface ReserveRequest {
  srcTrackingNumber: Long;
  typeId: Long;
  /** میلی‌گرم، بدون اعشار */
  amount: number;
  unitPrice: number;
  totalPrice: number;
  vaultId: Long;
  /** کد ملی خام — کلاینت پیش از ارسال رمز می‌کند */
  nationalCode: string;
  /** Table 1 */
  orderType: number;
  description?: string;
}
export interface ReserveResult {
  reserveCode: Long;
  expireAT?: string;
}

export interface ApproveRequest {
  reserveCode: Long;
  orderType: number;
  amount: number;
  /** Table 2 */
  payType: number;
  rrn: string;
}
export interface ApproveResult {
  status: number;
  message?: string;
  vaultBalance?: number;
  srcTrackingNumber?: Long;
  referenceNumber?: Long;
}

export interface CancelRequest {
  reserveCode: Long;
  orderType: number;
  amount: number;
}
export interface CancelResult {
  status: number;
  srcTrackingNumber?: Long;
  message?: string;
}

export interface TxnFollowupResult {
  amount?: number;
  totalPrice?: number;
  unitPrice?: number;
  rrn?: string;
  orderType?: number;
  payType?: number;
  status?: number;
  VaultId?: Long;
  reservecode?: Long;
  descript?: string;
  expireAt?: string;
  statusName?: string;
  TypeName?: string;
  MeasurementsName?: string;
  referenceNumber?: Long;
  srcTrackingNumber?: Long;
}

export interface UserBalanceResult {
  mobile?: string;
  cid?: string;
  actualBalance?: number;
  availableBalance?: number;
}

export interface MakeDeliveriesRequest {
  amount: number;
  description?: string;
  nationalCode: string;
  typeId: Long;
  srcTrackingNumber: Long;
}
export interface DeliveryRequestResult {
  trackingcode: Long;
  requestedAt?: string;
  mobile?: string;
  cid?: string;
}

export interface SetDeliveriesRequest {
  trackingcode: Long;
  setStatusDeleveries: number;
  approveCode: Long;
}
export interface SetDeliveriesResult {
  actionTime?: string;
  setStatusDeleveries?: number;
}

export interface GetDeliveriesRequest {
  Trackingcode?: Long;
  srcTrackingcode?: Long;
}
export interface GetDeliveriesResult {
  amount?: number;
  status?: number;
  requestedAt?: string;
  approvedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  trackingcode?: Long;
  srcTrackingNumber?: Long;
  description?: string;
  fkType?: Long;
  fkGuserName?: string;
  fkTypeName?: string;
  fkMeasurementsName?: string;
}

export interface VaultItem {
  id: Long;
  balance: number;
  fkVault: Long;
  fkPlatform: Long;
  fkType: Long;
  fkTypeName?: string;
  fkPlatformShortName?: string;
  fkPlatformName?: string;
  fkMeasurementsName?: string;
  description?: string;
  fkVaultName?: string;
  allowedTradeAmount?: number;
}

export interface PlatformUserRequest {
  fullname: string;
  /** موبایل خام — کلاینت با صفر اول نرمال و رمز می‌کند */
  mobile: string;
  /** کد ملی خام — کلاینت رمز می‌کند */
  nationalCode: string;
  /** ISO date-time */
  birthdate: string;
  address: string;
  postCode: string;
  fkCity: number;
}

export interface TypeItem {
  id: Long;
  title: string;
  fkMeasurement?: Long;
  fkParentName?: string;
  fkMeasurementsName?: string;
}
export interface CityItem {
  id: number;
  fkState: number;
  title: string;
}
export interface StateItem {
  id: number;
  title: string;
}
export interface PayTypeItem {
  id: Long;
  title: string;
}

export interface CallContext {
  trigger: ZarPayeshTrigger;
  adminId?: string | null;
  userId?: string | null;
  srcTrackingNumber?: bigint | number | null;
  /** بازنویسی Timeout (مثلاً Approve داخل تراکنش پایگاه داده) */
  timeoutMs?: number;
}

interface Envelope {
  version?: string;
  statusCode?: number;
  message?: string;
  isError?: boolean;
  responseException?: unknown;
  result?: unknown;
}

interface StoredSession extends ZarPayeshTokenInfo {
  obtainedAt: number;
}

const SESSION_KEY = 'zarpayesh:session';
const SESSION_CONTEXT = 'zarpayesh:session';
/** توکن این مقدار پیش از انقضا تمدید می‌شود */
const TOKEN_SAFETY_MS = 60_000;
/** اگر تاریخ انقضا قابل خواندن نبود */
const FALLBACK_TOKEN_TTL_MS = 10 * 60_000;

/**
 * JSON.parse با حفظ دقت اعداد صحیح بزرگ (reserveCode، trackingcode و ... از نوع long):
 * عدد صحیح خارج از Number.MAX_SAFE_INTEGER به رشته‌ی دقیق تبدیل می‌شود.
 */
export function parseJsonPreservingLongs(text: string): unknown {
  return JSON.parse(text, function (
    _key,
    value: unknown,
    context?: { source?: string },
  ) {
    if (
      typeof value === 'number' &&
      !Number.isSafeInteger(value) &&
      context?.source &&
      /^-?\d+$/.test(context.source)
    ) {
      return context.source;
    }
    return value;
  } as (this: unknown, key: string, value: unknown) => unknown);
}

function isEnvelope(body: unknown): body is Envelope {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'result' in body &&
    ('isError' in body || 'statusCode' in body)
  );
}

/** استخراج کد خطای مستند (۱۰۰۱ تا ۱۰۹۹) از پاسخ */
export function extractErrorCode(body: unknown): number | null {
  if (body == null) return null;
  const inRange = (n: unknown) => {
    const v = Number(n);
    return Number.isInteger(v) && v >= 1001 && v <= 1099 ? v : null;
  };
  if (typeof body === 'object' && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    for (const k of ['errorCode', 'code', 'statusCode', 'status']) {
      const v = inRange(o[k]);
      if (v) return v;
    }
    const exc = o.responseException;
    if (exc && typeof exc === 'object') {
      const nested = extractErrorCode(exc);
      if (nested) return nested;
    }
  }
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const m = /(?<!\d)(10[0-9]{2})(?!\d)/.exec(text);
  return m ? inRange(m[1]) : null;
}

function extractErrorMessage(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === 'string') return body.slice(0, 500);
  if (typeof body !== 'object') return JSON.stringify(body);
  const o = body as Record<string, unknown>;
  const exc = o.responseException;
  const parts: string[] = [];
  if (typeof o.message === 'string' && o.message) parts.push(o.message);
  if (typeof exc === 'string' && exc) parts.push(exc);
  else if (exc && typeof exc === 'object') {
    const e = exc as Record<string, unknown>;
    const em = e.exceptionMessage ?? e.message ?? e.title;
    if (typeof em === 'string') parts.push(em);
    if (e.validationErrors) parts.push(JSON.stringify(e.validationErrors));
  }
  // ASP.NET ProblemDetails (خطای اعتبارسنجی لایه‌ی نخست — BadRequest)
  if (typeof o.title === 'string') parts.push(o.title);
  if (o.errors) parts.push(JSON.stringify(o.errors));
  return parts.length ? parts.join(' — ').slice(0, 1000) : null;
}

function toJsonLong(v: Long): number | string {
  const n = typeof v === 'bigint' ? v : BigInt(v);
  if (
    n <= BigInt(Number.MAX_SAFE_INTEGER) &&
    n >= BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Number(n);
  }
  // سامانه‌ی .NET رشته‌ی عددی را هم برای long می‌پذیرد؛ از گرد شدن عدد جلوگیری می‌کنیم
  return n.toString();
}

function parseDate(v: string | undefined | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

@Injectable()
export class ZarPayeshClientService {
  private readonly logger = new Logger(ZarPayeshClientService.name);
  private pendingToken: Promise<string> | null = null;

  constructor(
    private readonly config: ZarPayeshConfigService,
    private readonly apiLog: ZarPayeshApiLogService,
    private readonly encryption: CredentialEncryptionService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ════════════════════════════════════════════════════════
  // Account Methods
  // ════════════════════════════════════════════════════════

  /** 1. Login — POST /api/auth/session (نشست جدید ساخته و ذخیره می‌شود) */
  async login(ctx: CallContext): Promise<LoginResult> {
    const { account, password } = await this.config.getCredentials();
    const result = await this.call<LoginResult>(
      'Login',
      {
        body: { account, password, useOtp: false },
        auth: false,
      },
      ctx,
    );
    const info = result?.userTokenInfo;
    if (!info?.token) {
      throw new ZarPayeshError(
        `ورود به سامانه ناظر انجام نشد (nextStep=${result?.nextStep ?? '—'}) — پاسخ فاقد توکن بود`,
        'AUTHENTICATION',
      );
    }
    await this.storeSession(info);
    return result;
  }

  /** 2. Refresh Token — PUT /api/auth/session */
  async refreshToken(ctx: CallContext): Promise<ZarPayeshTokenInfo> {
    const session = await this.readSession();
    if (!session?.refreshToken) {
      throw new ZarPayeshError(
        'رفرش‌توکنی برای تمدید وجود ندارد — ابتدا ورود انجام شود',
        'AUTHENTICATION',
      );
    }
    const raw = await this.call<ZarPayeshTokenInfo | LoginResult>(
      'RefreshToken',
      { body: { refreshToken: session.refreshToken }, auth: false },
      ctx,
    );
    // پاسخ مستند مستقیماً token/expire/... است؛ ساختار Login هم پذیرفته می‌شود
    const info =
      (raw as LoginResult)?.userTokenInfo ?? (raw as ZarPayeshTokenInfo);
    if (!info?.token) {
      throw new ZarPayeshError(
        'پاسخ Refresh Token فاقد توکن بود',
        'AUTHENTICATION',
      );
    }
    await this.storeSession({
      token: info.token,
      expire: info.expire,
      refreshToken: info.refreshToken || session.refreshToken,
      refreshExpire: info.refreshExpire || session.refreshExpire,
    });
    return info;
  }

  /** 3. Logout — DELETE /api/auth/session */
  async logout(ctx: CallContext): Promise<unknown> {
    const session = await this.readSession();
    try {
      if (!session?.token) return { message: 'نشست فعالی وجود نداشت' };
      return await this.call<unknown>(
        'Logout',
        { auth: true, tokenOverride: session.token, retryAuth: false },
        ctx,
      );
    } finally {
      await this.clearSession();
    }
  }

  /** وضعیت نشست ذخیره‌شده (بدون افشای توکن) */
  async sessionStatus() {
    const s = await this.readSession();
    if (!s) return { active: false };
    return {
      active: true,
      obtainedAt: new Date(s.obtainedAt).toISOString(),
      expire: s.expire,
      refreshExpire: s.refreshExpire,
      tokenValid: this.tokenUsable(s),
    };
  }

  async clearSession() {
    await this.redis.del(SESSION_KEY).catch(() => undefined);
  }

  // ════════════════════════════════════════════════════════
  // Aurelink Methods
  // ════════════════════════════════════════════════════════

  /** 1. Reserve — ثبت رزرو برای درخواست خرید یا فروش */
  async reserve(req: ReserveRequest, ctx: CallContext): Promise<ReserveResult> {
    this.assertWholeMg(req.amount);
    const cid = await this.encryptNationalCode(req.nationalCode);
    const body = {
      srcTrackingNumber: toJsonLong(req.srcTrackingNumber),
      typeId: toJsonLong(req.typeId),
      amount: req.amount,
      unitPrice: req.unitPrice,
      totalPrice: req.totalPrice,
      vaultId: toJsonLong(req.vaultId),
      cid,
      orderType: req.orderType,
      ...(req.description ? { description: req.description } : {}),
    };
    const result = await this.call<ReserveResult>(
      'Reserve',
      { body, logBody: { ...body, cid: maskNationalCode(req.nationalCode) } },
      {
        ...ctx,
        srcTrackingNumber:
          ctx.srcTrackingNumber ?? BigInt(req.srcTrackingNumber),
      },
    );
    if (result?.reserveCode == null) {
      throw new ZarPayeshError(
        'پاسخ Reserve فاقد reserveCode بود',
        'INVALID_RESPONSE',
      );
    }
    return result;
  }

  /** 2. Approve — تأیید و قطعی کردن رزرو */
  async approve(req: ApproveRequest, ctx: CallContext): Promise<ApproveResult> {
    this.assertWholeMg(req.amount);
    const body = {
      reserveCode: toJsonLong(req.reserveCode),
      orderType: req.orderType,
      amount: req.amount,
      payType: req.payType,
      rrn: req.rrn,
    };
    return this.call<ApproveResult>('Approve', { body }, ctx);
  }

  /** 3. Cancel — لغو رزرو فعال */
  async cancel(req: CancelRequest, ctx: CallContext): Promise<CancelResult> {
    this.assertWholeMg(req.amount);
    const body = {
      reserveCode: toJsonLong(req.reserveCode),
      orderType: req.orderType,
      amount: req.amount,
    };
    return this.call<CancelResult>('Cancel', { body }, ctx);
  }

  /** 4. TxnFollowup — وضعیت جاری تراکنش بر اساس کد پیگیری پلتفرم */
  async txnFollowup(srcTrackingNumber: Long | bigint, ctx: CallContext) {
    return this.call<TxnFollowupResult>(
      'TxnFollowup',
      { query: { srcTrackingNumber: String(srcTrackingNumber) } },
      { ...ctx, srcTrackingNumber: BigInt(srcTrackingNumber) },
    );
  }

  /** 5. GetUserBalance — موجودی کاربر به ازای یک دارایی */
  async getUserBalance(nationalCode: string, typeId: Long, ctx: CallContext) {
    const cid = await this.encryptNationalCode(nationalCode);
    const body = { cid, typeId: toJsonLong(typeId) };
    return this.call<UserBalanceResult>(
      'GetUserBalance',
      { body, logBody: { ...body, cid: maskNationalCode(nationalCode) } },
      ctx,
    );
  }

  /** 6. MakeDeliveries — ایجاد درخواست ارسال دارایی */
  async makeDeliveries(req: MakeDeliveriesRequest, ctx: CallContext) {
    this.assertWholeMg(req.amount);
    const cid = await this.encryptNationalCode(req.nationalCode);
    const body = {
      amount: req.amount,
      description: req.description ?? '',
      cid,
      typeId: toJsonLong(req.typeId),
      srcTrackingNumber: toJsonLong(req.srcTrackingNumber),
    };
    const result = await this.call<DeliveryRequestResult>(
      'MakeDeliveries',
      { body, logBody: { ...body, cid: maskNationalCode(req.nationalCode) } },
      { ...ctx, srcTrackingNumber: BigInt(req.srcTrackingNumber) },
    );
    if (result?.trackingcode == null) {
      throw new ZarPayeshError(
        'پاسخ MakeDeliveries فاقد trackingcode بود',
        'INVALID_RESPONSE',
      );
    }
    return result;
  }

  /** 7. MakeDeliverFollowup — نتیجه‌ی MakeDeliveries بر اساس کد پیگیری پلتفرم */
  async makeDeliverFollowup(
    srcTrackingNumber: Long | bigint,
    ctx: CallContext,
  ) {
    return this.call<DeliveryRequestResult>(
      'MakeDeliverFollowup',
      { query: { srcTrackingNumber: String(srcTrackingNumber) } },
      { ...ctx, srcTrackingNumber: BigInt(srcTrackingNumber) },
    );
  }

  /** 8. SetDeliveries — به‌روزرسانی مرحله‌ی مرسوله (۱ Approve، ۲ Ship، ۳ Delivery، ۴ Cancel) */
  async setDeliveries(req: SetDeliveriesRequest, ctx: CallContext) {
    const body = {
      trackingcode: toJsonLong(req.trackingcode),
      setStatusDeleveries: req.setStatusDeleveries,
      approveCode: toJsonLong(req.approveCode),
    };
    return this.call<SetDeliveriesResult>('SetDeliveries', { body }, ctx);
  }

  /** 9. GetDeliveries — وضعیت فعلی مرسوله (یکی از دو کد کافی است) */
  async getDeliveries(req: GetDeliveriesRequest, ctx: CallContext) {
    if (req.Trackingcode == null && req.srcTrackingcode == null) {
      throw new ZarPayeshError(
        'حداقل یکی از Trackingcode یا srcTrackingcode باید مقدار داشته باشد',
        'VALIDATION',
      );
    }
    const body: Record<string, number | string> = {};
    if (req.Trackingcode != null)
      body.Trackingcode = toJsonLong(req.Trackingcode);
    if (req.srcTrackingcode != null)
      body.srcTrackingcode = toJsonLong(req.srcTrackingcode);
    return this.call<GetDeliveriesResult>('GetDeliveries', { body }, ctx);
  }

  /** 10. Vaultlist — فهرست موجودی خزانه‌ها */
  async vaultList(ctx: CallContext) {
    return this.asArray<VaultItem>(
      await this.call<VaultItem[]>('Vaultlist', {}, ctx),
    );
  }

  /** 11. AddPlatformUsers — ثبت کاربر سکو */
  async addPlatformUsers(req: PlatformUserRequest, ctx: CallContext) {
    const { body, logBody } = await this.platformUserBody(req);
    return this.call<unknown>('AddPlatformUsers', { body, logBody }, ctx);
  }

  /** 12. EditPlatformUsers — ویرایش کاربر سکو (کد ملی غیرقابل ویرایش است) */
  async editPlatformUsers(req: PlatformUserRequest, ctx: CallContext) {
    const { body, logBody } = await this.platformUserBody(req);
    return this.call<unknown>('EditPlatformUsers', { body, logBody }, ctx);
  }

  /** 13. Typelist — فلزات قابل معامله */
  async typeList(ctx: CallContext) {
    return this.asArray<TypeItem>(
      await this.call<TypeItem[]>('Typelist', {}, ctx),
    );
  }

  /** 14. cities — شهرهای یک استان */
  async cities(fkstate: number, ctx: CallContext) {
    return this.asArray<CityItem>(
      await this.call<CityItem[]>(
        'cities',
        { query: { fkstate: String(fkstate) } },
        ctx,
      ),
    );
  }

  /** 15. states — فهرست استان‌ها */
  async states(ctx: CallContext) {
    return this.asArray<StateItem>(
      await this.call<StateItem[]>('states', {}, ctx),
    );
  }

  /** 16. PayTypelist — ابزارهای پرداخت */
  async payTypeList(ctx: CallContext) {
    return this.asArray<PayTypeItem>(
      await this.call<PayTypeItem[]>('PayTypelist', {}, ctx),
    );
  }

  // ════════════════════════════════════════════════════════
  // رمزنگاری کد ملی / موبایل
  // ════════════════════════════════════════════════════════

  async encryptNationalCode(nationalCode: string): Promise<string> {
    const code = (nationalCode ?? '').trim();
    if (!isValidNationalCode(code)) {
      // خطای ۱۰۵۴ مستند را پیش از ارسال تشخیص می‌دهیم
      throw new ZarPayeshError(
        'ساختار کد ملی صحیح نمیباشد',
        'VALIDATION',
        1054,
      );
    }
    return this.encrypt(code);
  }

  async encryptMobile(mobile: string): Promise<string> {
    const normalized = normalizeMobileForZarPayesh(mobile ?? '');
    if (!/^09\d{9}$/.test(normalized)) {
      throw new ZarPayeshError('شماره موبایل معتبر نیست', 'VALIDATION');
    }
    return this.encrypt(normalized);
  }

  private async encrypt(plain: string): Promise<string> {
    const { aesKey } = await this.config.getCredentials();
    try {
      return zarPayeshEncrypt(plain, aesKey);
    } catch (err) {
      throw new ZarPayeshError(
        `رمزنگاری با کلید AES ناموفق بود: ${(err as ZarPayeshCryptoError).message}`,
        'CRYPTO',
      );
    }
  }

  private async platformUserBody(req: PlatformUserRequest) {
    const mobile = normalizeMobileForZarPayesh(req.mobile);
    const [encMobile, encCid] = await Promise.all([
      this.encryptMobile(mobile),
      this.encryptNationalCode(req.nationalCode),
    ]);
    const base = {
      fullname: req.fullname,
      birthdate: req.birthdate,
      // «این فیلد حتما باید باشد ولی فعلا میتواند مقدار خالی داشته باشد»
      address: req.address ?? '',
      postCode: req.postCode ?? '',
      fkCity: req.fkCity ?? 0,
    };
    return {
      body: { ...base, mobile: encMobile, cid: encCid },
      logBody: {
        ...base,
        mobile: maskPhone(mobile),
        cid: maskNationalCode(req.nationalCode),
      },
    };
  }

  private assertWholeMg(amount: number) {
    // «این مقدار نباید ارقام اعشار داشته باشد» (میلی‌گرم)
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new ZarPayeshError(
        `مقدار (amount) باید عدد صحیح مثبت به میلی‌گرم باشد؛ مقدار ارسالی: ${amount}`,
        'VALIDATION',
      );
    }
  }

  private asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object') {
      for (const k of ['items', 'data', 'list']) {
        const v = (value as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v as T[];
      }
    }
    return [];
  }

  // ════════════════════════════════════════════════════════
  // توکن و نشست
  // ════════════════════════════════════════════════════════

  private tokenUsable(s: StoredSession): boolean {
    const exp = parseDate(s.expire) ?? s.obtainedAt + FALLBACK_TOKEN_TTL_MS;
    return exp - TOKEN_SAFETY_MS > Date.now();
  }

  private refreshUsable(s: StoredSession): boolean {
    if (!s.refreshToken) return false;
    const exp = parseDate(s.refreshExpire);
    return exp == null || exp - TOKEN_SAFETY_MS > Date.now();
  }

  private async readSession(): Promise<StoredSession | null> {
    let raw: string | null = null;
    try {
      raw = await this.redis.get(SESSION_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(
        await this.encryption.decrypt(raw, SESSION_CONTEXT),
      ) as StoredSession;
    } catch {
      await this.clearSession();
      return null;
    }
  }

  private async storeSession(info: ZarPayeshTokenInfo) {
    const session: StoredSession = { ...info, obtainedAt: Date.now() };
    const refreshExp = parseDate(info.refreshExpire);
    const tokenExp = parseDate(info.expire);
    const until = Math.max(
      refreshExp ?? 0,
      tokenExp ?? Date.now() + FALLBACK_TOKEN_TTL_MS,
    );
    const ttlSec = Math.max(
      60,
      Math.min(30 * 86_400, Math.round((until - Date.now()) / 1000)),
    );
    const encrypted = await this.encryption.encrypt(
      JSON.stringify(session),
      SESSION_CONTEXT,
    );
    await this.redis.setex(SESSION_KEY, ttlSec, encrypted);
  }

  /** توکن معتبر: نشست ذخیره‌شده ← Refresh ← Login (تک‌پرواز بین درخواست‌های همزمان) */
  private async getAccessToken(ctx: CallContext): Promise<string> {
    const session = await this.readSession();
    if (session && this.tokenUsable(session)) return session.token;
    if (this.pendingToken !== null) return this.pendingToken;
    this.pendingToken = (async () => {
      if (session && this.refreshUsable(session)) {
        try {
          return (await this.refreshToken(ctx)).token;
        } catch (err) {
          this.logger.warn(
            `[ZarPayesh] تمدید توکن ناموفق بود؛ ورود مجدد — ${(err as Error).message}`,
          );
        }
      }
      const r = await this.login(ctx);
      return r.userTokenInfo?.token ?? '';
    })().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  // ════════════════════════════════════════════════════════
  // هسته‌ی فراخوانی HTTP + لاگ
  // ════════════════════════════════════════════════════════

  private async call<T>(
    name: ZarPayeshMethod,
    opts: {
      body?: unknown;
      logBody?: unknown;
      query?: Record<string, string>;
      auth?: boolean;
      retryAuth?: boolean;
      tokenOverride?: string;
    },
    ctx: CallContext,
  ): Promise<T> {
    const endpoint = ZARPAYESH_ENDPOINTS[name];
    const cfg = await this.config.getConfig();
    const baseUrl = (cfg.baseUrl || ZARPAYESH_DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    );
    const qs = opts.query
      ? `?${new URLSearchParams(opts.query).toString()}`
      : '';
    const path = `${endpoint.path}${qs}`;
    const auth = opts.auth ?? true;
    const timeout = ctx.timeoutMs ?? cfg.timeoutMs ?? 15_000;

    const token = auth
      ? (opts.tokenOverride ?? (await this.getAccessToken(ctx)))
      : null;

    const startedAt = Date.now();
    let httpStatus: number | null = null;
    let responseBody: unknown = undefined;
    try {
      const res = await axios.request<string>({
        url: `${baseUrl}${path}`,
        method: endpoint.method,
        data:
          endpoint.method === 'GET' || opts.body === undefined
            ? undefined
            : opts.body,
        timeout,
        responseType: 'text',
        transformResponse: (d: unknown) => d,
        validateStatus: () => true,
        headers: {
          Accept: 'application/json',
          ...(opts.body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      httpStatus = res.status;
      const text = typeof res.data === 'string' ? res.data : '';
      try {
        responseBody = text ? parseJsonPreservingLongs(text) : null;
      } catch {
        responseBody = text.slice(0, 2000);
      }

      if (
        httpStatus === 401 &&
        auth &&
        !opts.tokenOverride &&
        opts.retryAuth !== false
      ) {
        await this.writeLog(name, endpoint.method, path, opts, ctx, {
          httpStatus,
          responseBody,
          success: false,
          errorCode: 'HTTP_401',
          errorMessage: 'توکن نامعتبر — ورود مجدد',
          startedAt,
        });
        await this.clearSession();
        return this.call<T>(name, { ...opts, retryAuth: false }, ctx);
      }

      const failed =
        httpStatus >= 400 ||
        (isEnvelope(responseBody) && responseBody.isError === true);
      if (failed) {
        throw this.toError(httpStatus, responseBody);
      }

      const result = (
        isEnvelope(responseBody) ? responseBody.result : responseBody
      ) as T;
      await this.writeLog(name, endpoint.method, path, opts, ctx, {
        httpStatus,
        responseBody,
        success: true,
        startedAt,
      });
      return result;
    } catch (err) {
      const error = this.normalizeError(err);
      if (error.code != null && AUTH_ERROR_CODES.has(error.code)) {
        await this.clearSession();
      }
      await this.writeLog(name, endpoint.method, path, opts, ctx, {
        httpStatus,
        responseBody,
        success: false,
        errorCode: error.logCode,
        errorMessage: error.message,
        startedAt,
      });
      throw error;
    }
  }

  private toError(httpStatus: number, body: unknown): ZarPayeshError {
    const code = extractErrorCode(body);
    const serverMessage = extractErrorMessage(body);
    if (code != null)
      return ZarPayeshError.fromCode(code, serverMessage, httpStatus);
    if (httpStatus === 401 || httpStatus === 403) {
      return new ZarPayeshError(
        `دسترسی به سامانه ناظر رد شد (HTTP ${httpStatus})${serverMessage ? `: ${serverMessage}` : ''}`,
        'AUTHENTICATION',
        null,
        httpStatus,
      );
    }
    if (httpStatus >= 500) {
      return new ZarPayeshError(
        `خطای سرور سامانه ناظر (HTTP ${httpStatus})${serverMessage ? `: ${serverMessage}` : ''}`,
        'SERVER',
        null,
        httpStatus,
      );
    }
    return new ZarPayeshError(
      `درخواست توسط سامانه ناظر رد شد (HTTP ${httpStatus})${serverMessage ? `: ${serverMessage}` : ''}`,
      'REJECTED',
      null,
      httpStatus,
    );
  }

  private normalizeError(err: unknown): ZarPayeshError {
    if (err instanceof ZarPayeshError) return err;
    if (isAxiosError(err)) {
      const e = err as AxiosError;
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        return new ZarPayeshError(
          'پاسخی از سامانه ناظر در زمان مقرر دریافت نشد (Timeout)',
          'TIMEOUT',
        );
      }
      return new ZarPayeshError(
        `اتصال به سامانه ناظر برقرار نشد (${e.code ?? e.message})`,
        'CONNECTION',
      );
    }
    return new ZarPayeshError(
      `خطای پیش‌بینی‌نشده در ارتباط با سامانه ناظر: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
      'CONNECTION',
    );
  }

  private async writeLog(
    name: ZarPayeshMethod,
    httpMethod: string,
    path: string,
    opts: { body?: unknown; logBody?: unknown },
    ctx: CallContext,
    r: {
      httpStatus: number | null;
      responseBody: unknown;
      success: boolean;
      errorCode?: string;
      errorMessage?: string;
      startedAt: number;
    },
  ) {
    await this.apiLog.write({
      method: name,
      httpMethod,
      path,
      requestBody: opts.logBody ?? opts.body,
      responseBody: r.responseBody,
      httpStatus: r.httpStatus,
      success: r.success,
      errorCode: r.errorCode ?? null,
      errorMessage: r.errorMessage ?? null,
      durationMs: Date.now() - r.startedAt,
      srcTrackingNumber: ctx.srcTrackingNumber ?? null,
      userId: ctx.userId ?? null,
      adminId: ctx.adminId ?? null,
      trigger: ctx.trigger,
    });
  }
}
