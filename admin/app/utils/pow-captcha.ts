// admin/app/utils/pow-captcha.ts
// «بررسی امنیتی» خودکار (Proof-of-Work) — FIA_UAU_EXT.2.1
// وقتی API به‌دلیل ریسک (تلاش‌های ناموفق یا رفتار خودکار) پاسخ 428 با کد CAPTCHA_REQUIRED بدهد،
// مرورگر یک چالش می‌گیرد و با SHA-256 عدد مخفی را پیدا می‌کند (حدود یک ثانیه، بدون تعامل کاربر)
// و درخواست را دوباره با راه‌حل می‌فرستد. هیچ سرویس خارجی (مثل reCAPTCHA) لازم نیست.
import axios from "axios";

interface PowChallenge {
  algorithm: "SHA-256";
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
}

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export async function solvePowChallenge(): Promise<string> {
  const { data: c } = await axios.get<PowChallenge>("/api/auth-security/challenge");
  const enc = new TextEncoder();
  for (let n = 0; n <= c.maxnumber; n++) {
    const hash = toHex(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + n)));
    if (hash === c.challenge) {
      return btoa(
        JSON.stringify({
          algorithm: c.algorithm,
          challenge: c.challenge,
          number: n,
          salt: c.salt,
          signature: c.signature,
        }),
      );
    }
  }
  throw new Error("بررسی امنیتی ناموفق بود؛ دوباره تلاش کنید");
}

export function isCaptchaRequired(err: unknown): boolean {
  return (
    axios.isAxiosError(err) &&
    err.response?.status === 428 &&
    (err.response.data as { code?: string } | undefined)?.code === "CAPTCHA_REQUIRED"
  );
}

/** درخواست را می‌فرستد و در صورت نیاز به بررسی امنیتی، آن را حل و یک‌بار دیگر تلاش می‌کند */
export async function withCaptcha<T>(
  send: (captcha?: string) => Promise<T>,
  onSolving?: (solving: boolean) => void,
): Promise<T> {
  try {
    return await send();
  } catch (err) {
    if (!isCaptchaRequired(err)) throw err;
    onSolving?.(true);
    try {
      const captcha = await solvePowChallenge();
      return await send(captcha);
    } finally {
      onSolving?.(false);
    }
  }
}
