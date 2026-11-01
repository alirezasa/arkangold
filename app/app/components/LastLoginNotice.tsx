"use client";
// app/app/components/LastLoginNotice.tsx
// FTA_TAH_EXT.1.1 — نمایش آخرین ورود موفق پیش از نشست فعلی (زمان، دستگاه، IP پوشانده) و تعداد
// تلاش‌های ناموفق پس از آن. variant="banner" یک‌بار پس از هر ورود در داشبورد نمایش داده می‌شود؛
// variant="card" همیشه در صفحه‌ی امنیت.
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { History, X, AlertTriangle } from "lucide-react";

interface LastLogin {
  currentLoginAt: string | null;
  previous: { at: string; ip: string; device: string } | null;
  failedAttemptsSince: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Tehran" }).format(
    new Date(iso),
  );

function dismissedKey(d: LastLogin) {
  return `last-login-seen:${d.currentLoginAt ?? ""}`;
}

export default function LastLoginNotice({ variant = "banner" }: { variant?: "banner" | "card" }) {
  const { data } = useSWR<LastLogin>("/api/user/last-login", fetcher, { revalidateOnFocus: false });
  const [hidden, setHidden] = useState(false);
  if (!data) return null;

  if (variant === "banner") {
    let seen = false;
    try {
      seen = sessionStorage.getItem(dismissedKey(data)) === "1";
    } catch {
      // دسترسی به sessionStorage ممکن نیست
    }
    if (hidden || seen) return null;
  }
  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissedKey(data), "1");
    } catch {
      // دسترسی به sessionStorage ممکن نیست
    }
    setHidden(true);
  };
  const warn = data.failedAttemptsSince > 0;

  return (
    <div
      className={`mb-4 flex items-start gap-3 rounded-2xl border p-3.5 text-[12px] ${
        warn ? "border-amber-200 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-600"
      }`}
      role="status"
    >
      {warn ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <History className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />}
      <div className="flex-1 leading-6">
        {data.previous ? (
          <>
            آخرین ورود موفق قبلی: <b>{fmt(data.previous.at)}</b> — {data.previous.device}، IP{" "}
            <bdi dir="ltr">{data.previous.ip}</bdi>
          </>
        ) : (
          <>این اولین ورود ثبت‌شده به حساب شماست.</>
        )}
        {warn && (
          <div className="font-bold">
            از آن زمان {data.failedAttemptsSince.toLocaleString("fa-IR")} تلاش ناموفق برای ورود ثبت شده است؛ اگر شما نبوده‌اید رمز عبور را تغییر دهید.
          </div>
        )}
      </div>
      {variant === "banner" && (
        <button type="button" onClick={dismiss} aria-label="بستن" className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
