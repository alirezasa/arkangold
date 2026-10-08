// admin/app/components/labels/barcode.ts
//
// رمزگذاری بارکد میله‌ای بدون کتابخانه‌ی خارجی: EAN-13 (بارکد کالا) و Code 128 (شماره سفارش،
// کدپستی، کد رهگیری). خروجی آرایه‌ی ماژول‌هاست (true = میله‌ی سیاه) تا به SVG با واحد میلی‌متر
// و پهنای میله‌ی هم‌تراز با نقطه‌های هد چاپ دستگاه تبدیل شود.

export type BarcodeFormat = "EAN13" | "CODE128";

export interface EncodedBarcode {
  /** ماژول‌ها از چپ به راست؛ true = میله */
  modules: boolean[];
  /** میله‌های محافظ EAN-13 که بلندتر از بقیه رسم می‌شوند */
  guards: boolean[];
  /** فضای خالی الزامی دو طرف (به ماژول) */
  quietLeft: number;
  quietRight: number;
  /** متن زیر بارکد */
  text: string;
}

// ───────────────────────────── EAN-13 ─────────────────────────────

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function normalizeDigits(v: string): string {
  return v
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** ۱۲ رقم → با رقم کنترل؛ ۱۳ رقم → فقط اگر رقم کنترل درست باشد؛ در غیر این صورت null */
export function completeEan13(raw: string): string | null {
  const v = normalizeDigits(raw).replace(/[\s-]/g, "");
  if (/^\d{12}$/.test(v)) return v + String(ean13CheckDigit(v));
  if (/^\d{13}$/.test(v) && ean13CheckDigit(v.slice(0, 12)) === Number(v[12])) return v;
  return null;
}

function encodeEan13(raw: string): EncodedBarcode | string {
  const code = completeEan13(raw);
  if (!code) return "بارکد EAN-13 نامعتبر است (۱۳ رقم با رقم کنترل درست)";
  const parity = EAN_PARITY[Number(code[0])];
  let bits = "101";
  let guard = "111";
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    bits += parity[i - 1] === "L" ? EAN_L[d] : EAN_G[d];
    guard += "0000000";
  }
  bits += "01010";
  guard += "11111";
  for (let i = 7; i <= 12; i++) {
    bits += EAN_R[Number(code[i])];
    guard += "0000000";
  }
  bits += "101";
  guard += "111";
  return {
    modules: [...bits].map((b) => b === "1"),
    guards: [...guard].map((b) => b === "1"),
    quietLeft: 11,
    quietRight: 7,
    text: code,
  };
}

// ───────────────────────────── Code 128 ─────────────────────────────

// پهنای میله/فاصله‌ی هر نماد (۰ تا ۱۰۵) و نماد پایان
const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const C128_STOP = "2331112";
const START_B = 104;
const START_C = 105;
const CODE_C = 99;

function encodeCode128(raw: string): EncodedBarcode | string {
  const value = normalizeDigits(raw).trim();
  if (!value) return "مقدار بارکد خالی است";
  if (!/^[\x20-\x7E]+$/.test(value)) return "Code 128 فقط حروف و ارقام انگلیسی را می‌پذیرد";
  if (value.length > 48) return "مقدار بارکد طولانی است";

  const codes: number[] = [];
  if (/^\d+$/.test(value) && value.length >= 2) {
    // مجموعه‌ی C: هر دو رقم یک نماد — بارکد ارقام (کدپستی، رهگیری) نصف پهنا می‌شود
    let rest = value;
    if (value.length % 2 === 1) {
      codes.push(START_B, value.charCodeAt(0) - 32, CODE_C);
      rest = value.slice(1);
    } else {
      codes.push(START_C);
    }
    for (let i = 0; i < rest.length; i += 2) codes.push(Number(rest.slice(i, i + 2)));
  } else {
    codes.push(START_B);
    for (const ch of value) codes.push(ch.charCodeAt(0) - 32);
  }
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
  codes.push(checksum % 103);

  const modules: boolean[] = [];
  for (const pattern of [...codes.map((c) => C128[c]), C128_STOP]) {
    [...pattern].forEach((w, i) => {
      for (let k = 0; k < Number(w); k++) modules.push(i % 2 === 0);
    });
  }
  return { modules, guards: modules.map(() => false), quietLeft: 10, quietRight: 10, text: value };
}

export function encodeBarcode(format: BarcodeFormat, value: string): EncodedBarcode | string {
  return format === "EAN13" ? encodeEan13(value) : encodeCode128(value);
}
