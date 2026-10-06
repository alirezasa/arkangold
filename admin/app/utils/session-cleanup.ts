// FDP_RIP_EXT.1.1 — پاک‌سازی سمت کلاینت پس از پایان نشست (خروج صریح یا انقضا).
// سرور با سرآیند Clear-Site-Data کوکی، حافظه‌ی نهان و فضای ذخیره‌سازی را پاک می‌کند؛ این تابع
// همان کار را مستقل از سرور هم انجام می‌دهد (مثلاً وقتی شبکه قطع است یا مرورگر Clear-Site-Data
// را پشتیبانی نمی‌کند): localStorage/sessionStorage، Cache Storage و — با بارگذاری کامل صفحه —
// هر داده‌ی حساسی که در DOM و حافظه‌ی برنامه (state/کش درخواست‌ها) مانده است.
// این فایل در app و admin یکسان است؛ تغییرات را در هر دو اعمال کنید.

export async function clearClientSessionData() {
  try {
    window.sessionStorage.clear();
  } catch {
    // دسترسی به sessionStorage ممکن نیست
  }
  try {
    window.localStorage.clear();
  } catch {
    // دسترسی به localStorage ممکن نیست
  }
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    }
  } catch {
    // Cache Storage در دسترس نیست
  }
}

/**
 * خروج کامل: درخواست باطل‌کردن نشست به سرور، پاک‌سازی داده‌های مرورگر و بارگذاری کامل
 * صفحه‌ی ورود (به‌جای جابه‌جایی درون‌برنامه‌ای) تا هیچ داده‌ای در DOM و حافظه باقی نماند.
 */
export async function logoutAndWipe(endpoint: string, redirectTo = "/login") {
  try {
    await fetch(endpoint, { method: "POST", credentials: "same-origin" });
  } catch {
    // حتی بدون دسترسی به سرور، داده‌های سمت کاربر پاک می‌شوند
  }
  await clearClientSessionData();
  window.location.replace(redirectTo);
}
