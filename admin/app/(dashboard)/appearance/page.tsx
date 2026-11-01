// admin/app/(dashboard)/appearance/page.tsx
//
// ظاهر، رنگ و فونت سیستم: رنگ‌های برند برای اپلیکیشن کاربران و پنل‌ها (حالت روشن)، رنگ‌های حالت
// تاریک پنل مدیریت/نمایندگان و فونت سفارشی. پیش‌فرض‌ها همان رنگ‌های فعلی برند هستند. تغییر رنگ‌ها
// پیش از ذخیره روی همین پنل پیش‌نمایش داده می‌شود و پس از ذخیره در کل سیستم اعمال می‌شود.
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Sun,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { adminApi } from "@/app/core/api";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { useThemeMode } from "@/app/components/theme/ThemeMode";

type Mode = "light" | "dark";
interface ColorDef {
  key: string;
  cssVar: string;
  label: string;
  hint: string;
  mode: Mode;
  default: string;
}
type Slot = "regular" | "bold";
interface AppearanceSettings {
  colors: Record<string, string>;
  defaults: Record<string, string>;
  definitions: ColorDef[];
  font: { regular: string | null; bold: string | null; version: string; name: string | null };
}

const HEX = /^#[0-9a-f]{6}$/i;
const PREVIEW_ID = "arkan-theme-preview";
const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);
const errorText = (e: unknown, fallback: string) => {
  if (!axios.isAxiosError(e)) return fallback;
  const m = (e.response?.data as { message?: string | string[] } | undefined)?.message;
  return Array.isArray(m) ? m.join("، ") : (m ?? fallback);
};

/** پیش‌نمایش زنده‌ی رنگ‌ها روی همین پنل (پس از style تم سرور تا روی آن غلبه کند) */
function applyPreview(defs: ColorDef[], colors: Record<string, string>) {
  const light = defs.filter((d) => d.mode === "light" && HEX.test(colors[d.key] ?? ""));
  const dark = defs.filter((d) => d.mode === "dark" && HEX.test(colors[d.key] ?? ""));
  const css =
    `:root{${light.map((d) => `${d.cssVar}:${colors[d.key]}`).join(";")}}` +
    `@media screen{:root.dark{${dark.map((d) => `${d.cssVar}:${colors[d.key]}`).join(";")}}}`;
  let el = document.getElementById(PREVIEW_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PREVIEW_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

const clearPreview = () => document.getElementById(PREVIEW_ID)?.remove();

/** دریافت CSS ذخیره‌شده و جایگزینی تم صفحه (بدون نیاز به بارگذاری مجدد) */
async function refreshLiveTheme() {
  try {
    const { data } = await axios.get<{ css: string }>("/brand/theme", { params: { t: Date.now() } });
    if (typeof data?.css !== "string") return;
    let el = document.getElementById("arkan-theme") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "arkan-theme";
      document.head.appendChild(el);
    }
    el.textContent = data.css.replace(/[<>]/g, "");
  } catch {
    // تم تا بارگذاری بعدی صفحه اعمال می‌شود
  }
}

export default function AppearancePage() {
  const { me } = useAdminMe();
  const canEdit = me?.permissions.includes("system_config.edit") ?? false;
  const { data, mutate, isLoading } = useSWR<AppearanceSettings>("/api/admin/branding/appearance", fetcher);
  const [colors, setColors] = useState<Record<string, string> | null>(null);
  const [fontName, setFontName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [mode, setMode] = useThemeMode();

  const draft = colors ?? data?.colors ?? null;
  const draftFontName = fontName ?? data?.font.name ?? "";
  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return (
      data.definitions.some((d) => (draft[d.key] ?? "").toLowerCase() !== (data.colors[d.key] ?? "").toLowerCase()) ||
      draftFontName.trim() !== (data.font.name ?? "")
    );
  }, [data, draft, draftFontName]);

  // پیش‌نمایش زنده تا وقتی تغییر ذخیره‌نشده هست؛ ترک صفحه پیش‌نمایش را برمی‌دارد
  useEffect(() => {
    if (!data || !colors) return;
    applyPreview(data.definitions, colors);
  }, [data, colors]);
  useEffect(() => clearPreview, []);

  const setColor = (key: string, value: string) => {
    if (!draft) return;
    setColors({ ...draft, [key]: value });
    setMsg(null);
  };

  const save = async () => {
    if (!draft || !data) return;
    const invalid = data.definitions.find((d) => !HEX.test(draft[d.key] ?? ""));
    if (invalid) {
      setMsg({ kind: "error", text: `رنگ «${invalid.label}» باید به شکل ‎#RRGGBB باشد` });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.put("/api/admin/branding/appearance", { colors: draft, fontName: draftFontName.trim() });
      await refreshLiveTheme();
      clearPreview();
      await mutate();
      setColors(null);
      setFontName(null);
      setMsg({ kind: "success", text: "تنظیمات ظاهر ذخیره شد و در اپلیکیشن و پنل‌ها اعمال می‌شود" });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e, "ذخیره‌ی تنظیمات ظاهر ناموفق بود") });
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    if (!confirm("همه‌ی رنگ‌ها به رنگ‌های پیش‌فرض برند برگردند؟")) return;
    setSaving(true);
    setMsg(null);
    try {
      await adminApi.delete("/api/admin/branding/appearance/colors");
      await refreshLiveTheme();
      clearPreview();
      await mutate();
      setColors(null);
      setMsg({ kind: "success", text: "رنگ‌ها به پیش‌فرض برگشت" });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e, "بازگشت به پیش‌فرض ناموفق بود") });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    clearPreview();
    setColors(null);
    setFontName(null);
    setMsg(null);
  };

  if (isLoading || !data || !draft) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-emerald)" }} />
      </div>
    );
  }

  const lightDefs = data.definitions.filter((d) => d.mode === "light");
  const darkDefs = data.definitions.filter((d) => d.mode === "dark");
  const customized = data.definitions.some((d) => data.colors[d.key] !== d.default);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Palette className="w-5 h-5" /> ظاهر، رنگ و فونت
          </h1>
          <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
            رنگ‌ها و فونت تعریف‌شده در این صفحه در اپلیکیشن کاربران، پنل مدیریت، پنل نمایندگان و اسناد چاپی اعمال می‌شوند.
            پیش‌فرض، رنگ‌های فعلی برند آرکان گلد است.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 text-[11.5px] font-bold self-start sm:self-auto">
          {(["light", "dark"] as const).map((m) => {
            const resolved =
              mode === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
            const active = resolved === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 ${active ? "text-white" : "text-gray-500 hover:bg-gray-50"}`}
                style={active ? { backgroundColor: "var(--color-emerald)" } : undefined}
              >
                {m === "light" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                پیش‌نمایش {m === "light" ? "روشن" : "تاریک"}
              </button>
            );
          })}
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-[12px] font-bold text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          دسترسی ویرایش تنظیمات را ندارید؛ تنظیمات فقط قابل مشاهده است.
        </div>
      )}

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-[12.5px] font-bold ${
            msg.kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {msg.kind === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-5 min-w-0">
          <ColorGroup
            title="رنگ‌های اصلی"
            subtitle="اپلیکیشن کاربران و حالت روشن پنل‌ها"
            icon={<Sun className="w-4 h-4" />}
            defs={lightDefs}
            colors={draft}
            canEdit={canEdit}
            onChange={setColor}
          />
          <ColorGroup
            title="رنگ‌های حالت تاریک"
            subtitle="پنل مدیریت و پنل نمایندگان در حالت تاریک؛ سایر رنگ‌ها به‌صورت خودکار هماهنگ می‌شوند"
            icon={<Moon className="w-4 h-4" />}
            defs={darkDefs}
            colors={draft}
            canEdit={canEdit}
            onChange={setColor}
          />
          <FontSettings
            font={data.font}
            name={draftFontName}
            onNameChange={(v) => {
              setFontName(v);
              setMsg(null);
            }}
            canEdit={canEdit}
            onChanged={async (text) => {
              await refreshLiveTheme();
              await mutate();
              setMsg({ kind: "success", text });
            }}
            onError={(text) => setMsg({ kind: "error", text })}
          />
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <ThemePreview />
          {canEdit && (
            <div className="rounded-2xl p-4 space-y-2" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void save()}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-black text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                ذخیره و اعمال در کل سیستم
              </button>
              {dirty && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={discard}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 text-[12px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  لغو تغییرات ذخیره‌نشده
                </button>
              )}
              <button
                type="button"
                disabled={saving || (!customized && !dirty)}
                onClick={() => void resetAll()}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" /> بازگشت همه‌ی رنگ‌ها به پیش‌فرض
              </button>
              <p className="text-[10.5px] text-gray-400 leading-relaxed">
                تغییرات پیش از ذخیره فقط روی همین صفحه پیش‌نمایش داده می‌شوند. پس از ذخیره، اپلیکیشن کاربران حداکثر ظرف یک دقیقه به‌روز می‌شود.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorGroup({
  title,
  subtitle,
  icon,
  defs,
  colors,
  canEdit,
  onChange,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  defs: ColorDef[];
  colors: Record<string, string>;
  canEdit: boolean;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <section className="rounded-2xl p-4 sm:p-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <h2 className="text-[14px] font-black text-gray-900 flex items-center gap-2">
        {icon} {title}
      </h2>
      <p className="text-[11.5px] text-gray-500 mt-0.5 mb-4">{subtitle}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {defs.map((d) => (
          <ColorField key={d.key} def={d} value={colors[d.key] ?? d.default} canEdit={canEdit} onChange={(v) => onChange(d.key, v)} />
        ))}
      </div>
    </section>
  );
}

function ColorField({ def, value, canEdit, onChange }: { def: ColorDef; value: string; canEdit: boolean; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  // هم‌گام با مقدار بیرونی (انتخاب از color picker، لغو تغییرات یا بازگشت به پیش‌فرض)
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const valid = HEX.test(text);
  const isDefault = value.toLowerCase() === def.default.toLowerCase();
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-start gap-3">
        <label
          className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-gray-200 shadow-sm ${canEdit ? "cursor-pointer" : ""}`}
          style={{ backgroundColor: HEX.test(value) ? value : def.default }}
          title={canEdit ? "انتخاب رنگ" : undefined}
        >
          {canEdit && (
            <input
              type="color"
              value={HEX.test(value) ? value : def.default}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label={`انتخاب ${def.label}`}
            />
          )}
        </label>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-black text-gray-800">{def.label}</p>
          <p className="text-[10.5px] text-gray-400 leading-relaxed">{def.hint}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          dir="ltr"
          value={text}
          disabled={!canEdit}
          maxLength={7}
          onChange={(e) => {
            let v = e.target.value.trim();
            if (v && !v.startsWith("#")) v = `#${v}`;
            setText(v);
            if (HEX.test(v)) onChange(v.toLowerCase());
          }}
          className={`w-full rounded-lg border bg-white px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-gold-500 disabled:opacity-60 ${
            valid ? "border-gray-200" : "border-red-300"
          }`}
          aria-label={`کد رنگ ${def.label}`}
        />
        {canEdit && !isDefault && (
          <button
            type="button"
            onClick={() => onChange(def.default)}
            className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] font-bold text-gray-500 hover:bg-gray-100"
            title={`پیش‌فرض: ${def.default}`}
          >
            <RotateCcw className="w-3 h-3" /> پیش‌فرض
          </button>
        )}
      </div>
    </div>
  );
}

/** نمونه‌ی اجزای رایج با متغیرهای زنده‌ی تم (روشن یا تاریک بسته به حالت فعلی پنل) */
function ThemePreview() {
  return (
    <section className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-page)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: "var(--color-sidebar)" }}>
        <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[12px] font-black" style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-sidebar)" }}>
          آ
        </div>
        <p className="text-[12px] font-black text-white!">پیش‌نمایش زنده</p>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-[13px] font-black text-gray-900">موجودی طلای شما</p>
          <p className="text-[11px] text-gray-500">۱۲٫۴۵۰ گرم — به‌روزرسانی لحظه‌ای</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="badge" style={{ backgroundColor: "var(--color-emerald-light)", color: "var(--color-emerald)" }}>
              برجسته
            </span>
            <span className="badge bg-green-50 text-green-700">تأیید شده</span>
            <span className="badge bg-amber-50 text-amber-700">در انتظار</span>
            <span className="badge bg-red-50 text-red-700">رد شده</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-xl py-2 text-[12px] font-black text-white" style={{ backgroundColor: "var(--color-green)" }}>
            خرید
          </button>
          <button type="button" className="rounded-xl py-2 text-[12px] font-black text-white" style={{ backgroundColor: "var(--color-red)" }}>
            فروش
          </button>
        </div>
        <button type="button" className="w-full rounded-xl py-2.5 text-[12.5px] font-black text-white" style={{ backgroundColor: "var(--color-emerald)" }}>
          دکمه‌ی اصلی
        </button>
        <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: "var(--color-gold-50, #fbf8eb)" }}>
          <span className="text-[11.5px] font-bold" style={{ color: "var(--color-gold-600)" }}>
            جزئیات طلایی
          </span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--color-yellow)" }} />
        </div>
      </div>
    </section>
  );
}

function FontSettings({
  font,
  name,
  onNameChange,
  canEdit,
  onChanged,
  onError,
}: {
  font: AppearanceSettings["font"];
  name: string;
  onNameChange: (v: string) => void;
  canEdit: boolean;
  onChanged: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<Slot | null>(null);
  const inputs = useRef<Record<Slot, HTMLInputElement | null>>({ regular: null, bold: null });
  const hasCustom = !!(font.regular || font.bold);

  const upload = async (slot: Slot, file: File) => {
    setBusy(slot);
    try {
      const form = new FormData();
      form.append("file", file);
      await axios.post(`/api/admin/branding/appearance/font/${slot}`, form);
      await onChanged("فونت ذخیره شد و در کل سیستم اعمال می‌شود");
    } catch (e) {
      onError(errorText(e, "بارگذاری فونت ناموفق بود"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (slot: Slot) => {
    if (!confirm("فونت حذف شود؟")) return;
    setBusy(slot);
    try {
      await adminApi.delete(`/api/admin/branding/appearance/font/${slot}`);
      await onChanged("فونت حذف شد");
    } catch (e) {
      onError(errorText(e, "حذف فونت ناموفق بود"));
    } finally {
      setBusy(null);
    }
  };

  const SLOTS: { slot: Slot; title: string; hint: string }[] = [
    { slot: "regular", title: "وزن معمولی", hint: "متن‌های عادی (Regular / 400)" },
    { slot: "bold", title: "وزن ضخیم", hint: "عنوان‌ها و دکمه‌ها (Bold / 700) — اختیاری" },
  ];

  return (
    <section className="rounded-2xl p-4 sm:p-5" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <h2 className="text-[14px] font-black text-gray-900 flex items-center gap-2">
        <Type className="w-4 h-4" /> فونت سیستم
      </h2>
      <p className="text-[11.5px] text-gray-500 mt-0.5 mb-4 leading-relaxed">
        {hasCustom
          ? "فونت سفارشی فعال است و در اپلیکیشن و پنل‌ها استفاده می‌شود."
          : "فونت پیش‌فرض (دانا) فعال است. با بارگذاری فونت، کل سیستم از فونت جدید استفاده می‌کند."}{" "}
        فرمت‌های مجاز: WOFF2 (توصیه‌شده)، WOFF، TTF و OTF تا ۳ مگابایت. اگر فقط وزن معمولی بارگذاری شود، برای متن‌های ضخیم هم استفاده می‌شود.
      </p>

      <label className="block mb-3">
        <span className="text-[12px] font-bold text-gray-600">نام فونت (برای نمایش)</span>
        <input
          value={name}
          disabled={!canEdit}
          maxLength={60}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="مثلاً ایران‌سنس"
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gold-500 disabled:opacity-60 sm:max-w-xs"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map(({ slot, title, hint }) => {
          const ext = font[slot];
          return (
            <div key={slot} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12.5px] font-black text-gray-800">{title}</p>
                  <p className="text-[10.5px] text-gray-400">{hint}</p>
                </div>
                <span className={`badge ${ext ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {ext ? ext.toUpperCase() : "پیش‌فرض"}
                </span>
              </div>
              <p className="my-3 text-[15px] text-gray-800" style={{ fontWeight: slot === "bold" ? 700 : 400 }}>
                طلای آب‌شده آرکان — ۱۲۳۴۵۶۷۸۹۰
              </p>
              {canEdit && (
                <div className="mt-auto flex gap-2">
                  <input
                    ref={(el) => {
                      inputs.current[slot] = el;
                    }}
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload(slot, f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => inputs.current[slot]?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-black text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-emerald)" }}
                  >
                    {busy === slot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {ext ? "تغییر فونت" : "بارگذاری فونت"}
                  </button>
                  {ext && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void remove(slot)}
                      aria-label={`حذف فونت ${title}`}
                      className="flex items-center justify-center rounded-lg border border-red-200 px-2.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
