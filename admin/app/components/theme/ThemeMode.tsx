"use client";
// admin/app/components/theme/ThemeMode.tsx — هم‌گام‌سازی حالت تاریک و دکمه‌ی تغییر حالت پنل
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_MODES,
  applyThemeMode,
  getThemeModeSnapshot,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode,
} from "./theme-mode";

export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeModeSnapshot, () => "light" as ThemeMode);
  return [mode, setThemeMode];
}

/** در layout ریشه: اعمال حالت پس از تغییر انتخاب، مسیر (صفحات چاپی روشن) یا تنظیم سیستم‌عامل */
export function ThemeSync() {
  const pathname = usePathname();
  const [mode] = useThemeMode();

  useEffect(() => {
    // مقدار واقعی از store خوانده می‌شود: در اولین اجرا (hydration) mode هنوز مقدار سرور («روشن»)
    // است و اعمال آن کلاس dark گذاشته‌شده توسط اسکریپت head را لحظه‌ای برمی‌داشت
    applyThemeMode(getThemeModeSnapshot(), pathname, true);
  }, [mode, pathname]);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("system", window.location.pathname, true);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return null;
}

const META: Record<ThemeMode, { label: string; Icon: typeof Sun }> = {
  light: { label: "روشن", Icon: Sun },
  dark: { label: "تاریک", Icon: Moon },
  system: { label: "مطابق سیستم", Icon: Monitor },
};

/** دکمه‌ی چرخشی روشن ← تاریک ← سیستم (برای سربرگ و منو) */
export function ThemeToggleButton({ className = "", iconClassName = "w-4 h-4" }: { className?: string; iconClassName?: string }) {
  const [mode, setMode] = useThemeMode();
  const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
  const { Icon, label } = META[mode];
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      className={className}
      aria-label={`حالت نمایش: ${label} — تغییر به ${META[next].label}`}
      title={`حالت نمایش: ${label}`}
    >
      <Icon className={iconClassName} />
    </button>
  );
}

/** انتخابگر سه‌حالته (منوی کناری) */
export function ThemeSegmented({ className = "" }: { className?: string }) {
  const [mode, setMode] = useThemeMode();
  return (
    <div className={`grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1 ${className}`} role="radiogroup" aria-label="حالت نمایش">
      {THEME_MODES.map((m) => {
        const { Icon, label } = META[m];
        const active = m === mode;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m)}
            className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10.5px] font-bold transition-colors ${
              active ? "bg-white/20 text-white!" : "text-white/60! hover:bg-white/10"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label === "مطابق سیستم" ? "سیستم" : label}
          </button>
        );
      })}
    </div>
  );
}
