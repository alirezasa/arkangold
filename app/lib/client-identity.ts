// ارسال IP و User-Agent کاربر اصلی از سرور Next.js (BFF) به API.
//
// route handlerهای این برنامه در سمت سرور به API وصل می‌شوند، پس API همه‌ی درخواست‌ها را با IP
// همین سرور می‌بیند و rate limit / مسدودسازی بین همه‌ی کاربران مشترک می‌شود. این ماژول IP و
// User-Agent درخواست ورودی کاربر را همراه راز مشترک INTERNAL_PROXY_SECRET به درخواست‌های API اضافه
// می‌کند و API فقط با همین راز این مقادیر را می‌پذیرد (api/src/common/network/client-ip.ts):
//   - axios: interceptor سراسری که instrumentation.ts یک‌بار نصب می‌کند (axios در next.config
//     به‌عنوان serverExternalPackages تعریف شده تا همه‌ی routeها همین نمونه را استفاده کنند)
//   - fetch: fetch سراسری در اختیار Next.js است؛ هدرهای clientIdentityHeaders() را صریحاً اضافه کنید
//
// این فایل در app/lib و admin/lib یکسان است؛ تغییرات را در هر دو اعمال کنید.
import axios from "axios";
import { BlockList, isIP } from "node:net";
import { headers } from "next/headers";

const CLIENT_IP_HEADER = "x-arkan-client-ip";
const CLIENT_UA_HEADER = "x-arkan-client-ua";
const PROXY_SECRET_HEADER = "x-arkan-proxy-secret";

// پراکسی‌های داخلی پلتفرم (همان پیش‌فرض TRUST_PROXY در API)
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
  result[PROXY_SECRET_HEADER] = secret;
  return result;
}

const INSTALLED = Symbol.for("arkan.clientIdentityForwarding");

export function installClientIdentityForwarding(): void {
  const scope = globalThis as typeof globalThis & { [INSTALLED]?: boolean };
  if (scope[INSTALLED]) return;
  scope[INSTALLED] = true;

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
    }
    return config;
  });
}
