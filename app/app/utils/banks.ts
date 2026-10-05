// اطلاعات نمایشی بانک‌ها برای کارت‌های بانکی (تشخیص از ۶ رقم اول کارت)
// رنگ‌ها تقریبی و فقط برای زیبایی کارت هستند.

export interface BankBrand {
  name: string;
  /** دو رنگ گرادیان پس‌زمینه‌ی کارت */
  from: string;
  to: string;
  /** حرف/نشان کوتاه روی کارت */
  mark: string;
}

const B = (name: string, from: string, to: string, mark: string): BankBrand => ({
  name,
  from,
  to,
  mark,
});

const MELLI = B("بانک ملی", "#0b3d6b", "#1f6fb2", "ملی");
const MELLAT = B("بانک ملت", "#9e1b22", "#e2343c", "ملت");
const SADERAT = B("بانک صادرات", "#14306b", "#2f5bb7", "صادرات");
const TEJARAT = B("بانک تجارت", "#173e86", "#3a73c9", "تجارت");
const SEPAH = B("بانک سپه", "#0d2f5e", "#c79a2b", "سپه");
const PASARGAD = B("بانک پاسارگاد", "#1a1a1a", "#c9a227", "پاسارگاد");
const SAMAN = B("بانک سامان", "#006c9e", "#29b6e8", "سامان");
const PARSIAN = B("بانک پارسیان", "#7a1626", "#c1374d", "پارسیان");
const KESHAVARZI = B("بانک کشاورزی", "#0b5d2e", "#2fa35b", "کشاورزی");
const MASKAN = B("بانک مسکن", "#b34a0b", "#f28a2e", "مسکن");
const REFAH = B("بانک رفاه", "#0a3f78", "#2a7fd0", "رفاه");
const AYANDEH = B("بانک آینده", "#5a1530", "#a33a5f", "آینده");
const EGHTESAD = B("بانک اقتصاد نوین", "#3f1f6e", "#7a4bc2", "نوین");
const SHAHR = B("بانک شهر", "#8f0d1f", "#d63447", "شهر");
const RESALAT = B("بانک قرض‌الحسنه رسالت", "#00695f", "#1fb5a4", "رسالت");
const SINA = B("بانک سینا", "#073b72", "#2b74bf", "سینا");
const DEY = B("بانک دی", "#00626e", "#22a9b8", "دی");
const KARAFARIN = B("بانک کارآفرین", "#1b5e20", "#4caf50", "کارآفرین");
const ANSAR = B("بانک انصار", "#1c3c6e", "#4f7cc4", "انصار");
const MEHR = B("بانک قرض‌الحسنه مهر ایران", "#00703c", "#3cc47c", "مهر");
const POST = B("پست بانک", "#0d5b31", "#2e9c5a", "پست");
const TOSEE_SADERAT = B("بانک توسعه صادرات", "#003f73", "#2d7fc1", "توسعه");
const TOSEE_TAAVON = B("بانک توسعه تعاون", "#0f4f4a", "#2c958b", "تعاون");
const IRAN_ZAMIN = B("بانک ایران زمین", "#4a148c", "#8e44c9", "ایران‌زمین");
const GARDESHGARI = B("بانک گردشگری", "#8a1043", "#d6467f", "گردشگری");
const SARMAYEH = B("بانک سرمایه", "#3e2723", "#8d6e63", "سرمایه");
const KHAVARMIANEH = B("بانک خاورمیانه", "#7f1d1d", "#ef4444", "خاورمیانه");
const HEKMAT = B("بانک حکمت ایرانیان", "#33561a", "#7cb342", "حکمت");
const GHAVAMIN = B("بانک قوامین", "#0d47a1", "#42a5f5", "قوامین");
const SANAT = B("بانک صنعت و معدن", "#1e3a5f", "#4a76a8", "صنعت");

const BINS: Record<string, BankBrand> = {
  "603799": MELLI,
  "170019": MELLI,
  "610433": MELLAT,
  "991975": MELLAT,
  "603769": SADERAT,
  "903769": SADERAT,
  "627353": TEJARAT,
  "585983": TEJARAT,
  "589210": SEPAH,
  "604932": SEPAH,
  "502229": PASARGAD,
  "639347": PASARGAD,
  "621986": SAMAN,
  "622106": PARSIAN,
  "639194": PARSIAN,
  "627884": PARSIAN,
  "603770": KESHAVARZI,
  "639217": KESHAVARZI,
  "628023": MASKAN,
  "589463": REFAH,
  "636214": AYANDEH,
  "627412": EGHTESAD,
  "502806": SHAHR,
  "504706": SHAHR,
  "504172": RESALAT,
  "639346": SINA,
  "502938": DEY,
  "627488": KARAFARIN,
  "502910": KARAFARIN,
  "627381": ANSAR,
  "606373": MEHR,
  "627760": POST,
  "627648": TOSEE_SADERAT,
  "207177": TOSEE_SADERAT,
  "502908": TOSEE_TAAVON,
  "505785": IRAN_ZAMIN,
  "505416": GARDESHGARI,
  "639607": SARMAYEH,
  "585947": KHAVARMIANEH,
  "636949": HEKMAT,
  "639599": GHAVAMIN,
  "627961": SANAT,
};

const UNKNOWN: BankBrand = B("کارت بانکی", "#330509", "#7a2a33", "AG");

/** بانک از روی ۶ رقم اول کارت؛ null وقتی هنوز ۶ رقم وارد نشده یا ناشناخته است */
export function detectBank(cardDigits: string): BankBrand | null {
  if (cardDigits.length < 6) return null;
  return BINS[cardDigits.slice(0, 6)] ?? null;
}

export function bankBrand(cardDigits: string, fallbackName?: string): BankBrand {
  const brand = detectBank(cardDigits);
  if (brand) return brand;
  return fallbackName ? { ...UNKNOWN, name: fallbackName } : UNKNOWN;
}

/** الگوریتم Luhn — همه‌ی کارت‌های شتابی ایران رقم کنترل معتبر دارند */
export function isValidCardNumber(digits: string): boolean {
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** «6037991234567890» → «6037 9912 3456 7890» (برای نمایش LTR) */
export function groupCard(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** شبا با فاصله‌گذاری چهارتایی برای خوانایی */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}
