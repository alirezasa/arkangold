"use client";
// admin/app/(dashboard)/livechat/settings/page.tsx — تنظیمات کامل چت آنلاین
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { CheckCircle2, Loader2, MessageCircle, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { PageHeader, Tabs } from "@/app/components/finance/ui";
import { cardStyle, fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle } from "@/app/components/agents/ui";

const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

/* eslint-disable @typescript-eslint/no-explicit-any -- فرم عمومی روی ساختار تنظیمات */
type Settings = Record<string, any>;

type TabKey = "widget" | "bot" | "hours" | "offline" | "routing" | "notify" | "privacy";

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
      <h2 className="text-[14px] font-black text-gray-900">{title}</h2>
      {desc && <p className="mt-0.5 text-[11.5px] leading-5 text-gray-400">{desc}</p>}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  textarea,
  hint,
  dir,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  hint?: string;
  dir?: "ltr" | "rtl";
  wide?: boolean;
}) {
  return (
    <label className={`block text-[12px] font-bold text-gray-600 ${wide ? "md:col-span-2" : ""}`}>
      {label}
      {textarea ? (
        <textarea rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} dir={dir} />
      ) : (
        <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={inputCls} dir={dir} />
      )}
      {hint && <span className="mt-1 block text-[10.5px] font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

function NumberField({ label, value, onChange, hint, min, max, step }: { label: string; value: number; onChange: (v: number) => void; hint?: string; min?: number; max?: number; step?: number }) {
  return (
    <label className="block text-[12px] font-bold text-gray-600">
      {label}
      <input type="number" dir="ltr" min={min} max={max} step={step} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} />
      {hint && <span className="mt-1 block text-[10.5px] font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 p-3">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${value ? "" : "bg-gray-300"}`}
        style={value ? { backgroundColor: "var(--color-emerald)" } : undefined}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${value ? "left-0.5" : "left-[18px]"}`} />
      </button>
      <span>
        <span className="block text-[12.5px] font-bold text-gray-700">{label}</span>
        {hint && <span className="mt-0.5 block text-[10.5px] leading-5 text-gray-400">{hint}</span>}
      </span>
    </label>
  );
}

function Select({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string }) {
  return (
    <label className="block text-[12px] font-bold text-gray-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-[10.5px] font-normal text-gray-400">{hint}</span>}
    </label>
  );
}

function ListField({ label, value, onChange, hint, dir }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string; dir?: "ltr" }) {
  return (
    <label className="block text-[12px] font-bold text-gray-600 md:col-span-2">
      {label}
      <textarea
        rows={3}
        dir={dir}
        value={(value ?? []).join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        className={inputCls}
      />
      <span className="mt-1 block text-[10.5px] font-normal text-gray-400">{hint ?? "هر مورد در یک خط"}</span>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-[12px] font-bold text-gray-600">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200" />
        <input dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls + " mt-0!"} />
      </span>
    </label>
  );
}

function Preview({ s }: { s: Settings }) {
  const w = s.widget;
  return (
    <div className="rounded-2xl p-4" style={cardStyle}>
      <p className="mb-3 text-[12px] font-black text-gray-600">پیش‌نمایش</p>
      <div className="overflow-hidden rounded-2xl bg-[#f6f5f1] shadow-lg ring-1 ring-black/5">
        <div className="flex items-center gap-2 px-3 py-3 text-white" style={{ backgroundColor: w.primaryColor }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: w.accentColor, color: w.primaryColor }}>
            <MessageCircle className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-[13px] font-black">{w.title}</span>
            <span className="block text-[10.5px] opacity-80">{w.subtitle}</span>
          </span>
        </div>
        <div className="space-y-2 p-3">
          {w.welcomeMessage && <p className="w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-[12px] shadow-sm">{w.welcomeMessage}</p>}
          {s.bot.enabled && (
            <div className="w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-[12px] shadow-sm">
              {s.bot.greeting}
              <div className="mt-2 space-y-1">
                {["گزینه‌ی نمونه", s.bot.operatorButtonLabel].map((l, i) => (
                  <div
                    key={l}
                    className="rounded-lg border px-2 py-1 text-[11px] font-bold"
                    style={i ? { backgroundColor: w.primaryColor, color: "#fff", borderColor: w.primaryColor } : { borderColor: `${w.primaryColor}33`, color: w.primaryColor }}
                  >
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mr-auto w-fit max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 text-[12px] text-white" style={{ backgroundColor: w.primaryColor }}>
            پیام بازدیدکننده
          </p>
        </div>
      </div>
      <div className={`mt-4 flex ${w.position === "right" ? "justify-start" : "justify-end"}`}>
        <span className="flex h-12 items-center gap-2 rounded-full px-3.5 text-white shadow-lg" style={{ backgroundColor: w.primaryColor }}>
          <MessageCircle className="h-5 w-5" />
          {w.showLauncherText && <span className="text-[12px] font-bold">{w.launcherText}</span>}
        </span>
      </div>
    </div>
  );
}

export default function LivechatSettingsPage() {
  const { data, mutate } = useSWR<Settings>("/api/admin/livechat/settings", fetcher, { revalidateOnFocus: false });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [tab, setTab] = useState<TabKey>("widget");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const s = draft ?? data;

  if (!s) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--color-gold-500)" }} />
      </div>
    );
  }

  /** به‌روزرسانی یک مسیر مثل "widget.title" */
  const set = (path: string, value: unknown) => {
    const next = structuredClone(s);
    const keys = path.split(".");
    let cur = next;
    for (const k of keys.slice(0, -1)) cur = cur[k];
    cur[keys[keys.length - 1]] = value;
    setDraft(next);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const clean = structuredClone(s);
      for (const p of [
        ["widget", "hiddenPaths"],
        ["smart", "handoffKeywords"],
        ["workingHours", "holidays"],
        ["notifications", "adminPhones"],
        ["privacy", "ipBlocklist"],
      ]) {
        clean[p[0]][p[1]] = (clean[p[0]][p[1]] as string[]).map((x) => x.trim()).filter(Boolean);
      }
      const res = await axios.put("/api/admin/livechat/settings", clean);
      await mutate(res.data, { revalidate: false });
      setDraft(null);
      setMessage({ ok: true, text: "تنظیمات ذخیره شد و روی ویجت اعمال می‌شود." });
    } catch (e) {
      setMessage({ ok: false, text: getErrorMessage(e, "ذخیره ناموفق بود") });
    } finally {
      setSaving(false);
    }
  };

  const w = s.widget;
  const tabs: { key: TabKey; label: string }[] = [
    { key: "widget", label: "ظاهر و ویجت" },
    { key: "bot", label: "ربات و حالت هوشمند" },
    { key: "hours", label: "ساعات کاری" },
    { key: "offline", label: "آفلاین و فرم‌ها" },
    { key: "routing", label: "صف و تخصیص" },
    { key: "notify", label: "امتیاز و پیامک" },
    { key: "privacy", label: "امنیت و حریم خصوصی" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={SlidersHorizontal}
        title="تنظیمات چت آنلاین"
        subtitle="همه‌ی بخش‌های ویجت چت اپ از اینجا تنظیم می‌شود: ظاهر، متن‌ها، ربات و منوی پاسخ‌های آماده، حالت هوشمند، ساعات کاری، رفتار آفلاین، صف و اطلاع‌رسانی."
        actions={
          <button type="button" onClick={save} disabled={saving || !draft} className={primaryBtn} style={primaryBtnStyle}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره تغییرات
          </button>
        }
      />
      {message && (
        <p className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.ok && <CheckCircle2 className="h-4 w-4" />} {message.text}
        </p>
      )}

      <Toggle
        label="چت آنلاین در اپ فعال است"
        value={s.enabled}
        onChange={(v) => set("enabled", v)}
        hint="با خاموش کردن، دکمه‌ی چت از همه‌ی صفحات اپ برداشته می‌شود (گفتگوهای قبلی در میز کار باقی می‌مانند)."
      />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {tab === "widget" && (
            <>
              <Card title="متن‌ها">
                <TextField label="عنوان پنجره" value={w.title} onChange={(v) => set("widget.title", v)} />
                <TextField label="زیرعنوان (کارشناس آنلاین)" value={w.subtitle} onChange={(v) => set("widget.subtitle", v)} />
                <TextField label="زیرعنوان (آفلاین)" value={w.offlineSubtitle} onChange={(v) => set("widget.offlineSubtitle", v)} />
                <TextField label="متن دکمه‌ی چت" value={w.launcherText} onChange={(v) => set("widget.launcherText", v)} />
                <TextField label="پیام خوشامد" value={w.welcomeMessage} onChange={(v) => set("widget.welcomeMessage", v)} textarea wide hint="پیش از منوی ربات به بازدیدکننده‌ی تازه نمایش داده می‌شود؛ خالی = بدون پیام خوشامد." />
                <TextField label="متن راهنمای کادر پیام" value={w.composerPlaceholder} onChange={(v) => set("widget.composerPlaceholder", v)} />
              </Card>
              <Card title="رنگ و جایگاه">
                <ColorField label="رنگ اصلی" value={w.primaryColor} onChange={(v) => set("widget.primaryColor", v)} />
                <ColorField label="رنگ دوم (تأکید)" value={w.accentColor} onChange={(v) => set("widget.accentColor", v)} />
                <Select
                  label="جایگاه دکمه"
                  value={w.position}
                  onChange={(v) => set("widget.position", v)}
                  options={[
                    { value: "left", label: "پایین سمت چپ" },
                    { value: "right", label: "پایین سمت راست" },
                  ]}
                />
                <NumberField label="فاصله از کناره (پیکسل)" value={w.offsetX} onChange={(v) => set("widget.offsetX", v)} min={0} max={200} />
                <NumberField label="فاصله از پایین (پیکسل)" value={w.offsetBottom} onChange={(v) => set("widget.offsetBottom", v)} min={0} max={300} hint="در داشبورد موبایل، به‌طور خودکار بالای منوی پایین قرار می‌گیرد." />
                <ListField label="صفحاتی که دکمه‌ی چت در آن‌ها نمایش داده نشود" value={w.hiddenPaths} onChange={(v) => set("widget.hiddenPaths", v)} dir="ltr" hint="پیشوند مسیر، هر کدام در یک خط (مثلاً /invoice)" />
              </Card>
              <Card title="امکانات ویجت">
                <Toggle label="نمایش متن کنار دکمه‌ی چت (دسکتاپ)" value={w.showLauncherText} onChange={(v) => set("widget.showLauncherText", v)} />
                <Toggle label="نمایش در موبایل" value={w.showOnMobile} onChange={(v) => set("widget.showOnMobile", v)} />
                <Toggle label="نمایش تصویر/نام کارشناس" value={w.showOperatorAvatar} onChange={(v) => set("widget.showOperatorAvatar", v)} />
                <Toggle label="صدای اعلان پیام جدید" value={w.soundEnabled} onChange={(v) => set("widget.soundEnabled", v)} />
                <Toggle label="ارسال فایل توسط بازدیدکننده" value={w.allowFileUpload} onChange={(v) => set("widget.allowFileUpload", v)} hint="تصویر و PDF تا ۵ مگابایت؛ فایل‌ها پویش و پاک‌سازی می‌شوند." />
                <Toggle label="امکان پایان گفتگو توسط بازدیدکننده" value={w.allowVisitorEndChat} onChange={(v) => set("widget.allowVisitorEndChat", v)} />
              </Card>
            </>
          )}

          {tab === "bot" && (
            <>
              <Card title="ربات منوی پاسخ‌های آماده" desc="گزینه‌های منو در بخش «منوی ربات و پاسخ‌های آماده» تعریف می‌شوند.">
                <Toggle label="ربات فعال است" value={s.bot.enabled} onChange={(v) => set("bot.enabled", v)} hint="خاموش: هر پیام بازدیدکننده مستقیم به صف کارشناسان می‌رود." />
                <TextField label="پرسش آغازین منو" value={s.bot.greeting} onChange={(v) => set("bot.greeting", v)} />
                <TextField label="عنوان دکمه‌ی منوی اصلی" value={s.bot.mainMenuLabel} onChange={(v) => set("bot.mainMenuLabel", v)} />
                <TextField label="عنوان دکمه‌ی بازگشت" value={s.bot.backLabel} onChange={(v) => set("bot.backLabel", v)} />
                <Toggle label="نمایش دکمه‌ی «گفتگو با کارشناس» زیر پاسخ‌ها" value={s.bot.showOperatorButton} onChange={(v) => set("bot.showOperatorButton", v)} />
                <TextField label="عنوان دکمه‌ی گفتگو با کارشناس" value={s.bot.operatorButtonLabel} onChange={(v) => set("bot.operatorButtonLabel", v)} />
                <Toggle label="نمایش دکمه‌ی منوی اصلی" value={s.bot.showMainMenuButton} onChange={(v) => set("bot.showMainMenuButton", v)} />
                <Select
                  label="وقتی بازدیدکننده به‌جای انتخاب گزینه پیام می‌نویسد"
                  value={s.bot.freeTextBehavior}
                  onChange={(v) => set("bot.freeTextBehavior", v)}
                  options={[
                    { value: "smart", label: "حالت هوشمند: جستجو در پایگاه دانش و منو" },
                    { value: "handoff", label: "اتصال مستقیم به کارشناس" },
                    { value: "menu", label: "نمایش دوباره‌ی منو" },
                  ]}
                />
                <TextField label="پاسخ وقتی ربات پرسش را نفهمید" value={s.bot.fallbackText} onChange={(v) => set("bot.fallbackText", v)} textarea wide />
                <TextField label="پیام هنگام اتصال به کارشناس" value={s.bot.handoffText} onChange={(v) => set("bot.handoffText", v)} textarea wide />
              </Card>
              <Card title="حالت هوشمند" desc="پاسخ خودکار به پرسش‌های آزاد از روی پایگاه دانش و منوی ربات — کاملاً روی سرور خود آرکان گلد و بدون ارسال گفتگوها به سرویس بیرونی. پرسش‌های بی‌پاسخ برای تکمیل پایگاه دانش ثبت می‌شوند.">
                <Toggle label="حالت هوشمند فعال است" value={s.smart.enabled} onChange={(v) => set("smart.enabled", v)} />
                <Toggle label="پاسخ خودکار هنگام انتظار در صف/آفلاین" value={s.smart.answerWhileWaiting} onChange={(v) => set("smart.answerWhileWaiting", v)} hint="اگر پاسخ مطمئنی در پایگاه دانش باشد، تا رسیدن کارشناس به بازدیدکننده نمایش داده می‌شود." />
                <NumberField label="حداقل اطمینان برای پاسخ مستقیم (۰ تا ۱)" value={s.smart.minConfidence} onChange={(v) => set("smart.minConfidence", v)} min={0.2} max={1} step={0.05} hint="بیشتر = پاسخ‌های کمتر ولی دقیق‌تر" />
                <NumberField label="حداقل اطمینان برای پیشنهاد" value={s.smart.suggestThreshold} onChange={(v) => set("smart.suggestThreshold", v)} min={0.1} max={1} step={0.05} />
                <NumberField label="بیشینه‌ی پیشنهادها" value={s.smart.maxSuggestions} onChange={(v) => set("smart.maxSuggestions", v)} min={0} max={6} />
                <TextField label="متن پیشنهادها" value={s.smart.suggestText} onChange={(v) => set("smart.suggestText", v)} />
                <Toggle label="پرسیدن «این پاسخ مفید بود؟»" value={s.smart.askHelpful} onChange={(v) => set("smart.askHelpful", v)} />
                <Toggle label="ثبت پرسش‌های بی‌پاسخ" value={s.smart.logUnanswered} onChange={(v) => set("smart.logUnanswered", v)} />
                <ListField label="عبارت‌هایی که یعنی «با کارشناس وصلم کن»" value={s.smart.handoffKeywords} onChange={(v) => set("smart.handoffKeywords", v)} />
              </Card>
            </>
          )}

          {tab === "hours" && (
            <Card title="ساعات پاسخ‌گویی کارشناسان" desc="به وقت تهران. خارج از این ساعات، چت در حالت آفلاین کار می‌کند (حتی اگر کارشناسی متصل باشد). متغیر {{working_hours}} در پاسخ‌ها همین برنامه را نشان می‌دهد.">
              <Toggle label="اعمال ساعات کاری" value={s.workingHours.enabled} onChange={(v) => set("workingHours.enabled", v)} hint="خاموش: هر زمان کارشناس آنلاین باشد، چت آنلاین است." />
              <Toggle label="تعطیلات تقویم سیستم هم لحاظ شود" value={s.workingHours.useSystemHolidays} onChange={(v) => set("workingHours.useSystemHolidays", v)} hint="calendar.holidays در تنظیمات سیستم" />
              <div className="space-y-2 md:col-span-2">
                {s.workingHours.days.map((d: { day: number; open: boolean; start: string; end: string }, i: number) => (
                  <div key={d.day} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 px-3 py-2">
                    <label className="flex w-28 items-center gap-2 text-[12.5px] font-bold text-gray-700">
                      <input type="checkbox" checked={d.open} onChange={(e) => set(`workingHours.days.${i}.open`, e.target.checked)} />
                      {WEEKDAYS[d.day]}
                    </label>
                    {d.open ? (
                      <span className="flex items-center gap-2 text-[12px] text-gray-500">
                        از
                        <input type="time" value={d.start} onChange={(e) => set(`workingHours.days.${i}.start`, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1" dir="ltr" />
                        تا
                        <input type="time" value={d.end} onChange={(e) => set(`workingHours.days.${i}.end`, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1" dir="ltr" />
                      </span>
                    ) : (
                      <span className="text-[12px] text-gray-400">تعطیل</span>
                    )}
                  </div>
                ))}
              </div>
              <ListField label="تعطیلات (تاریخ شمسی)" value={s.workingHours.holidays} onChange={(v) => set("workingHours.holidays", v)} dir="ltr" hint="هر تاریخ در یک خط، مثل 1405/01/01" />
            </Card>
          )}

          {tab === "offline" && (
            <>
              <Card title="وقتی کارشناسی در دسترس نیست">
                <Select
                  label="رفتار چت در حالت آفلاین"
                  value={s.offline.mode}
                  onChange={(v) => set("offline.mode", v)}
                  options={[
                    { value: "form", label: "دریافت پیام و شماره تماس (پیشنهادی)" },
                    { value: "message", label: "گفتگو آزاد؛ پیام در صف می‌ماند" },
                    { value: "hide", label: "پنهان کردن دکمه‌ی چت" },
                  ]}
                />
                <Toggle label="شماره موبایل در فرم آفلاین الزامی است" value={s.offline.requirePhone} onChange={(v) => set("offline.requirePhone", v)} />
                <TextField label="عنوان پیام آفلاین" value={s.offline.title} onChange={(v) => set("offline.title", v)} wide />
                <TextField label="متن پیام آفلاین" value={s.offline.text} onChange={(v) => set("offline.text", v)} textarea wide />
                <TextField label="پیام پس از ثبت اطلاعات تماس" value={s.offline.thanksText} onChange={(v) => set("offline.thanksText", v)} textarea wide />
              </Card>
              <Card title="فرم پیش از گفتگو با کارشناس" desc="پیش از اتصال به کارشناس، اطلاعات لازم از بازدیدکننده گرفته می‌شود (برای کاربران واردشده به‌طور خودکار از حساب پر می‌شود).">
                <Toggle label="فرم پیش از گفتگو فعال است" value={s.preChat.enabled} onChange={(v) => set("preChat.enabled", v)} />
                <Toggle label="فقط برای مهمان‌ها" value={s.preChat.onlyGuests} onChange={(v) => set("preChat.onlyGuests", v)} />
                <Toggle label="پرسیدن نام" value={s.preChat.askName} onChange={(v) => set("preChat.askName", v)} />
                <Toggle label="پرسیدن شماره موبایل" value={s.preChat.askPhone} onChange={(v) => set("preChat.askPhone", v)} />
                <Toggle label="شماره موبایل الزامی است" value={s.preChat.requirePhone} onChange={(v) => set("preChat.requirePhone", v)} />
                <Toggle label="انتخاب دپارتمان توسط بازدیدکننده" value={s.preChat.askDepartment} onChange={(v) => set("preChat.askDepartment", v)} />
                <TextField label="متن بالای فرم" value={s.preChat.intro} onChange={(v) => set("preChat.intro", v)} textarea wide />
              </Card>
            </>
          )}

          {tab === "routing" && (
            <Card title="صف انتظار و تخصیص گفتگو">
              <Select
                label="روش تخصیص"
                value={s.routing.mode}
                onChange={(v) => set("routing.mode", v)}
                options={[
                  { value: "auto", label: "خودکار: کم‌مشغله‌ترین کارشناس آنلاین دپارتمان" },
                  { value: "manual", label: "دستی: کارشناسان از صف می‌پذیرند" },
                ]}
              />
              <NumberField label="مهلت انتظار در صف (ثانیه)" value={s.routing.queueTimeoutSeconds} onChange={(v) => set("routing.queueTimeoutSeconds", v)} min={0} max={3600} hint="پس از این مدت بدون پذیرش، گفتگو به پیام آفلاین تبدیل و فرم تماس نمایش داده می‌شود (۰ = خاموش)." />
              <NumberField label="بستن خودکار گفتگوی بی‌فعالیت (دقیقه)" value={s.routing.autoCloseMinutes} onChange={(v) => set("routing.autoCloseMinutes", v)} min={0} max={1440} hint="گفتگوهای ربات و کارشناس؛ پیام‌های آفلاینِ منتظر پاسخ بسته نمی‌شوند (۰ = هرگز)." />
              <Toggle label="نمایش نوبت در صف به بازدیدکننده" value={s.routing.showQueuePosition} onChange={(v) => set("routing.showQueuePosition", v)} />
              <TextField label="متن نوبت صف" value={s.routing.queueText} onChange={(v) => set("routing.queueText", v)} hint="{{position}} = شماره‌ی نوبت" />
              <TextField label="متن پیوستن کارشناس" value={s.routing.assignedText} onChange={(v) => set("routing.assignedText", v)} hint="{{operator}} = نام کارشناس" />
              <TextField label="متن انتقال گفتگو" value={s.routing.transferText} onChange={(v) => set("routing.transferText", v)} hint="{{target}} = کارشناس/دپارتمان مقصد" />
              <TextField label="متن پایان گفتگو" value={s.routing.closedText} onChange={(v) => set("routing.closedText", v)} />
            </Card>
          )}

          {tab === "notify" && (
            <>
              <Card title="امتیازدهی پس از گفتگو">
                <Toggle label="درخواست امتیاز پس از بستن گفتگو" value={s.rating.enabled} onChange={(v) => set("rating.enabled", v)} />
                <Toggle label="امکان نوشتن نظر" value={s.rating.askComment} onChange={(v) => set("rating.askComment", v)} />
                <TextField label="متن درخواست امتیاز" value={s.rating.text} onChange={(v) => set("rating.text", v)} />
                <TextField label="متن تشکر" value={s.rating.thanksText} onChange={(v) => set("rating.thanksText", v)} />
              </Card>
              <Card title="اطلاع‌رسانی پیامکی">
                <Toggle label="پیامک به بازدیدکننده وقتی پاسخ کارشناس را آنلاین نمی‌بیند" value={s.notifications.smsVisitorOnReply} onChange={(v) => set("notifications.smsVisitorOnReply", v)} hint="فقط اگر شماره‌ی او معلوم باشد (کاربر عضو یا فرم تماس)." />
                <NumberField label="فاصله‌ی حداقل بین دو پیامک (دقیقه)" value={s.notifications.smsCooldownMinutes} onChange={(v) => set("notifications.smsCooldownMinutes", v)} min={0} max={1440} />
                <TextField label="متن پیامک بازدیدکننده" value={s.notifications.smsVisitorText} onChange={(v) => set("notifications.smsVisitorText", v)} textarea wide hint="{{link}} = نشانی باز کردن چت، {{name}} = نام" />
                <TextField label="نشانی باز کردن چت" value={s.notifications.chatLink} onChange={(v) => set("notifications.chatLink", v)} dir="ltr" wide />
                <Toggle label="پیامک به مدیران برای پیام‌های آفلاین" value={s.notifications.smsAdminsOnOffline} onChange={(v) => set("notifications.smsAdminsOnOffline", v)} />
                <TextField label="متن پیامک مدیران" value={s.notifications.smsAdminText} onChange={(v) => set("notifications.smsAdminText", v)} hint="{{visitor}}، {{preview}}، {{number}}" />
                <ListField label="شماره‌های مدیران" value={s.notifications.adminPhones} onChange={(v) => set("notifications.adminPhones", v)} dir="ltr" />
              </Card>
            </>
          )}

          {tab === "privacy" && (
            <Card title="امنیت و حریم خصوصی">
              <Toggle label="کارشناسان متن در حال تایپ بازدیدکننده را ببینند" value={s.privacy.typingPreview} onChange={(v) => set("privacy.typingPreview", v)} />
              <NumberField label="بیشینه‌ی طول پیام بازدیدکننده" value={s.privacy.maxMessageLength} onChange={(v) => set("privacy.maxMessageLength", v)} min={100} max={5000} />
              <ListField label="IPهای مسدود" value={s.privacy.ipBlocklist} onChange={(v) => set("privacy.ipBlocklist", v)} dir="ltr" />
            </Card>
          )}
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Preview s={s} />
          {draft && (
            <button type="button" onClick={() => setDraft(null)} className="mt-3 flex w-full items-center justify-center gap-1 text-[12px] font-bold text-gray-500">
              <Trash2 className="h-3.5 w-3.5" /> لغو تغییرات ذخیره‌نشده
            </button>
          )}
          <p className="mt-3 flex items-start gap-1 text-[11px] leading-5 text-gray-400">
            <Plus className="mt-0.5 h-3 w-3 shrink-0" />
            برای باز کردن چت از هر دکمه‌ای در اپ: رویداد arkan-livechat:open یا افزودن ?chat=open به نشانی صفحه.
          </p>
        </div>
      </div>
    </div>
  );
}
