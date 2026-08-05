"use client";
import { useState } from "react";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

interface ConfigItem {
  key: string;
  value: string;
}

export default function PaymentGatewaySettings() {
  const { data, mutate } = useSWR<ConfigItem[]>(
    "/api/admin/system-config",
    fetcher,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const get = (key: string) => data?.find((c) => c.key === key)?.value ?? "";

  const save = async (key: string, value: string) => {
    setSaving(key);
    setError(null);
    try {
      await adminApi.put(`/api/admin/system-config/${key}`, { value });
      await mutate();
    } catch {
      setError("خطا در ذخیره تنظیمات");
    } finally {
      setSaving(null);
    }
  };

  const toggle = (key: string) =>
    save(key, get(key) === "true" ? "false" : "true");

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── زرین‌پال ── */}
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-black text-gray-700">زرین‌پال</h3>
          <button
            onClick={() => toggle("payment.zarinpal.enabled")}
            disabled={saving === "payment.zarinpal.enabled"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{
              background:
                get("payment.zarinpal.enabled") === "true"
                  ? "#dcfce7"
                  : "#f3f4f6",
              color:
                get("payment.zarinpal.enabled") === "true"
                  ? "#16a34a"
                  : "#6b7280",
            }}
          >
            {saving === "payment.zarinpal.enabled" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {get("payment.zarinpal.enabled") === "true" ? "فعال" : "غیرفعال"}
          </button>
        </div>
        <input
          placeholder="Merchant ID"
          defaultValue={get("payment.zarinpal.merchant_id")}
          onBlur={(e) => save("payment.zarinpal.merchant_id", e.target.value)}
          dir="ltr"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-left"
        />
        <label className="flex items-center gap-2 text-[12px] text-gray-500">
          <input
            type="checkbox"
            checked={get("payment.zarinpal.sandbox") === "true"}
            onChange={() => toggle("payment.zarinpal.sandbox")}
          />
          حالت آزمایشی (Sandbox)
        </label>
      </div>

      {/* ── به‌پرداخت ملت ── */}
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-black text-gray-700">
            به‌پرداخت ملت
          </h3>
          <button
            onClick={() => toggle("payment.behpardakht.enabled")}
            disabled={saving === "payment.behpardakht.enabled"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{
              background:
                get("payment.behpardakht.enabled") === "true"
                  ? "#dcfce7"
                  : "#f3f4f6",
              color:
                get("payment.behpardakht.enabled") === "true"
                  ? "#16a34a"
                  : "#6b7280",
            }}
          >
            {get("payment.behpardakht.enabled") === "true" ? "فعال" : "غیرفعال"}
          </button>
        </div>
        <input
          placeholder="Terminal ID"
          defaultValue={get("payment.behpardakht.terminal_id")}
          onBlur={(e) =>
            save("payment.behpardakht.terminal_id", e.target.value)
          }
          dir="ltr"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-left"
        />
        <input
          placeholder="Username"
          defaultValue={get("payment.behpardakht.username")}
          onBlur={(e) => save("payment.behpardakht.username", e.target.value)}
          dir="ltr"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-left"
        />
        <input
          placeholder="Password"
          type="password"
          defaultValue=""
          onBlur={(e) =>
            e.target.value &&
            save("payment.behpardakht.password", e.target.value)
          }
          dir="ltr"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-left"
        />
      </div>
    </div>
  );
}
