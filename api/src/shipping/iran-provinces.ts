// api/src/shipping/iran-provinces.ts
//
// فهرست استاندارد ۳۱ استان کشور با کد ثابت انگلیسی (مبنای تطبیق منطقه و تعرفه‌ی ارسال) و
// شهرهای پرکاربرد هر استان (فقط برای پیشنهاد در فرم آدرس؛ شهر آزاد هم پذیرفته می‌شود).

export interface IranProvince {
  code: string;
  name: string;
  /** مرکز استان */
  capital: string;
  cities: string[];
}

export const IRAN_PROVINCES: IranProvince[] = [
  {
    code: 'TEHRAN',
    name: 'تهران',
    capital: 'تهران',
    cities: [
      'تهران',
      'اسلامشهر',
      'شهریار',
      'قدس',
      'ملارد',
      'ورامین',
      'پاکدشت',
      'رباط‌کریم',
      'قرچک',
      'پردیس',
      'دماوند',
      'بهارستان',
      'پرند',
      'اندیشه',
      'نسیم‌شهر',
      'لواسان',
      'رودهن',
      'بومهن',
      'فیروزکوه',
    ],
  },
  {
    code: 'ALBORZ',
    name: 'البرز',
    capital: 'کرج',
    cities: [
      'کرج',
      'فردیس',
      'نظرآباد',
      'هشتگرد',
      'ماهدشت',
      'محمدشهر',
      'کمال‌شهر',
      'اشتهارد',
    ],
  },
  {
    code: 'ESFAHAN',
    name: 'اصفهان',
    capital: 'اصفهان',
    cities: [
      'اصفهان',
      'کاشان',
      'خمینی‌شهر',
      'نجف‌آباد',
      'شاهین‌شهر',
      'شهرضا',
      'فولادشهر',
      'مبارکه',
      'گلپایگان',
      'نطنز',
      'زرین‌شهر',
    ],
  },
  {
    code: 'FARS',
    name: 'فارس',
    capital: 'شیراز',
    cities: [
      'شیراز',
      'مرودشت',
      'جهرم',
      'فسا',
      'کازرون',
      'لار',
      'داراب',
      'فیروزآباد',
      'آباده',
      'اقلید',
      'صدرا',
    ],
  },
  {
    code: 'KHORASAN_RAZAVI',
    name: 'خراسان رضوی',
    capital: 'مشهد',
    cities: [
      'مشهد',
      'نیشابور',
      'سبزوار',
      'تربت حیدریه',
      'قوچان',
      'کاشمر',
      'تربت جام',
      'گناباد',
      'چناران',
      'تایباد',
    ],
  },
  {
    code: 'AZARBAYJAN_SHARGHI',
    name: 'آذربایجان شرقی',
    capital: 'تبریز',
    cities: [
      'تبریز',
      'مراغه',
      'مرند',
      'میانه',
      'اهر',
      'بناب',
      'سراب',
      'عجب‌شیر',
      'شبستر',
      'سهند',
    ],
  },
  {
    code: 'AZARBAYJAN_GHARBI',
    name: 'آذربایجان غربی',
    capital: 'ارومیه',
    cities: [
      'ارومیه',
      'خوی',
      'میاندوآب',
      'مهاباد',
      'بوکان',
      'سلماس',
      'نقده',
      'پیرانشهر',
      'ماکو',
      'سردشت',
    ],
  },
  {
    code: 'ARDABIL',
    name: 'اردبیل',
    capital: 'اردبیل',
    cities: [
      'اردبیل',
      'پارس‌آباد',
      'مشگین‌شهر',
      'خلخال',
      'گرمی',
      'نمین',
      'بیله‌سوار',
    ],
  },
  {
    code: 'ILAM',
    name: 'ایلام',
    capital: 'ایلام',
    cities: ['ایلام', 'دهلران', 'ایوان', 'آبدانان', 'دره‌شهر', 'مهران'],
  },
  {
    code: 'BUSHEHR',
    name: 'بوشهر',
    capital: 'بوشهر',
    cities: [
      'بوشهر',
      'برازجان',
      'گناوه',
      'کنگان',
      'جم',
      'دیلم',
      'عسلویه',
      'خورموج',
    ],
  },
  {
    code: 'CHAHARMAHAL_BAKHTIARI',
    name: 'چهارمحال و بختیاری',
    capital: 'شهرکرد',
    cities: ['شهرکرد', 'بروجن', 'فارسان', 'لردگان', 'فرخ‌شهر', 'هفشجان'],
  },
  {
    code: 'KHORASAN_JONUBI',
    name: 'خراسان جنوبی',
    capital: 'بیرجند',
    cities: ['بیرجند', 'قائن', 'طبس', 'فردوس', 'نهبندان', 'سربیشه'],
  },
  {
    code: 'KHORASAN_SHOMALI',
    name: 'خراسان شمالی',
    capital: 'بجنورد',
    cities: ['بجنورد', 'شیروان', 'اسفراین', 'جاجرم', 'آشخانه', 'فاروج'],
  },
  {
    code: 'KHUZESTAN',
    name: 'خوزستان',
    capital: 'اهواز',
    cities: [
      'اهواز',
      'دزفول',
      'آبادان',
      'بندر ماهشهر',
      'اندیمشک',
      'خرمشهر',
      'بهبهان',
      'ایذه',
      'شوشتر',
      'مسجدسلیمان',
    ],
  },
  {
    code: 'ZANJAN',
    name: 'زنجان',
    capital: 'زنجان',
    cities: ['زنجان', 'ابهر', 'خرمدره', 'قیدار', 'هیدج', 'ماهنشان'],
  },
  {
    code: 'SEMNAN',
    name: 'سمنان',
    capital: 'سمنان',
    cities: ['سمنان', 'شاهرود', 'دامغان', 'گرمسار', 'مهدی‌شهر', 'ایوانکی'],
  },
  {
    code: 'SISTAN_BALUCHESTAN',
    name: 'سیستان و بلوچستان',
    capital: 'زاهدان',
    cities: [
      'زاهدان',
      'چابهار',
      'ایرانشهر',
      'زابل',
      'سراوان',
      'خاش',
      'نیک‌شهر',
    ],
  },
  {
    code: 'QAZVIN',
    name: 'قزوین',
    capital: 'قزوین',
    cities: [
      'قزوین',
      'تاکستان',
      'الوند',
      'بوئین‌زهرا',
      'آبیک',
      'اقبالیه',
      'محمدیه',
    ],
  },
  {
    code: 'QOM',
    name: 'قم',
    capital: 'قم',
    cities: ['قم', 'جعفریه', 'قنوات', 'کهک', 'دستجرد'],
  },
  {
    code: 'KORDESTAN',
    name: 'کردستان',
    capital: 'سنندج',
    cities: [
      'سنندج',
      'سقز',
      'مریوان',
      'بانه',
      'قروه',
      'کامیاران',
      'بیجار',
      'دیواندره',
    ],
  },
  {
    code: 'KERMAN',
    name: 'کرمان',
    capital: 'کرمان',
    cities: [
      'کرمان',
      'سیرجان',
      'رفسنجان',
      'جیرفت',
      'بم',
      'زرند',
      'کهنوج',
      'شهربابک',
      'بافت',
    ],
  },
  {
    code: 'KERMANSHAH',
    name: 'کرمانشاه',
    capital: 'کرمانشاه',
    cities: [
      'کرمانشاه',
      'اسلام‌آباد غرب',
      'جوانرود',
      'کنگاور',
      'هرسین',
      'سنقر',
      'صحنه',
      'پاوه',
      'قصر شیرین',
    ],
  },
  {
    code: 'KOHGILUYEH_BOYERAHMAD',
    name: 'کهگیلویه و بویراحمد',
    capital: 'یاسوج',
    cities: ['یاسوج', 'دوگنبدان', 'دهدشت', 'لیکک', 'سی‌سخت'],
  },
  {
    code: 'GOLESTAN',
    name: 'گلستان',
    capital: 'گرگان',
    cities: [
      'گرگان',
      'گنبد کاووس',
      'علی‌آباد کتول',
      'بندر ترکمن',
      'آزادشهر',
      'کردکوی',
      'کلاله',
      'آق‌قلا',
      'مینودشت',
    ],
  },
  {
    code: 'GILAN',
    name: 'گیلان',
    capital: 'رشت',
    cities: [
      'رشت',
      'بندر انزلی',
      'لاهیجان',
      'لنگرود',
      'تالش',
      'آستارا',
      'صومعه‌سرا',
      'رودسر',
      'آستانه اشرفیه',
      'فومن',
    ],
  },
  {
    code: 'LORESTAN',
    name: 'لرستان',
    capital: 'خرم‌آباد',
    cities: [
      'خرم‌آباد',
      'بروجرد',
      'دورود',
      'کوهدشت',
      'الیگودرز',
      'نورآباد',
      'ازنا',
      'الشتر',
    ],
  },
  {
    code: 'MAZANDARAN',
    name: 'مازندران',
    capital: 'ساری',
    cities: [
      'ساری',
      'بابل',
      'آمل',
      'قائم‌شهر',
      'بهشهر',
      'چالوس',
      'نکا',
      'بابلسر',
      'تنکابن',
      'نوشهر',
      'رامسر',
      'محمودآباد',
    ],
  },
  {
    code: 'MARKAZI',
    name: 'مرکزی',
    capital: 'اراک',
    cities: [
      'اراک',
      'ساوه',
      'خمین',
      'محلات',
      'دلیجان',
      'شازند',
      'تفرش',
      'آشتیان',
    ],
  },
  {
    code: 'HORMOZGAN',
    name: 'هرمزگان',
    capital: 'بندرعباس',
    cities: [
      'بندرعباس',
      'قشم',
      'کیش',
      'بندر لنگه',
      'میناب',
      'حاجی‌آباد',
      'رودان',
    ],
  },
  {
    code: 'HAMEDAN',
    name: 'همدان',
    capital: 'همدان',
    cities: [
      'همدان',
      'ملایر',
      'نهاوند',
      'اسدآباد',
      'تویسرکان',
      'کبودرآهنگ',
      'رزن',
      'بهار',
    ],
  },
  {
    code: 'YAZD',
    name: 'یزد',
    capital: 'یزد',
    cities: ['یزد', 'میبد', 'اردکان', 'بافق', 'مهریز', 'ابرکوه', 'تفت'],
  },
];

const BY_CODE = new Map(IRAN_PROVINCES.map((p) => [p.code, p]));

/**
 * یکسان‌سازی متن فارسی برای مقایسه: ی/ک عربی، آ، نیم‌فاصله و فاصله‌ها، و پیشوند «استان»/«شهر».
 * «تهران »، «تهـران» و «شهر تهران» همه یک مقدار می‌شوند.
 */
export function normalizeFa(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[ً-ْ]/g, '')
    .replace(/^\s*(استان|شهرستان|شهر)\s+/, '')
    .replace(/[\s‌‏‎-]+/g, '')
    .toLowerCase();
}

/** نام‌های متداول دیگر (برای آدرس‌های قدیمی که استان را آزاد تایپ کرده‌اند) */
const ALIASES: Record<string, string> = {
  tehran: 'TEHRAN',
  karaj: 'ALBORZ',
  کرج: 'ALBORZ',
  خراسان: 'KHORASAN_RAZAVI',
  مشهد: 'KHORASAN_RAZAVI',
  چهارمحال: 'CHAHARMAHAL_BAKHTIARI',
  چهارمحالبختیاری: 'CHAHARMAHAL_BAKHTIARI',
  کهگیلویه: 'KOHGILUYEH_BOYERAHMAD',
  سیستان: 'SISTAN_BALUCHESTAN',
  سیستانبلوچستان: 'SISTAN_BALUCHESTAN',
  اذربایجانشرقی: 'AZARBAYJAN_SHARGHI',
  اذربایجانغربی: 'AZARBAYJAN_GHARBI',
  تبریز: 'AZARBAYJAN_SHARGHI',
  ارومیه: 'AZARBAYJAN_GHARBI',
  شیراز: 'FARS',
  اهواز: 'KHUZESTAN',
};

const BY_NAME = new Map<string, string>([
  ...IRAN_PROVINCES.map(
    (p) => [normalizeFa(p.name), p.code] as [string, string],
  ),
  ...Object.entries(ALIASES).map(
    ([k, v]) => [normalizeFa(k), v] as [string, string],
  ),
]);

export function getProvince(
  code: string | null | undefined,
): IranProvince | null {
  return code ? (BY_CODE.get(code) ?? null) : null;
}

export function isProvinceCode(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code);
}

/** کد استان یک آدرس: کد ذخیره‌شده، در غیر این صورت تطبیق نام آزاد (آدرس‌های قدیمی) */
export function resolveProvinceCode(address: {
  provinceCode?: string | null;
  province?: string | null;
}): string | null {
  if (isProvinceCode(address.provinceCode)) return address.provinceCode;
  const key = normalizeFa(address.province);
  return key ? (BY_NAME.get(key) ?? null) : null;
}
