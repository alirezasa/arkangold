"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Settings2,
  ArrowLeftRight,
} from "lucide-react";
import PaymentGatewaySettings from "@/app/components/PaymentGatewaySettings";

interface ConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

// ── ترتیب و عنوان فارسی هر گروه (بر اساس پیشوند کلید تا اولین نقطه) ──
const GROUP_ORDER = [
  "transfer",
  "withdrawal",
  "deposit",
  "trade",
  "fee",
  "tax",
  "referral",
  "identity",
  "payment",
  "company",
  "document",
  "proforma",
  "calendar",
];

const GROUP_TITLES: Record<string, string> = {
  transfer: "انتقال طلا بین کاربران",
  withdrawal: "برداشت وجه",
  deposit: "واریز وجه",
  trade: "معاملات طلا",
  fee: "کارمزد",
  tax: "مالیات",
  referral: "پاداش معرفی دوستان",
  identity: "احراز هویت (KYC)",
  payment: "درگاه‌های پرداخت",
  company: "اطلاعات شرکت",
  document: "اسناد و مدارک",
  proforma: "پیش‌فاکتور واریز",
  calendar: "تقویم و تعطیلات",
};

function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function isBoolean(value: string): boolean {
  return value === "true" || value === "false";
}

// کلیدهایی که کامپوننت PaymentGatewaySettings خودش مدیریت می‌کند —
// بقیه کلیدهای گروه payment باید همچنان به‌صورت عمومی نمایش داده شوند
const PAYMENT_KEYS_HANDLED_BY_WIDGET = new Set([
  "payment.zarinpal.enabled",
  "payment.zarinpal.merchant_id",
  "payment.zarinpal.sandbox",
  "payment.behpardakht.enabled",
  "payment.behpardakht.terminal_id",
  "payment.behpardakht.username",
  "payment.behpardakht.password",
]);

function ConfigField({
  item,
  onSave,
  saving,
  saved,
}: {
  item: ConfigItem;
  onSave: (key: string, value: string) => void;
  saving: boolean;
  saved: boolean;
}) {
  const numeric = isNumeric(item.value);
  const isRial = /_rial$/.test(item.key) && numeric;
  const long = item.value.length > 60 || item.value.includes("\n");

  if (isBoolean(item.value)) {
    return (
      <div className="flex items-center justify-between py-2.5">
        <span className="text-[12px] font-bold text-gray-600">
          {item.description || item.key}
        </span>
        <button
          onClick={() => onSave(item.key, item.value === "true" ? "false" : "true")}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0"
          style={{
            background: item.value === "true" ? "#dcfce7" : "#f3f4f6",
            color: item.value === "true" ? "#16a34a" : "#6b7280",
          }}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          {item.value === "true" ? "فعال" : "غیرفعال"}
        </button>
      </div>
    );
  }

  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[12px] font-bold text-gray-600">
          {item.description || item.key}
        </label>
        {saved && (
          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> ذخیره شد
          </span>
        )}
      </div>
      {long ? (
        <textarea
          defaultValue={item.value}
          onBlur={(e) => onSave(item.key, e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-800"
        />
      ) : (
        <input
          defaultValue={item.value}
          onBlur={(e) => onSave(item.key, e.target.value)}
          dir={numeric ? "ltr" : "rtl"}
          inputMode={numeric ? "decimal" : undefined}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
          style={numeric ? { textAlign: "left" } : undefined}
        />
      )}
      {isRial && (
        <p className="text-[10px] text-gray-400 mt-1">
          ≈ {(Number(item.value) / 10).toLocaleString("fa-IR")} تومان
        </p>
      )}
    </div>
  );
}

export default function SystemConfigPage() {
  const { data, mutate, isLoading, error } = useSWR<ConfigItem[]>(
    "/api/admin/system-config",
    fetcher,
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (key: string, value: string) => {
    setSavingKey(key);
    setSaveError(null);
    try {
      await adminApi.put(`/api/admin/system-config/${key}`, { value });
      await mutate();
      setSavedKey(key);
      setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1800);
    } catch {
      setSaveError("خطا در ذخیره تنظیمات");
    } finally {
      setSavingKey(null);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, ConfigItem[]>();
    for (const item of data ?? []) {
      const prefix = item.key.split(".")[0];
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(item);
    }
    for (const items of map.values()) {
      items.sort((a, b) => a.key.localeCompare(b.key));
    }
    const known = GROUP_ORDER.filter((g) => map.has(g));
    const unknown = [...map.keys()]
      .filter((g) => !GROUP_ORDER.includes(g))
      .sort();
    return [...known, ...unknown].map((g) => ({
      prefix: g,
      title: GROUP_TITLES[g] ?? g,
      items: map.get(g)!,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
        <AlertCircle className="w-4 h-4" />
        خطا در دریافت تنظیمات سیستم
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-gray-400" />
        تنظیمات سیستم
      </h1>
      <p className="text-[12px] text-gray-400 mb-5">
        محدودیت‌ها، سقف‌های روزانه/ماهانه و پارامترهای عملیاتی پلتفرم
      </p>

      {saveError && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {saveError}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <div
            key={group.prefix}
            className="rounded-2xl p-5"
            style={{
              backgroundColor: "var(--color-surface, #fff)",
              border:
                group.prefix === "transfer"
                  ? "1.5px solid #10b981"
                  : "1px solid var(--color-border, #e5e7eb)",
            }}
          >
            <h3 className="text-[13px] font-black text-gray-700 mb-1 flex items-center gap-1.5">
              {group.prefix === "transfer" && (
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" />
              )}
              {group.title}
            </h3>

            {group.prefix === "payment" && (
              <div className="mt-3 mb-1">
                <PaymentGatewaySettings />
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {(group.prefix === "payment"
                ? group.items.filter(
                    (item) => !PAYMENT_KEYS_HANDLED_BY_WIDGET.has(item.key),
                  )
                : group.items
              ).map((item) => (
                <ConfigField
                  key={item.key}
                  item={item}
                  onSave={save}
                  saving={savingKey === item.key}
                  saved={savedKey === item.key}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
