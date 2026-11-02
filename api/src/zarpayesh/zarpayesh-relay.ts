// api/src/zarpayesh/zarpayesh-relay.ts
//
// اتصال از طریق «سرور رله» (هاست اختصاصی داخل ایران که لینک MPLS شاپرک/زر پایش روی آن تحویل شده است).
// سرویس API روی رانفلر به لینک MPLS دسترسی ندارد؛ پس درخواست‌ها با HTTPS به رله می‌روند و رله آن‌ها را از
// مسیر MPLS به سامانه ناظر می‌رساند. راهنمای کامل: docs/zarpayesh/relay.md
//
// متغیرهای محیطی (همه اختیاری؛ بدون ZARPAYESH_RELAY_URL هیچ رفتاری تغییر نمی‌کند):
//   ZARPAYESH_RELAY_URL          نشانی https رله، مثلاً https://zp-relay.arkan.gold:8443
//                                (در پنل «سامانه ناظر» همین نشانی را به‌عنوان Host بگذارید)
//   ZARPAYESH_RELAY_SECRET       کلید مشترک با رله (هدر X-Arkan-Relay-Key)
//   ZARPAYESH_RELAY_CLIENT_CERT  گواهی کلاینت mTLS (PEM یا Base64 از PEM)
//   ZARPAYESH_RELAY_CLIENT_KEY   کلید خصوصی گواهی کلاینت (PEM یا Base64 از PEM)
//   ZARPAYESH_RELAY_CA           گواهی CA اختصاصی که گواهی سرور رله را امضا کرده (PEM یا Base64 از PEM)
//
// کلید، گواهی و CA فقط به درخواست‌هایی افزوده می‌شوند که مقصدشان دقیقاً همان origin رله است؛ اگر Host پنل
// به سرور دیگری تغییر کند، کلید رله به آن‌جا فرستاده نمی‌شود.
import * as https from 'https';
import { ZarPayeshError } from './zarpayesh-errors';

export const ZARPAYESH_RELAY_HEADER = 'X-Arkan-Relay-Key';

export interface ZarPayeshRelayOptions {
  headers: Record<string, string>;
  httpsAgent?: https.Agent;
}

type Env = Record<string, string | undefined>;

const NONE: ZarPayeshRelayOptions = { headers: {} };

/** PEM خام، PEM با \n به‌صورت متن، یا Base64 از PEM (برای پنل‌هایی که متغیر چندخطی نمی‌پذیرند) */
export function decodePem(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (v.includes('-----BEGIN')) return v.replace(/\\n/g, '\n');
  const decoded = Buffer.from(v, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) {
    throw new ZarPayeshError(
      'مقدار گواهی/کلید رله‌ی زر پایش نه PEM است نه Base64 از PEM',
      'CONFIGURATION',
    );
  }
  return decoded;
}

let cache: { signature: string; agent?: https.Agent } | null = null;

/**
 * تنظیمات اتصال به رله برای یک درخواست. اگر رله تعریف نشده یا مقصد درخواست رله نیست، چیزی اضافه نمی‌شود.
 * @param targetUrl نشانی کامل یا پایه‌ی درخواست
 */
export function getRelayOptions(
  targetUrl: string,
  env: Env = process.env,
): ZarPayeshRelayOptions {
  const relayUrl = env.ZARPAYESH_RELAY_URL?.trim();
  if (!relayUrl) return NONE;

  let relay: URL;
  let target: URL;
  try {
    relay = new URL(relayUrl);
  } catch {
    throw new ZarPayeshError(
      `ZARPAYESH_RELAY_URL نامعتبر است: ${relayUrl}`,
      'CONFIGURATION',
    );
  }
  if (relay.protocol !== 'https:') {
    throw new ZarPayeshError(
      'ZARPAYESH_RELAY_URL باید با https شروع شود (کلید رله نباید بدون رمزنگاری ارسال شود)',
      'CONFIGURATION',
    );
  }
  try {
    target = new URL(targetUrl);
  } catch {
    return NONE;
  }
  if (target.origin !== relay.origin) return NONE;

  const secret = env.ZARPAYESH_RELAY_SECRET?.trim();
  const certRaw = env.ZARPAYESH_RELAY_CLIENT_CERT;
  const keyRaw = env.ZARPAYESH_RELAY_CLIENT_KEY;
  const caRaw = env.ZARPAYESH_RELAY_CA;
  if (!!certRaw?.trim() !== !!keyRaw?.trim()) {
    throw new ZarPayeshError(
      'برای mTLS رله هر دو متغیر ZARPAYESH_RELAY_CLIENT_CERT و ZARPAYESH_RELAY_CLIENT_KEY لازم است',
      'CONFIGURATION',
    );
  }

  const signature = JSON.stringify([relay.origin, certRaw, keyRaw, caRaw]);
  if (cache?.signature !== signature) {
    const cert = decodePem(certRaw);
    const key = decodePem(keyRaw);
    const ca = decodePem(caRaw);
    const agent =
      cert || ca
        ? new https.Agent({
            keepAlive: true,
            maxSockets: 16,
            ...(cert && key ? { cert, key } : {}),
            // CA اختصاصی جایگزین ریشه‌های عمومی می‌شود: فقط سروری که با همان CA امضا شده پذیرفته می‌شود
            ...(ca ? { ca } : {}),
          })
        : undefined;
    cache?.agent?.destroy();
    cache = { signature, agent };
  }

  return {
    headers: secret ? { [ZARPAYESH_RELAY_HEADER]: secret } : {},
    ...(cache.agent ? { httpsAgent: cache.agent } : {}),
  };
}

/** فقط برای آزمون‌ها */
export function resetRelayCache() {
  cache?.agent?.destroy();
  cache = null;
}
