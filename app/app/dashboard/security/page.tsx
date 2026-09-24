"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MonitorSmartphone,
  ShieldCheck,
  LogOut,
} from "lucide-react";

function errorMessage(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) {
    const msg = (e.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
  }
  return fallback;
}

// امتیاز ساده قدرت رمز عبور (۰ تا ۴)
function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LABELS = ["خیلی ضعیف", "ضعیف", "متوسط", "خوب", "قوی"];
const STRENGTH_COLORS = ["#dc2626", "#f97316", "#eab308", "#22c55e", "#15803d"];

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-500">{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          dir="ltr"
          required
          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-11 pr-3 text-sm font-medium outline-none transition-all focus:border-gold-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600"
          aria-label={visible ? "پنهان کردن رمز" : "نمایش رمز"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function SecurityPage() {
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const strength = passwordStrength(form.next);

  const update = (key: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next.length < 6)
      return setError("رمز عبور جدید باید حداقل ۶ کاراکتر باشد");
    if (form.next !== form.confirm)
      return setError("تکرار رمز عبور جدید مطابقت ندارد");
    if (form.next === form.current)
      return setError("رمز عبور جدید نباید با رمز فعلی یکسان باشد");

    setSaving(true);
    setError(null);
    try {
      const res = await axios.post("/api/auth/change-password", {
        currentPassword: form.current,
        newPassword: form.next,
      });
      setSuccess(res.data?.message ?? "رمز عبور با موفقیت تغییر کرد");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setError(errorMessage(err, "خطا در تغییر رمز عبور"));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm("از همه دستگاه‌ها (از جمله این دستگاه) خارج می‌شوید. ادامه می‌دهید؟"))
      return;
    setLoggingOutAll(true);
    setLogoutError(null);
    try {
      await axios.post("/api/auth/logout-all");
      router.replace("/login");
    } catch (err) {
      setLogoutError(errorMessage(err, "خطا در خروج از دستگاه‌ها"));
      setLoggingOutAll(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--color-gold-50)" }}
        >
          <Lock className="h-5 w-5" style={{ color: "var(--color-emerald)" }} />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">امنیت و تغییر رمز عبور</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            مدیریت رمز عبور و نشست‌های فعال حساب کاربری
          </p>
        </div>
      </div>

      {/* تغییر رمز عبور */}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h2 className="flex items-center gap-2 text-[14px] font-black text-gray-800">
          <KeyRound className="h-4 w-4 text-gold-500" />
          تغییر رمز عبور
        </h2>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 p-3 text-sm font-bold text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        <PasswordInput
          label="رمز عبور فعلی"
          value={form.current}
          onChange={update("current")}
          autoComplete="current-password"
        />
        <PasswordInput
          label="رمز عبور جدید"
          value={form.next}
          onChange={update("next")}
          autoComplete="new-password"
        />
        {form.next && (
          <div className="space-y-1">
            <div className="flex gap-1" dir="ltr">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full transition-colors"
                  style={{
                    background: i < strength ? STRENGTH_COLORS[strength] : "#e5e7eb",
                  }}
                />
              ))}
            </div>
            <p className="text-[11px] font-bold" style={{ color: STRENGTH_COLORS[strength] }}>
              قدرت رمز: {STRENGTH_LABELS[strength]}
            </p>
          </div>
        )}
        <PasswordInput
          label="تکرار رمز عبور جدید"
          value={form.confirm}
          onChange={update("confirm")}
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-black text-white transition-all disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "ذخیره رمز عبور جدید"}
        </button>

        <p className="text-center text-[11px] text-gray-400">
          رمز فعلی را فراموش کرده‌اید؟{" "}
          <Link href="/forgot-password" className="font-bold text-gold-600 hover:underline">
            بازیابی رمز عبور
          </Link>
        </p>
      </form>

      {/* نشست‌های فعال */}
      <div
        className="space-y-3 rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h2 className="flex items-center gap-2 text-[14px] font-black text-gray-800">
          <MonitorSmartphone className="h-4 w-4 text-gold-500" />
          دستگاه‌ها و نشست‌ها
        </h2>
        <p className="text-[12px] leading-relaxed text-gray-500">
          اگر احتمال می‌دهید شخص دیگری به حساب شما دسترسی دارد، از همه دستگاه‌ها
          خارج شوید و سپس رمز عبور خود را تغییر دهید.
        </p>
        {logoutError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {logoutError}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogoutAll}
          disabled={loggingOutAll}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 py-3 text-[13px] font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
        >
          {loggingOutAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <LogOut className="h-4 w-4" />
              خروج از همه دستگاه‌ها
            </>
          )}
        </button>
      </div>

      {/* نکات امنیتی */}
      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-gold-50)",
          border: "1px solid var(--color-gold-100)",
        }}
      >
        <h2
          className="mb-3 flex items-center gap-2 text-[13px] font-black"
          style={{ color: "var(--color-emerald)" }}
        >
          <ShieldCheck className="h-4 w-4" />
          نکات امنیتی
        </h2>
        <ul className="list-disc space-y-1.5 pr-4 text-[12px] leading-relaxed text-gray-600">
          <li>رمز عبور را با کسی به اشتراک نگذارید؛ کارشناسان آرکان گلد هرگز رمز شما را نمی‌پرسند.</li>
          <li>از رمزی شامل حروف بزرگ و کوچک، عدد و نماد با حداقل ۸ کاراکتر استفاده کنید.</li>
          <li>کد یک‌بارمصرف پیامکی را فقط در سایت و اپلیکیشن رسمی آرکان گلد وارد کنید.</li>
          <li>پس از استفاده از دستگاه‌های عمومی، حتماً از حساب کاربری خارج شوید.</li>
        </ul>
      </div>
    </div>
  );
}
