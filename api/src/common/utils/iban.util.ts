// api/src/common/utils/iban.util.ts
// اعتبارسنجی شبا (IBAN ایران: IR + ۲ رقم کنترل + ۲۲ رقم) با الگوریتم mod-97

export function normalizeIban(raw: string): string {
  const cleaned = (raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\s|-/g, '')
    .toUpperCase();
  return cleaned.startsWith('IR') ? cleaned : `IR${cleaned}`;
}

export function isValidIranIban(iban: string): boolean {
  if (!/^IR\d{24}$/.test(iban)) return false;
  // جابه‌جایی ۴ کاراکتر اول به انتها؛ I=18 و R=27
  const numeric = `${iban.slice(4)}1827${iban.slice(2, 4)}`;
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}
