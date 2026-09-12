// api/src/common/utils/luhn.util.ts
// رقم کنترل شناسه واریز — خطای تایپی کاربر هنگام درج در فیلد «شناسه پایا»
// را قبل از رفتن به بانک می‌گیرد.

export function luhnCheckDigit(payload: string): number {
  let sum = 0;
  let double = true; // رقم کنترل در انتها اضافه می‌شود، پس از راست شروع می‌کنیم
  for (let i = payload.length - 1; i >= 0; i--) {
    let d = payload.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function withLuhn(payload: string): string {
  return payload + String(luhnCheckDigit(payload));
}

export function isValidLuhn(full: string): boolean {
  if (!/^\d+$/.test(full) || full.length < 2) return false;
  const payload = full.slice(0, -1);
  return luhnCheckDigit(payload) === Number(full.slice(-1));
}
