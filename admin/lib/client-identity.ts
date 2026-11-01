// ارسال IP و User-Agent کاربر اصلی از سرور Next.js (BFF) به API.
//
// route handlerهای این برنامه در سمت سرور به API وصل می‌شوند، پس API همه‌ی درخواست‌ها را با IP
// همین سرور می‌بیند و rate limit / مسدودسازی بین همه‌ی کاربران مشترک می‌شود. این ماژول IP و
// User-Agent درخواست ورودی کاربر را به درخواست‌های API اضافه می‌کند. خود راز INTERNAL_PROXY_SECRET
// هرگز ارسال نمی‌شود: هر درخواست امضای HMAC-SHA256 کوتاه‌عمر (۶۰ ثانیه) و یک‌بارمصرف (nonce) روی
// زمان، nonce، IP و User-Agent دارد (FMT_CFG_EXT.1.1 — api/src/common/network/client-ip.ts):
//   - axios: interceptor سراسری که instrumentation.ts یک‌بار نصب می‌کند (axios در next.config
//     به‌عنوان serverExternalPackages تعریف شده تا همه‌ی routeها همین نمونه را استفاده کنند)
//   - fetch: fetch سراسری در اختیار Next.js است؛ هدرهای clientIdentityHeaders() را صریحاً اضافه کنید
//
// این فایل در app/lib و admin/lib یکسان است؛ تغییرات را در هر دو اعمال کنید.
import axios from "axios";
import { BlockList, isIP } from "node:net";
import { createHmac, randomBytes } from "node:crypto";
import { headers } from "next/headers";

const CLIENT_IP_HEADER = "x-arkan-client-ip";
const CLIENT_UA_HEADER = "x-arkan-client-ua";
const PROXY_TS_HEADER = "x-arkan-ts";
const PROXY_NONCE_HEADER = "x-arkan-nonce";
const PROXY_SIG_HEADER = "x-arkan-sig";

// پراکسی‌های مورد اعتماد: شبکه‌ی داخلی پلتفرم (همان پیش‌فرض TRUST_PROXY در API) و رنج‌های CDN
const internal = new BlockList();
internal.addSubnet("127.0.0.0", 8);
internal.addSubnet("10.0.0.0", 8);
internal.addSubnet("172.16.0.0", 12);
internal.addSubnet("192.168.0.0", 16);
internal.addSubnet("169.254.0.0", 16);
internal.addSubnet("100.64.0.0", 10);
internal.addAddress("::1", "ipv6");
internal.addSubnet("fc00::", 7, "ipv6");
internal.addSubnet("fe80::", 10, "ipv6");

// رنج‌های IP CDN (مثلاً آروان‌کلاد) از CDN_PROXY_RANGES — همان مقدار برنامه‌ی API: IP یا CIDR جداشده با
// کاما/فاصله/خط جدید. بدون آن‌ها پشت CDN، IP سرور لبه‌ی CDN به‌جای IP کاربر به API فرستاده می‌شود.
for (const entry of (process.env.CDN_PROXY_RANGES ?? "").split(/[\s,]+/).filter(Boolean)) {
  const [addr, prefix, ...rest] = entry.split("/");
  const family = isIP(addr);
  const bits = Number(prefix);
  if (!family || rest.length) continue;
  const type = family === 6 ? "ipv6" : "ipv4";
  if (prefix === undefined) internal.addAddress(addr, type);
  else if (/^\d+$/.test(prefix) && bits <= (family === 6 ? 128 : 32)) {
    internal.addSubnet(addr, bits, type);
  }
}

function normalizeIp(value: string): string | undefined {
  let ip = value.trim();
  if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : undefined;
}

function isInternal(ip: string): boolean {
  return internal.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}

/**
 * IP کاربر از زنجیره‌ی X-Forwarded-For که reverse proxy پلتفرم می‌سازد: از سمت راست (آخرین hop
 * که پراکسی خودش اضافه کرده) پیمایش می‌شود و hopهای داخلی رد می‌شوند؛ مقادیری که کاربر در ابتدای
 * هدر جعل کرده باشد انتخاب نمی‌شوند.
 */
export function clientIpFromHeaders(incoming: Headers): string | undefined {
  const chain = (incoming.get("x-forwarded-for") ?? "")
    .split(",")
    .map(normalizeIp)
    .filter((ip): ip is string => !!ip);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!isInternal(chain[i])) return chain[i];
  }
  const realIp = normalizeIp(incoming.get("x-real-ip") ?? "");
  return realIp ?? chain[0];
}

function apiOrigins(): Set<string> {
  const fallback =
    process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000";
  const candidates = [
    process.env.NEST_API_URL,
    process.env.NEST_ORIGIN,
    process.env.API_BASE_URL,
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_NEST_ORIGIN,
    fallback,
  ];
  const origins = new Set<string>();
  for (const value of candidates) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // مقدار نامعتبر؛ نادیده گرفته می‌شود
    }
  }
  return origins;
}

/** هدرهای هویت کاربر اصلی برای درخواست به API (در صورت نبود راز یا درخواست ورودی، شیء خالی) */
export async function clientIdentityHeaders(): Promise<Record<string, string>> {
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (!secret) return {};
  let incoming: Headers;
  try {
    incoming = await headers();
  } catch {
    return {}; // خارج از چرخه‌ی یک درخواست (مثلاً زمان build)
  }
  const result: Record<string, string> = {};
  const ip = clientIpFromHeaders(incoming);
  const ua = incoming.get("user-agent");
  if (ip) result[CLIENT_IP_HEADER] = ip;
  if (ua) result[CLIENT_UA_HEADER] = ua;
  if (!ip && !ua) return {};
  const ts = String(Date.now());
  const nonce = randomBytes(18).toString("base64url");
  result[PROXY_TS_HEADER] = ts;
  result[PROXY_NONCE_HEADER] = nonce;
  result[PROXY_SIG_HEADER] = createHmac("sha256", secret)
    .update(`arkan-bff-v1|${ts}|${nonce}|${ip ?? ""}|${ua ?? ""}`, "utf8")
    .digest("base64url");
  return result;
}

const SENSITIVE_QUERY_HEADER = "x-arkan-query";

async function incomingSensitiveQuery(): Promise<string | null> {
  try {
    const value = (await headers()).get(SENSITIVE_QUERY_HEADER);
    return value && value.length <= 4096 ? value : null;
  } catch {
    return null; // خارج از چرخه‌ی یک درخواست
  }
}

const STEP_UP_HEADERS = ["x-step-up-token", "x-step-up-code"];

async function incomingStepUpHeaders(): Promise<[string, string][]> {
  try {
    const incoming = await headers();
    return STEP_UP_HEADERS.map((n) => [n, incoming.get(n) ?? ""] as [string, string]).filter(
      ([, v]) => v.length > 0 && v.length <= 128,
    );
  } catch {
    return []; // خارج از چرخه‌ی یک درخواست
  }
}

const INSTALLED = Symbol.for("arkan.clientIdentityForwarding");

export function installClientIdentityForwarding(): void {
  const scope = globalThis as typeof globalThis & { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;

  // FTP_DIT_EXT.3.3 — ارتباط داخلی BFF → API باید رمزنگاری‌شده (https) باشد
  const internalApi = process.env.NEST_API_URL || process.env.NEST_ORIGIN || "";
  if (
    process.env.NODE_ENV === "production" &&
    /^http:\/\//i.test(internalApi) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(internalApi)
  ) {
    console.warn(
      `[security] NEST_API_URL بدون TLS است (${new URL(internalApi).host})؛ برای رمزنگاری ارتباط داخلی از نشانی https استفاده کنید (FTP_DIT_EXT.3.3)`,
    );
  }

  const origins = apiOrigins();
  const isApiUrl = (url: string) => {
    try {
      return origins.has(new URL(url).origin);
    } catch {
      return false;
    }
  };

  axios.interceptors.request.use(async (config) => {
    if (isApiUrl(axios.getUri(config))) {
      for (const [name, value] of Object.entries(await clientIdentityHeaders())) {
        config.headers.set(name, value);
      }
      // FDP_ACC_EXT.1.1 — پارامترهای حساس جستجو که مرورگر در سرآیند فرستاده، بدون ورود به URL
      // به API منتقل می‌شوند (api/src/common/network/sensitive-query.ts)
      const sensitive = await incomingSensitiveQuery();
      if (sensitive) config.headers.set(SENSITIVE_QUERY_HEADER, sensitive);
      // FTA_TSE_EXT.4.2 — توکن/کد تأیید ثانویه‌ی عملیات حساس از مرورگر به API منتقل می‌شود
      for (const [name, value] of await incomingStepUpHeaders()) {
        config.headers.set(name, value);
      }
    }
    return config;
  });
}
