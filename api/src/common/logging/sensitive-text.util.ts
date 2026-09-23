// api/src/common/logging/sensitive-text.util.ts
// FAU_GEN_EXT.1.4 — لایه‌ی حفاظتی نهایی برای لاگ عمومی برنامه: الگوهای شناسه‌های
// حساس در متن پیام‌ها پیش از چاپ پوشانده می‌شوند، حتی اگر توسعه‌دهنده‌ای در آینده
// آن‌ها را مستقیماً در پیام لاگ قرار دهد. ترتیب قواعد مهم است (از طولانی به کوتاه).

const RULES: Array<[RegExp, (match: string) => string]> = [
  // شبا: IR + ۲۴ رقم
  [/\bIR\d{24}\b/gi, (m) => `${m.slice(0, 4)}****${m.slice(-4)}`],
  // شماره کارت ۱۶ رقمی (پیوسته یا با فاصله/خط تیره)
  [/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, (m) => `${m.slice(0, 4)}********${m.slice(-4)}`],
  // شماره همراه ایران: 09xxxxxxxxx یا +989xxxxxxxxx یا 00989xxxxxxxxx
  [/(?:\+98|0098|\b0)9\d{9}\b/g, (m) => `${m.slice(0, m.length - 7)}***${m.slice(-4)}`],
  // کد ملی ۱۰ رقمی
  [/\b\d{10}\b/g, (m) => `${m.slice(0, 3)}****${m.slice(-3)}`],
];

export function scrubSensitiveText(text: string): string {
  let out = text;
  for (const [pattern, replace] of RULES) {
    out = out.replace(pattern, replace);
  }
  return out;
}
