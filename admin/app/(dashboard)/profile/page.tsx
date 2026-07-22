// admin/app/(dashboard)/profile/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Clock,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (data?.message)
      return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useSWR(
    "/api/admin-auth/me",
    fetcher,
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword) return setError("رمز عبور فعلی را وارد کنید");
    if (newPassword.length < 12)
      return setError("رمز عبور جدید باید حداقل ۱۲ کاراکتر باشد");
    if (newPassword !== confirmPassword)
      return setError("رمز عبور جدید و تکرار آن یکسان نیستند");

    setLoading(true);
    try {
      await axios.post("/api/admin-auth/change-password", {
        currentPassword,
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تغییر رمز عبور"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-black text-gray-900 mb-2">
          رمز عبور تغییر یافت
        </h2>
        <p className="text-[13px] text-gray-500">
          در حال انتقال به صفحه ورود...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-black text-gray-900 mb-1">پروفایل کاربری</h1>
      <p className="text-[12px] text-gray-400 mb-5">
        مدیریت حساب کاربری و امنیت ورود
      </p>

      {/* ── کارت اطلاعات ادمین ── */}
      {meLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : (
        me && (
          <div
            className="rounded-2xl p-5 mb-5 flex items-center gap-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-[18px] font-black"
              style={{
                backgroundColor: "var(--color-gold-500)",
                color: "var(--color-emerald)",
              }}
            >
              {me.fullName?.charAt(0) ?? "؟"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-black text-gray-900">
                {me.fullName}
              </p>
              <p dir="ltr" className="text-[12px] text-gray-400">
                {me.username}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <span
                  className="badge"
                  style={{
                    background: "var(--color-emerald-light)",
                    color: "var(--color-emerald)",
                  }}
                >
                  {me.role.name}
                </span>
                {me.totpEnabled ? (
                  <span className="flex items-center gap-1 text-[11px] text-green-600 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5" /> 2FA فعال
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-amber-600 font-bold">
                    <AlertCircle className="w-3.5 h-3.5" /> 2FA غیرفعال
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      )}

      {me?.lastLoginAt && (
        <div className="flex items-center gap-2 text-[12px] text-gray-400 mb-5">
          <Clock className="w-3.5 h-3.5" />
          آخرین ورود: {new Date(me.lastLoginAt).toLocaleString("fa-IR")}
        </div>
      )}

      {/* ── فرم تغییر رمز ── */}
      <div
        className="rounded-2xl p-6"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2 mb-5">
          <Lock className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
          <h2 className="text-[14px] font-black text-gray-800">
            تغییر رمز عبور
          </h2>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">
              رمز عبور فعلی
            </label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPasswords ? "text" : "password"}
                dir="ltr"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm text-left"
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">
              رمز عبور جدید (حداقل ۱۲ کاراکتر)
            </label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPasswords ? "text" : "password"}
                dir="ltr"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm text-left"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">
              تکرار رمز عبور جدید
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute right-3 w-4 h-4 text-gray-400" />
              <input
                type={showPasswords ? "text" : "password"}
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm text-left"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute left-3 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPasswords ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[11px] font-medium">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            پس از تغییر رمز عبور، تمام نشست‌های فعال باطل می‌شود و باید دوباره
            وارد شوید.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "تغییر رمز عبور"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
