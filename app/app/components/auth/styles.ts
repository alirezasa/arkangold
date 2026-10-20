// کلاس‌های مشترک صفحات ورود/ثبت‌نام/فراموشی رمز. ارتفاع فیلدها و فاصله‌ها با کلاس‌های
// auth-* در globals.css بر اساس ارتفاع صفحه‌ی گوشی (dvh) تنظیم می‌شود تا صفحه اسکرول نخورد.

export const authLabel = "mb-1.5 block text-xs font-black text-gray-500 mr-1";

export const authInput =
  "auth-field w-full rounded-2xl border border-gray-300 bg-white text-base sm:text-lg font-medium outline-none transition-all focus:border-gold-500 focus:ring-4 focus:ring-gold-500/10";

export const authPrimaryButton =
  "auth-field flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald text-base sm:text-lg font-black text-white shadow-lg shadow-emerald/20 transition-all hover:bg-[#085f48] disabled:cursor-not-allowed disabled:opacity-70";

export const authSecondaryButton =
  "auth-field-sm flex w-full items-center justify-center gap-2 rounded-2xl border-2 text-sm sm:text-base font-black transition-all";

export const authError =
  "flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs sm:text-sm font-bold text-red-600 animate-in fade-in";
