"use client";
// تنظیمات سیستم — دسته‌بندی‌شده:
// - تنظیمات (بر اساس پیشوند کلید) در چند بخش اصلی دسته‌بندی شده‌اند؛ در دسکتاپ فهرست بخش‌ها در
//   ستون کناری ثابت و در موبایل به‌صورت نوار افقی نمایش داده می‌شود.
// - گروه‌های پرتعداد (مثل واریز) بر اساس بخش دوم کلید به زیرگروه تقسیم می‌شوند.
// - جستجو در عنوان و کلید همه‌ی تنظیمات.
// - هر فیلد پس از تغییر دکمه‌ی «ذخیره» می‌گیرد (Enter ذخیره، Esc بازگردانی)؛ کلیدهای روشن/خاموش
//   و انتخاب‌ها بلافاصله ذخیره می‌شوند.
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  FileText,
  Gem,
  Handshake,
  Layers,
  Loader2,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import PaymentGatewaySettings from "@/app/components/PaymentGatewaySettings";
import BrandingSettings from "@/app/components/BrandingSettings";
import { useAdminMe } from "@/app/hooks/useAdminMe";

interface ConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

// ── بخش‌های اصلی و گروه‌های (پیشوند کلید) هر بخش ──
const SECTIONS: {
  key: string;
  title: string;
  hint: string;
  icon: typeof Settings2;
  groups: string[];
}[] = [
  {
    key: "general",
    title: "عمومی و برند",
    hint: "اطلاعات شرکت، لوگو و مهر، خدمات صفحه‌ی اصلی و تقویم",
    icon: Building2,
    groups: ["company", "service", "calendar"],
  },
  {
    key: "security",
    title: "امنیت و نشست",
    hint: "زمان نشست، رمز عبور، ورود، احراز هویت و بارگذاری فایل",
    icon: ShieldCheck,
    groups: ["session", "security", "identity", "upload"],
  },
  {
    key: "payments",
    title: "واریز، برداشت و درگاه",
    hint: "روش‌های واریز، سقف‌ها و کارمزد برداشت، درگاه پرداخت و انتقال",
    icon: Wallet,
    groups: ["deposit", "withdrawal", "payment", "transfer"],
  },
  {
    key: "trade",
    title: "معاملات، کارمزد و مالیات",
    hint: "خرید و فروش طلای آب‌شده، کارمزد، مالیات و تحویل فیزیکی",
    icon: TrendingUp,
    groups: ["trade", "fee", "tax", "physical_delivery"],
  },
  {
    key: "bullion",
    title: "شمش، فروشگاه و خزانه",
    hint: "اصالت‌سنجی هولوگرام، بازخرید شمش، فروشگاه و پوشش خزانه",
    icon: Gem,
    groups: ["hologram", "buyback", "shop", "treasury"],
  },
  {
    key: "documents",
    title: "اسناد و پیش‌فاکتور",
    hint: "استعلام QR، جهت چاپ و متن پیش‌فاکتور واریز",
    icon: FileText,
    groups: ["document", "proforma"],
  },
  {
    key: "partners",
    title: "نمایندگان، شرکا و دعوت",
    hint: "فروش نمایندگان، شرکای فروش اقساطی و پاداش دعوت",
    icon: Handshake,
    groups: ["agent", "partner", "referral"],
  },
  {
    key: "accounting",
    title: "حسابداری",
    hint: "تأیید اسناد و قفل دوره",
    icon: BookOpen,
    groups: ["accounting"],
  },
];

const OTHER_SECTION = { key: "other", title: "سایر", hint: "تنظیمات دسته‌بندی‌نشده", icon: Layers };

const GROUP_TITLES: Record<string, string> = {
  session: "زمان نشست‌ها (کاربران و ادمین‌ها)",
  security: "امنیت ورود، رمز عبور و یادآوری انقضا",
  identity: "احراز هویت (KYC)",
  upload: "بارگذاری فایل",
  service: "خدمات صفحه اصلی اپلیکیشن (بنرها)",
  transfer: "انتقال طلا بین کاربران",
  withdrawal: "برداشت وجه",
  deposit: "واریز وجه",
  physical_delivery: "تحویل فیزیکی (خرید شمش با طلای آب‌شده)",
  trade: "معاملات طلا",
  fee: "کارمزد معاملات",
  tax: "مالیات",
  referral: "پاداش دعوت از دوستان",
  payment: "درگاه‌های پرداخت",
  company: "اطلاعات شرکت",
  document: "اسناد و استعلام QR",
  proforma: "پیش‌فاکتور واریز",
  calendar: "تقویم و تعطیلات",
  hologram: "اصالت‌سنجی هولوگرام و انتقال مالکیت",
  buyback: "بازخرید شمش (فروش شمش کاربران به آرکان گلد)",
  shop: "فروشگاه، بسته‌بندی و برچسب ارسال",
  treasury: "خزانه و پوشش طلای آب‌شده",
  agent: "نمایندگان فروش",
  partner: "شرکای فروش (اقساطی / اپ همکار)",
  accounting: "حسابداری",
};

// زیرگروه‌ها بر اساس بخش دوم کلید (فقط وقتی دست‌کم دو تنظیم هم‌خانواده وجود دارد)
const SUB_TITLES: Record<string, string> = {
  "deposit.online": "واریز آنلاین (درگاه)",
  "deposit.card_to_card": "کارت به کارت",
  "deposit.bank_transfer": "حساب به حساب",
  "deposit.tracking_id": "واریز شناسه‌دار",
  "deposit.large_transfer": "مبالغ بالا",
  "deposit.direct": "واریز مستقیم",
  "security.password": "رمز عبور",
  "security.admin": "حساب‌های ادمین",
  "security.session": "نشست",
  "session.user": "کاربران",
  "session.admin": "ادمین‌ها",
  "trade.gold": "طلای آب‌شده",
  "hologram.inquiry": "امنیت استعلام عمومی",
  "shop.label": "برچسب ارسال سفارش",
  "agent.sale": "فروش نماینده",
};

// لوگو/مهر/امضا با بارگذاری تصویر (BrandingSettings) مدیریت می‌شوند، نه ویرایش متنی مسیر
const BRANDING_KEYS = new Set([
  "company.logo_path",
  "company.seal_image_path",
  "company.signature_image_path",
]);

// کلیدهایی که کامپوننت PaymentGatewaySettings خودش مدیریت می‌کند
const PAYMENT_KEYS_HANDLED_BY_WIDGET = new Set([
  "payment.zarinpal.enabled",
  "payment.zarinpal.merchant_id",
  "payment.zarinpal.sandbox",
  "payment.behpardakht.enabled",
  "payment.behpardakht.terminal_id",
  "payment.behpardakht.username",
  "payment.behpardakht.password",
]);

// تنظیمات متنی چندخطی (حتی وقتی مقدار فعلی کوتاه یا خالی است)
const MULTILINE_KEYS = /(address|instructions|clauses|subject_text|holidays|description)$/;

const isNumeric = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());
const isBoolean = (v: string) => v === "true" || v === "false";

/** گزینه‌های مجاز از متن توضیح، مثل «جهت چاپ فاکتور: landscape | portrait» */
function enumOptions(description: string | null): string[] | null {
  const m = description?.match(/([a-z_]+(?:\s*\|\s*[a-z_]+)+)\s*$/i);
  return m ? m[1].split("|").map((s) => s.trim()) : null;
}

const ENUM_FA: Record<string, string> = {
  landscape: "افقی (landscape)",
  portrait: "عمودی (portrait)",
};

/** یکسان‌سازی ی/ک عربی و فارسی برای جستجو */
const norm = (s: string) => s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").toLowerCase();

function unitHint(item: ConfigItem): string | null {
  const v = item.value.trim();
  if (!isNumeric(v)) return null;
  const n = Number(v);
  if (/rial/.test(item.key) || /ریال/.test(item.description ?? "")) {
    return `≈ ${(n / 10).toLocaleString("fa-IR")} تومان`;
  }
  if (/percent/.test(item.key)) return `${n.toLocaleString("fa-IR")}٪`;
  if (/_minutes$/.test(item.key)) return `${n.toLocaleString("fa-IR")} دقیقه`;
  if (/_hours$/.test(item.key)) return `${n.toLocaleString("fa-IR")} ساعت`;
  if (/_days$/.test(item.key)) return `${n.toLocaleString("fa-IR")} روز`;
  if (/_seconds$/.test(item.key)) return `${n.toLocaleString("fa-IR")} ثانیه`;
  if (/_grams$/.test(item.key)) return `${n.toLocaleString("fa-IR")} گرم`;
  return null;
}

// ═══════════════════════════ یک تنظیم ═══════════════════════════

function ConfigField({
  item,
  onSave,
  saving,
  saved,
  readOnly,
}: {
  item: ConfigItem;
  onSave: (key: string, value: string) => Promise<boolean>;
  saving: boolean;
  saved: boolean;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState(item.value);
  const [base, setBase] = useState(item.value);
  // مقدار ذخیره‌شده‌ی جدید از سرور (مثلاً پس از ذخیره) پیش‌نویس را به‌روز می‌کند
  if (item.value !== base) {
    setBase(item.value);
    setDraft(item.value);
  }
  const dirty = draft !== item.value;
  const label = item.description || item.key;
  const options = enumOptions(item.description);
  const numeric = isNumeric(item.value);
  const multiline = MULTILINE_KEYS.test(item.key) || item.value.length > 60 || item.value.includes("\n");
  const hint = unitHint({ ...item, value: draft });

  const commit = async () => {
    if (!dirty || saving) return;
    await onSave(item.key, draft.trim() === draft ? draft : draft.trim());
  };

  let control: React.ReactNode;
  if (isBoolean(item.value)) {
    const on = item.value === "true";
    control = (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={saving || readOnly}
        onClick={() => void onSave(item.key, on ? "false" : "true")}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-emerald-600" : "bg-gray-300"}`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "right-1" : "right-6"}`}
        />
        {saving && <Loader2 className="absolute -left-6 h-4 w-4 animate-spin text-gray-400" />}
      </button>
    );
  } else if (options && options.includes(item.value)) {
    control = (
      <select
        value={item.value}
        disabled={saving || readOnly}
        onChange={(e) => void onSave(item.key, e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {ENUM_FA[o] ?? o}
          </option>
        ))}
      </select>
    );
  } else {
    const common = {
      value: draft,
      disabled: readOnly,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") setDraft(item.value);
        if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void commit();
        }
      },
      className: `w-full rounded-xl border px-3 py-2.5 text-[13px] text-gray-800 outline-none transition-colors focus:border-gold-500 disabled:bg-gray-50 ${dirty ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white"}`,
    };
    control = multiline ? (
      <textarea {...common} rows={3} />
    ) : (
      <input
        {...common}
        dir={numeric ? "ltr" : "rtl"}
        inputMode={numeric ? "decimal" : undefined}
        style={numeric ? { textAlign: "left" } : undefined}
      />
    );
  }

  const inline = isBoolean(item.value);

  return (
    <div
      className={`grid gap-2 py-3.5 ${inline ? "grid-cols-[minmax(0,1fr)_auto] items-center" : "md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start md:gap-6"}`}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-bold leading-6 text-gray-700">{label}</p>
        <p dir="ltr" className="mt-0.5 text-right font-mono text-[10px] text-gray-300" title="کلید تنظیم">
          {item.key}
        </p>
      </div>
      <div className="min-w-0">
        {control}
        {!inline && (
          <div className="mt-1.5 flex min-h-5 flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">{hint}</span>
            {dirty ? (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraft(item.value)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-gray-500 hover:bg-gray-100"
                >
                  <RotateCcw className="h-3 w-3" /> بازگردانی
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void commit()}
                  className="flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-bold text-white disabled:opacity-60"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  ذخیره
                </button>
              </span>
            ) : saved ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> ذخیره شد
              </span>
            ) : null}
          </div>
        )}
        {inline && saved && (
          <p className="mt-1 text-left text-[10px] font-bold text-emerald-600">ذخیره شد</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════ گروه ═══════════════════════════

function splitSubgroups(prefix: string, items: ConfigItem[]) {
  const bySub = new Map<string, ConfigItem[]>();
  for (const it of items) {
    const parts = it.key.split(".");
    const sub = parts.length > 2 ? `${parts[0]}.${parts[1]}` : "";
    if (!bySub.has(sub)) bySub.set(sub, []);
    bySub.get(sub)!.push(it);
  }
  // زیرگروه تک‌عضوی جدا نمایش داده نمی‌شود
  const general: ConfigItem[] = [...(bySub.get("") ?? [])];
  const subs: { key: string; title: string; items: ConfigItem[] }[] = [];
  for (const [sub, list] of bySub) {
    if (!sub) continue;
    if (list.length < 2) general.push(...list);
    else subs.push({ key: sub, title: SUB_TITLES[sub] ?? sub.split(".")[1], items: list });
  }
  general.sort((a, b) => a.key.localeCompare(b.key));
  if (!subs.length) return [{ key: `${prefix}:all`, title: "", items: general }];
  return [
    ...(general.length ? [{ key: `${prefix}:general`, title: "عمومی", items: general }] : []),
    ...subs,
  ];
}

function GroupCard({
  prefix,
  items,
  searching,
  canEdit,
  savingKey,
  savedKey,
  onSave,
}: {
  prefix: string;
  items: ConfigItem[];
  searching: boolean;
  canEdit: boolean;
  savingKey: string | null;
  savedKey: string | null;
  onSave: (key: string, value: string) => Promise<boolean>;
}) {
  const visible = items.filter((item) =>
    prefix === "payment"
      ? !PAYMENT_KEYS_HANDLED_BY_WIDGET.has(item.key)
      : prefix === "company"
        ? !BRANDING_KEYS.has(item.key)
        : true,
  );
  const parts = splitSubgroups(prefix, visible);

  return (
    <section
      id={`group-${prefix}`}
      className="scroll-mt-4 rounded-2xl border bg-white p-4 sm:p-5"
      style={{ borderColor: "var(--color-border, #e5e7eb)" }}
    >
      <h3 className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3 text-[14px] font-black text-gray-800">
        {GROUP_TITLES[prefix] ?? prefix}
        <span className="rounded-lg bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-400">
          {visible.length.toLocaleString("fa-IR")} تنظیم
        </span>
      </h3>

      {!searching && prefix === "payment" && (
        <div className="mt-3">
          <PaymentGatewaySettings />
        </div>
      )}
      {!searching && prefix === "company" && <BrandingSettings canEdit={canEdit} />}

      {parts.map((part) => (
        <div key={part.key} className={part.title ? "mt-3" : ""}>
          {part.title && (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-1.5 text-[11px] font-black text-gray-500">{part.title}</p>
          )}
          <div className="divide-y divide-gray-100">
            {part.items.map((item) => (
              <ConfigField
                key={item.key}
                item={item}
                onSave={onSave}
                saving={savingKey === item.key}
                saved={savedKey === item.key}
                readOnly={!canEdit}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// ═══════════════════════════ صفحه ═══════════════════════════

export default function SystemConfigPage() {
  const { data, mutate, isLoading, error } = useSWR<ConfigItem[]>("/api/admin/system-config", fetcher);
  const { me } = useAdminMe();
  const canEditConfig = me?.permissions.includes("system_config.edit") ?? false;
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>("general");

  // بخش انتخاب‌شده در آدرس (#section) نگه داشته می‌شود تا با بارگذاری مجدد حفظ شود
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (h) setActive(h);
  }, []);
  const choose = (key: string) => {
    setActive(key);
    setQuery("");
    window.history.replaceState(null, "", `#${key}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (key: string, value: string) => {
    setSavingKey(key);
    setSaveError(null);
    try {
      await adminApi.put(`/api/admin/system-config/${key}`, { value });
      await mutate();
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1800);
      return true;
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      setSaveError(msg ? `ذخیره‌ی «${key}» ناموفق بود: ${msg}` : `خطا در ذخیره‌ی «${key}»`);
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  // گروه‌بندی تنظیمات بر اساس پیشوند و نسبت دادن هر گروه به یک بخش
  const { sections, groups } = useMemo(() => {
    const map = new Map<string, ConfigItem[]>();
    for (const item of data ?? []) {
      const prefix = item.key.split(".")[0];
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(item);
    }
    const assigned = new Set(SECTIONS.flatMap((s) => s.groups));
    const otherGroups = [...map.keys()].filter((g) => !assigned.has(g)).sort();
    const all = [...SECTIONS, ...(otherGroups.length ? [{ ...OTHER_SECTION, groups: otherGroups }] : [])]
      .map((s) => ({
        ...s,
        groups: s.groups.filter((g) => map.has(g)),
        count: s.groups.reduce((t, g) => t + (map.get(g)?.length ?? 0), 0),
      }))
      .filter((s) => s.groups.length > 0);
    return { sections: all, groups: map };
  }, [data]);

  const q = norm(query.trim());
  const searchResults = useMemo(() => {
    if (!q) return null;
    const out: { prefix: string; items: ConfigItem[] }[] = [];
    for (const [prefix, items] of groups) {
      const matched = items.filter((i) =>
        norm(`${i.description ?? ""} ${i.key} ${GROUP_TITLES[prefix] ?? ""}`).includes(q),
      );
      if (matched.length) out.push({ prefix, items: matched });
    }
    return out;
  }, [q, groups]);

  const current = sections.find((s) => s.key === active) ?? sections[0];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-[13px] font-bold text-red-600">
        <AlertCircle className="h-4 w-4" />
        خطا در دریافت تنظیمات سیستم
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-black text-gray-900">
            <Settings2 className="h-5 w-5 text-gray-400" />
            تنظیمات سیستم
          </h1>
          <p className="mt-1 text-[12px] text-gray-400">
            پارامترهای عملیاتی پلتفرم، دسته‌بندی‌شده بر اساس بخش. پس از تغییر هر مقدار روی «ذخیره» بزنید (یا Enter).
          </p>
        </div>
        <label className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو در همه‌ی تنظیمات…"
            aria-label="جستجو در تنظیمات"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-gold-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="پاک کردن جستجو"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>

      {!canEditConfig && me && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-[12px] font-bold text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          دسترسی ویرایش تنظیمات را ندارید؛ تنظیمات فقط قابل مشاهده است.
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-[13px] font-bold text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        {/* فهرست بخش‌ها: ستون ثابت در دسکتاپ، نوار افقی در موبایل */}
        <nav aria-label="بخش‌های تنظیمات" className="-mx-1 mb-4 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:p-0">
          <ul className="flex gap-2 lg:flex-col lg:gap-1 lg:rounded-2xl lg:border lg:bg-white lg:p-2" style={{ borderColor: "var(--color-border, #e5e7eb)" }}>
            {sections.map((s) => {
              const Icon = s.icon;
              const on = !searchResults && current?.key === s.key;
              return (
                <li key={s.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => choose(s.key)}
                    aria-current={on ? "page" : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-[12px] font-bold transition-colors ${
                      on ? "text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 lg:border-0"
                    }`}
                    style={on ? { backgroundColor: "var(--color-emerald)" } : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap lg:flex-1 lg:whitespace-normal">{s.title}</span>
                    <span className={`rounded-md px-1.5 text-[10px] ${on ? "bg-white/20" : "bg-gray-100 text-gray-400"}`}>
                      {s.count.toLocaleString("fa-IR")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {searchResults ? (
            searchResults.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center text-[13px] text-gray-400">
                تنظیمی با «{query}» یافت نشد
              </div>
            ) : (
              <>
                <p className="text-[12px] text-gray-500">
                  {searchResults.reduce((t, r) => t + r.items.length, 0).toLocaleString("fa-IR")} نتیجه برای «{query}»
                </p>
                {searchResults.map((r) => (
                  <GroupCard
                    key={r.prefix}
                    prefix={r.prefix}
                    items={r.items}
                    searching
                    canEdit={canEditConfig}
                    savingKey={savingKey}
                    savedKey={savedKey}
                    onSave={save}
                  />
                ))}
              </>
            )
          ) : current ? (
            <>
              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-[14px] font-black text-gray-800">{current.title}</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{current.hint}</p>
                {current.groups.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {current.groups.map((g) => (
                      <a
                        key={g}
                        href={`#group-${g}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(`group-${g}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:border-gold-500"
                      >
                        {GROUP_TITLES[g] ?? g}
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {current.groups.map((g) => (
                <GroupCard
                  key={g}
                  prefix={g}
                  items={[...(groups.get(g) ?? [])].sort((a, b) => a.key.localeCompare(b.key))}
                  searching={false}
                  canEdit={canEditConfig}
                  savingKey={savingKey}
                  savedKey={savedKey}
                  onSave={save}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
