// api/src/common/serialization/response-allowlist.interceptor.ts
//
// FDP_RIP_EXT.1.3 / FDP_ACC_EXT.2.3 — لایه‌ی دفاعی سراسری روی همه‌ی پاسخ‌های API: حتی اگر
// سرویسی به‌اشتباه کل رکورد پایگاه داده را برگرداند، فیلدهای داخلی/امنیتی (هش رمز، راز TOTP،
// هش توکن‌ها، مقدار رمزشده‌ی اعتبارنامه‌ها) هرگز به خروجی JSON راه نمی‌یابند. انتخاب فیلدهای
// مجاز همچنان در لایه‌ی سرویس (select/نگاشت صریح) انجام می‌شود؛ این interceptor تضمین نهایی است.
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** نام فیلدهایی که در هیچ پاسخی مجاز نیستند */
export const FORBIDDEN_RESPONSE_FIELDS = new Set([
  'passwordHash',
  'totpSecret',
  'pendingTotpSecret',
  'backupCodesHash',
  'refreshTokenHash',
  'accessTokenHash',
  'apiKeyHash',
  'courierTokenHash',
  'otpHash',
  'codeHash',
  'encryptedValue',
]);

const MAX_DEPTH = 12;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export function stripForbiddenFields(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = stripForbiddenFields(item, depth + 1);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (!isPlainObject(value)) return value;
  let out: Record<string, unknown> | null = null;
  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_RESPONSE_FIELDS.has(key)) {
      out ??= { ...value };
      delete out[key];
      continue;
    }
    const next = stripForbiddenFields(val, depth + 1);
    if (next !== val) {
      out ??= { ...value };
      out[key] = next;
    }
  }
  return out ?? value;
}

@Injectable()
export class ResponseAllowlistInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(map((body) => stripForbiddenFields(body)));
  }
}
