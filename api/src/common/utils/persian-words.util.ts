// api/src/common/utils/persian-words.util.ts
// تبدیل عدد به حروف فارسی — برای درج «مبلغ به حروف» روی اسناد رسمی.

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];
const TENS = [
  '',
  '',
  'بیست',
  'سی',
  'چهل',
  'پنجاه',
  'شصت',
  'هفتاد',
  'هشتاد',
  'نود',
];
const HUNDREDS = [
  '',
  'یکصد',
  'دویست',
  'سیصد',
  'چهارصد',
  'پانصد',
  'ششصد',
  'هفتصد',
  'هشتصد',
  'نهصد',
];
const SCALES = ['', ' هزار', ' میلیون', ' میلیارد', ' بیلیون', ' بیلیارد'];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;

  if (h > 0) parts.push(HUNDREDS[h]);

  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }

  return parts.join(' و ');
}

/**
 * عدد را به حروف فارسی تبدیل می‌کند.
 * numberToPersianWords(5520000000) → «پنج میلیارد و پانصد و بیست میلیون»
 */
export function numberToPersianWords(value: number | string): string {
  let n = typeof value === 'string' ? value.trim() : String(Math.trunc(value));
  if (n.startsWith('-')) return 'منفی ' + numberToPersianWords(n.slice(1));
  n = n.replace(/^0+/, '');
  if (n === '') return 'صفر';
  if (n.length > 18) return ''; // خارج از دامنه پشتیبانی‌شده

  // گروه‌بندی سه‌رقمی از راست
  const groups: number[] = [];
  for (let i = n.length; i > 0; i -= 3) {
    groups.push(Number(n.slice(Math.max(0, i - 3), i)));
  }

  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    words.push(threeDigitsToWords(groups[i]) + SCALES[i]);
  }

  return words.join(' و ');
}

/** «پنج میلیارد و پانصد و بیست میلیون ریال» */
export function rialInWords(amountRial: number | string): string {
  const w = numberToPersianWords(amountRial);
  return w ? `${w} ریال` : '';
}
