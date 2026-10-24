// api/src/zarpayesh/fake-zarpayesh-server.helper-spec.ts
//
// شبیه‌ساز سرور سامانه ناظر (زر پایش) برای آزمون‌ها — رفتار مستند ۳.۰.۰.۴ را تقلید می‌کند:
// پوشش پاسخ { version, statusCode, message, isError, responseException, result }، توکن Bearer،
// رمزگشایی cid/mobile با کلید AES مشترک (خطای ۱۰۵۳)، ثبت کاربر (۱۰۱۶ تکراری)، رزرو/تأیید/لغو
// و استعلام وضعیت. (به‌خاطر پسوند، در build و اجرای jest به‌عنوان آزمون حساب نمی‌شود.)
import * as http from 'http';
import { AddressInfo } from 'net';
import { zarPayeshDecrypt } from './zarpayesh-crypto';

/** JSON با bigint به‌صورت عدد خام (مثل سرور .NET) */
function rawJson(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) =>
    typeof x === 'bigint' ? `__BIG__${x}` : x,
  ).replace(/"__BIG__(\d+)"/g, '$1');
}

export const FAKE_AES_KEY = '1C1C1C1C1C1C1C1C1D1D1D1D1D1D1D1D';

export type JsonScalar = string | number | boolean | null;

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  auth: string | null;
  body: Record<string, JsonScalar> | null;
}

interface Reservation {
  srcTrackingNumber: string;
  reserveCode: bigint;
  orderType: number;
  amount: number;
  cid: string;
  status: number;
  rrn?: string;
  referenceNumber?: number;
}

export class FakeZarPayeshServer {
  readonly requests: FakeRequest[] = [];
  readonly users = new Set<string>();
  readonly reservations = new Map<string, Reservation>();
  /** بازنویسی پاسخ یک مسیر (برای شبیه‌سازی خطا) — مقدار null یعنی رفتار عادی */
  readonly overrides = new Map<
    string,
    (
      req: FakeRequest,
    ) => { status: number; body: unknown; delayMs?: number } | null
  >();
  tokenCounter = 0;
  validTokens = new Set<string>();
  private server!: http.Server;
  /** خارج از محدوده‌ی امن Number (long واقعی) */
  private nextReserveCode = 9_100_000_000_000_000_001n;
  baseUrl = '';

  async start() {
    this.server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://x');
        const fr: FakeRequest = {
          method: req.method ?? 'GET',
          path: url.pathname,
          query: url.searchParams,
          auth: req.headers.authorization ?? null,
          body: raw ? (JSON.parse(raw) as Record<string, JsonScalar>) : null,
        };
        this.requests.push(fr);
        const o = this.overrides.get(fr.path)?.(fr) ?? null;
        const out = o ?? this.handle(fr);
        setTimeout(() => {
          res.writeHead(out.status, { 'Content-Type': 'application/json' });
          res.end(typeof out.body === 'string' ? out.body : rawJson(out.body));
        }, o?.delayMs ?? 0);
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop() {
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  calls(path: string) {
    return this.requests.filter((r) => r.path === path);
  }

  private env(result: unknown, statusCode = 200) {
    return {
      status: statusCode >= 1000 ? 400 : statusCode,
      body: {
        version: '3.0.0.4',
        statusCode,
        message: statusCode >= 400 ? 'error' : 'OK',
        isError: statusCode >= 400,
        responseException: null,
        result,
      },
    };
  }

  private err(code: number) {
    return {
      status: 400,
      body: {
        version: '3.0.0.4',
        statusCode: 400,
        message: `${code}`,
        isError: true,
        responseException: { exceptionMessage: `خطا ${code}` },
        result: null,
      },
    };
  }

  private issueToken() {
    const t = `tok-${++this.tokenCounter}`;
    this.validTokens.add(t);
    const exp = new Date(Date.now() + 3600_000).toISOString();
    return {
      token: t,
      expire: exp,
      refreshToken: `ref-${t}`,
      refreshExpire: exp,
    };
  }

  private decryptOr1053(v: JsonScalar | undefined): string | null {
    try {
      return zarPayeshDecrypt(String(v), FAKE_AES_KEY);
    } catch {
      return null;
    }
  }

  private handle(r: FakeRequest): { status: number; body: unknown } {
    const p = r.path;
    if (p === '/api/auth/session') {
      if (r.method === 'POST') {
        if (r.body?.account !== 'platform' || r.body?.password !== 'secret')
          return this.err(1032);
        return this.env(
          {
            userType: 2,
            nextStep: 0,
            mobile: '0912***4567',
            userTokenInfo: this.issueToken(),
          },
          201,
        );
      }
      if (r.method === 'PUT') return this.env(this.issueToken());
      if (r.method === 'DELETE') return this.env('ok');
    }
    const token = r.auth?.replace(/^Bearer /, '') ?? '';
    if (!this.validTokens.has(token)) return { status: 401, body: '' };

    const b = r.body ?? {};
    switch (p) {
      case '/api/aure/Aurelink/AddPlatformUsers': {
        const cid = this.decryptOr1053(b.cid);
        const mobile = this.decryptOr1053(b.mobile);
        if (!cid || !mobile) return this.err(1053);
        if (!mobile.startsWith('0')) return this.err(1015);
        if (this.users.has(cid)) return this.err(1016);
        this.users.add(cid);
        return this.env({}, 201);
      }
      case '/api/aure/Aurelink/EditPlatformUsers':
        return this.env({}, 201);
      case '/api/aure/Aurelink/Reserve': {
        const cid = this.decryptOr1053(b.cid);
        if (!cid) return this.err(1053);
        if (!this.users.has(cid)) return this.err(1002);
        if (!Number.isInteger(b.amount)) return this.err(1015);
        const src = String(b.srcTrackingNumber);
        if (this.reservations.has(src)) return this.err(1037);
        const reserveCode = this.nextReserveCode++;
        this.reservations.set(src, {
          srcTrackingNumber: src,
          reserveCode,
          orderType: Number(b.orderType),
          amount: Number(b.amount),
          cid,
          status: 1,
        });
        // reserveCode عمداً بزرگ‌تر از MAX_SAFE_INTEGER است (حفظ دقت long)
        return this.env(
          {
            reserveCode,
            expireAT: new Date(Date.now() + 300_000).toISOString(),
          },
          201,
        );
      }
      case '/api/aure/Aurelink/Approve':
      case '/api/aure/Aurelink/Cancel': {
        const res = [...this.reservations.values()].find(
          (x) => String(x.reserveCode) === String(b.reserveCode),
        );
        if (!res) return this.err(1006);
        if (Number(b.amount) !== res.amount) return this.err(1023);
        if (Number(b.orderType) !== res.orderType) return this.err(1024);
        if (p.endsWith('Cancel')) {
          if (res.status === 2) return this.err(1025);
          res.status = 3;
          return this.env(
            {
              status: 201,
              srcTrackingNumber: Number(res.srcTrackingNumber),
              message: 'لغو شد',
            },
            201,
          );
        }
        res.status = 2;
        res.rrn = String(b.rrn);
        res.referenceNumber = 777000 + this.reservations.size;
        return this.env(
          {
            status: 2,
            message: 'موفق',
            vaultBalance: 1000000,
            srcTrackingNumber: Number(res.srcTrackingNumber),
            referenceNumber: res.referenceNumber,
          },
          201,
        );
      }
      case '/api/aure/Aurelink/TxnFollowup': {
        const res = this.reservations.get(
          r.query.get('srcTrackingNumber') ?? '',
        );
        if (!res) return this.err(1008);
        return this.env({
          amount: res.amount,
          status: res.status,
          reservecode: res.reserveCode,
          referenceNumber: res.referenceNumber ?? 0,
          srcTrackingNumber: Number(res.srcTrackingNumber),
          statusName: ['', 'رزرو شده', 'تایید شده', 'ابطال شده', 'منقضی شده'][
            res.status
          ],
        });
      }
      case '/api/aure/Aurelink/GetUserBalance': {
        const cid = this.decryptOr1053(b.cid);
        if (!cid) return this.err(1053);
        return this.env(
          {
            mobile: '0912*****67',
            cid: '163****613',
            actualBalance: 1500,
            availableBalance: 1500,
          },
          201,
        );
      }
      case '/api/aure/Aurelink/MakeDeliveries':
        return this.env(
          {
            trackingcode: 55501,
            requestedAt: new Date().toISOString(),
            mobile: '0912*****67',
            cid: '163****613',
          },
          201,
        );
      case '/api/aure/Aurelink/SetDeliveries':
        if (Number(b.setStatusDeleveries) === 1 && !Number(b.approveCode))
          return this.err(1035);
        return this.env(
          {
            actionTime: new Date().toISOString(),
            setStatusDeleveries: b.setStatusDeleveries,
          },
          201,
        );
      case '/api/aure/Aurelink/Typelist':
        return this.env([
          {
            id: 1,
            title: 'طلای آب‌شده ۱۸ عیار',
            fkMeasurement: 2,
            fkParentName: 'طلا',
            fkMeasurementsName: 'میلی‌گرم',
          },
        ]);
      case '/api/aure/Aurelink/Vaultlist':
        return this.env([
          {
            id: 10,
            balance: 5000000,
            fkVault: 3,
            fkPlatform: 7,
            fkType: 1,
            fkVaultName: 'خزانه مرکزی',
            allowedTradeAmount: 4000000,
          },
        ]);
      case '/api/aure/Aurelink/PayTypelist':
        return this.env([{ id: 11, title: 'wallet' }]);
      case '/api/aure/Aurelink/states':
        return this.env([{ id: 8, title: 'تهران' }]);
      case '/api/aure/Aurelink/cities':
        return this.env([
          { id: 1, fkState: Number(r.query.get('fkstate')), title: 'تهران' },
        ]);
      default:
        return { status: 404, body: '' };
    }
  }
}
