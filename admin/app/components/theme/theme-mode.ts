// admin/app/components/theme/theme-mode.ts
//
// حالت نمایش پنل (روشن / تاریک / مطابق سیستم) — انتخاب هر کاربر در مرورگر خودش ذخیره می‌شود.
// اسکریپت THEME_INIT_SCRIPT پیش از نقاشی صفحه در <head> اجرا می‌شود تا صفحه‌ی روشن لحظه‌ای
// دیده نشود؛ صفحات چاپی (فاکتور، برچسب، اسناد نمایندگی) همیشه روشن‌اند.

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "arkan-admin-theme";
export const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];

const FORCE_LIGHT_SOURCE = "^/(invoices|agent-docs|labels)(/|$)";
const FORCE_LIGHT = new RegExp(FORCE_LIGHT_SOURCE);

export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})||"light";var f=new RegExp(${JSON.stringify(
  FORCE_LIGHT_SOURCE,
)}).test(location.pathname);var d=!f&&(m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches));if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

/** اعمال حالت روی <html> و هم‌رنگ کردن نوار مرورگر موبایل با منوی پنل */
export function applyThemeMode(mode: ThemeMode, pathname: string, animate = false) {
  const root = document.documentElement;
  const dark = !FORCE_LIGHT.test(pathname) && (mode === "dark" || (mode === "system" && systemPrefersDark()));
  if (root.classList.contains("dark") === dark) return;
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 250);
  }
  root.classList.toggle("dark", dark);
  const color = getComputedStyle(root).getPropertyValue("--color-sidebar").trim();
  if (color) {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }
}

// ── store کوچک برای هم‌گام بودن همه‌ی دکمه‌های تغییر حالت (منوی کناری، سربرگ موبایل، پروفایل) ──
const listeners = new Set<() => void>();
let current: ThemeMode | null = null;

export function subscribeThemeMode(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      current = readThemeMode();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function getThemeModeSnapshot(): ThemeMode {
  if (current === null) current = readThemeMode();
  return current;
}

export function setThemeMode(mode: ThemeMode) {
  current = mode;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // حالت خصوصی مرورگر — فقط برای همین نشست اعمال می‌شود
  }
  listeners.forEach((l) => l());
}
