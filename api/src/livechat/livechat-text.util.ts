// api/src/livechat/livechat-text.util.ts
//
// پردازش متن فارسی برای حالت هوشمند چت: یکسان‌سازی حروف عربی/فارسی، ارقام، اعراب و نیم‌فاصله؛
// حذف کلمات پرتکرار بی‌معنا؛ ریشه‌یابی سبک (پسوندهای رایج) و امتیاز شباهت پرسش با پایگاه دانش.

const ARABIC_TO_PERSIAN: Record<string, string> = {
  ي: 'ی',
  ى: 'ی',
  ك: 'ک',
  ة: 'ه',
  ۀ: 'ه',
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ؤ: 'و',
  ئ: 'ی',
};

const STOP_WORDS = new Set([
  'و',
  'در',
  'به',
  'از',
  'که',
  'این',
  'آن',
  'ان',
  'را',
  'با',
  'برای',
  'یا',
  'تا',
  'هم',
  'من',
  'ما',
  'شما',
  'او',
  'است',
  'هست',
  'هستم',
  'بود',
  'شد',
  'شده',
  'می',
  'چه',
  'چی',
  'چطور',
  'چطوری',
  'چگونه',
  'چرا',
  'کجا',
  'کی',
  'آیا',
  'ایا',
  'لطفا',
  'سلام',
  'ممنون',
  'مرسی',
  'باید',
  'میشه',
  'میخوام',
  'میخواستم',
  'خواستم',
  'بپرسم',
  'یه',
  'یک',
  'رو',
  'اینکه',
  'نحوه',
  'روش',
  'درباره',
  'مورد',
  'خیلی',
  'دارم',
  'دارید',
  'کنم',
  'کنیم',
  'کنید',
  'کنند',
  'بکنم',
  'شود',
  'میشود',
  'دارد',
  'هستند',
  'ها',
  'های',
  'کرد',
  'کردم',
]);

// پسوندهای رایج (به ترتیب طولانی‌تر اول)
const SUFFIXES = [
  'هایی',
  'هایم',
  'هایت',
  'هایش',
  'ترین',
  'های',
  'ها',
  'ات',
  'ام',
  'تر',
  'ی',
  'م',
  'ش',
  'ت',
];

/** یکسان‌سازی متن برای مقایسه */
export function normalizePersian(input: string): string {
  let s = (input ?? '').toLowerCase();
  s = s.replace(/[يىكةۀأإآٱؤئ]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c);
  s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  // اعراب، تطویل و نویسه‌های کنترلی جهت متن
  s = s.replace(/[\u064B-\u065F\u0670\u0640\u200E\u200F\u202A-\u202E]/g, '');
  // نیم‌فاصله‌ی پسوند/پیشوند فعل چسبانده می‌شود (شمش‌ها ← شمشها، می‌خواهم ← میخواهم) و
  // نیم‌فاصله‌ی واژه‌های مرکب فاصله می‌شود (اصالت‌سنجی ← اصالت سنجی)
  s = s.replace(/\u200D/g, '');
  s = s.replace(/(^|\s)(ن?می)\u200C/g, '$1$2');
  s = s.replace(
    /\u200C(?=(?:هایی|های|ها|ترین|تر|ام|ات|اش|ای|اند|ایم|اید)(?:\s|$))/g,
    '',
  );
  s = s.replace(/\u200C/g, ' ');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function stem(word: string): string {
  if (word.length <= 3) return word;
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 2) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

/** واژه‌های معنادار متن (یکسان‌شده، بدون کلمات پرتکرار، ریشه‌یابی‌شده) */
export function tokenize(input: string): string[] {
  const words = normalizePersian(input)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w));
  // «می» جدا از فعل حذف شد؛ فعل‌های چسبیده (میخوام) هم بدون «می» مقایسه می‌شوند
  return words.map((w) =>
    stem(w.startsWith('می') && w.length > 4 ? w.slice(2) : w),
  );
}

/** شباهت دو واژه: یکسان (۱)، پیشوند مشترک بلند (۰.۸) یا فاصله‌ی ویرایشی یک (۰.۷ برای واژه‌های بلند) */
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const min = Math.min(a.length, b.length);
  if (min >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.8;
  if (min >= 4 && levenshteinAtMostOne(a, b)) return 0.7;
  return 0;
}

function levenshteinAtMostOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * امتیاز تطبیق پرسش بازدیدکننده با یک متن مرجع (۰ تا ۱): میانگین «پوشش» دو طرف — چه سهمی از
 * واژه‌های پرسش در مرجع هست و برعکس — تا پرسش‌های کوتاه با مرجع بلند امتیاز کاذب بالا نگیرند.
 */
export function similarity(queryTokens: string[], refTokens: string[]): number {
  if (!queryTokens.length || !refTokens.length) return 0;
  const coverage = (from: string[], to: string[]) => {
    let sum = 0;
    for (const w of from) {
      let best = 0;
      for (const r of to) {
        best = Math.max(best, wordSimilarity(w, r));
        if (best === 1) break;
      }
      sum += best;
    }
    return sum / from.length;
  };
  const q = coverage(queryTokens, refTokens);
  const r = coverage(refTokens, queryTokens);
  return 0.6 * q + 0.4 * r;
}

/** امتیاز کلمات کلیدی: اگر همه‌ی واژه‌های یک کلید در پرسش باشند، تطبیق قوی محسوب می‌شود */
export function keywordScore(
  queryTokens: string[],
  keywords: string[],
): number {
  let best = 0;
  for (const kw of keywords) {
    const kt = tokenize(kw);
    if (!kt.length) continue;
    const hit =
      kt.filter((k) => queryTokens.some((q) => wordSimilarity(q, k) >= 0.8))
        .length / kt.length;
    best = Math.max(best, hit);
  }
  return best;
}

/** آیا متن یکی از عبارت‌ها را (پس از یکسان‌سازی) در بر دارد */
export function containsPhrase(text: string, phrases: string[]): boolean {
  const n = ` ${normalizePersian(text)} `;
  return phrases.some((p) => {
    const np = normalizePersian(p);
    return np.length > 0 && n.includes(` ${np} `);
  });
}
