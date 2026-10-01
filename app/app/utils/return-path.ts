// مسیر بازگشت پس از ورود/ثبت‌نام/احراز هویت — مثلاً وقتی کاربر از سایت
// arkan.gold روی «افزودن به سبد» یک شمش زده و به صفحه همان محصول در اپ آمده است.
// مسیر در sessionStorage نگه داشته می‌شود تا در رفت‌وبرگشت بین ورود، ثبت‌نام
// و احراز هویت از دست نرود.

export const RETURN_PATH_PARAM = "next";
const STORAGE_KEY = "arkan.returnPath";

/**
 * فقط مسیرهای داخلی داشبورد پذیرفته می‌شوند (جلوگیری از open redirect):
 * باید با /dashboard/ شروع شود و شامل // یا \ یا کاراکتر کنترلی نباشد.
 * خود /dashboard و صفحات احراز هویت مقصد بازگشت محسوب نمی‌شوند.
 */
export function sanitizeReturnPath(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/dashboard/")) return null;
  if (path.includes("//") || path.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.startsWith("/dashboard/identity")) return null;
  return path;
}

export function saveReturnPath(value: string | null | undefined) {
  const path = sanitizeReturnPath(value);
  if (!path) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // دسترسی به sessionStorage ممکن نیست
  }
}

export function peekReturnPath(): string | null {
  try {
    return sanitizeReturnPath(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function clearReturnPath() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // دسترسی به sessionStorage ممکن نیست
  }
}

/** مسیر بازگشت ذخیره‌شده را برمی‌گرداند و پاک می‌کند */
export function consumeReturnPath(): string | null {
  const path = peekReturnPath();
  clearReturnPath();
  return path;
}

/** مسیر بازگشت دریافتی در پارامتر ?next= صفحه فعلی را ذخیره می‌کند */
export function captureReturnPathFromUrl() {
  if (typeof window === "undefined") return;
  saveReturnPath(
    new URLSearchParams(window.location.search).get(RETURN_PATH_PARAM),
  );
}
