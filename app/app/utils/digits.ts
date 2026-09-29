// ابزارهای نرمال‌سازی ورودی‌های عددی
//
// کیبورد فارسی/عربی گوشی ارقام ۰-۹ / ٠-٩ و جداکننده اعشار «٫» تایپ می‌کند.
// الگوهای /\D/ و [^0-9] این ارقام را «غیرعددی» می‌دانند و حذف می‌کنند؛ یعنی با
// کیبورد فارسی چیزی در فیلد تایپ نمی‌شد. همه ورودی‌های عددی باید پیش از فیلتر،
// از این توابع عبور کنند.

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی/عربی را به انگلیسی تبدیل می‌کند (بقیه کاراکترها دست‌نخورده می‌مانند) */
export function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** فقط ارقام انگلیسی را نگه می‌دارد (برای موبایل، کد ملی، کد OTP، مبلغ و ...) */
export function digitsOnly(value: string): string {
  return toEnglishDigits(value).replace(/[^0-9]/g, "");
}

/**
 * برای مقادیر اعشاری (گرم، میلی‌گرم): جداکننده اعشار فارسی «٫» و «/» را به «.»
 * تبدیل می‌کند و فقط اولین نقطه را نگه می‌دارد.
 */
export function decimalOnly(value: string): string {
  const cleaned = toEnglishDigits(value)
    .replace(/[٫/]/g, ".")
    .replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "")
  );
}
