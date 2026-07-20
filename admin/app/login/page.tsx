// admin/app/login/page.tsx
"use client";
import { useState } from "react";
import {
  ShieldCheck,
  User,
  Lock,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAdminLogin } from "@/app/hooks/useAdminAuth";

export default function AdminLoginPage() {
  const { login, loading, error, setError } = useAdminLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError("نام کاربری را وارد کنید");
    if (!password) return setError("رمز عبور را وارد کنید");
    await login(username.trim(), password);
  };

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row-reverse"
      dir="rtl"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      {/* ── پنل برندینگ (فقط دسکتاپ) ── */}
      <div
        className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-16"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        <div
          className="absolute -top-20 -left-20 w-72 h-72 rounded-full opacity-10 blur-3xl"
          style={{ background: "var(--color-gold-500)" }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: "var(--color-gold-500)" }}
        />

        <div className="relative z-10">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-2xl"
            style={{ backgroundColor: "var(--color-gold-500)" }}
          >
            <ShieldCheck
              className="w-8 h-8"
              style={{ color: "var(--color-emerald)" }}
            />
          </div>
          <h1 className="text-5xl font-black text-white leading-snug">
            پنل مدیریت
            <br />
            <span style={{ color: "var(--color-gold-500)" }}>آرکان گلد</span>
          </h1>
          <p className="mt-8 text-xl text-white/60 font-light leading-relaxed max-w-sm">
            مدیریت امن معاملات، کاربران و عملیات مالی پلتفرم — دسترسی مبتنی بر
            نقش برای هر کارشناس.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-white/40 text-sm font-medium">
          <ShieldCheck
            className="w-5 h-5"
            style={{ color: "var(--color-gold-500)" }}
          />
          دسترسی صرفاً برای کارشناسان مجاز — تمام فعالیت‌ها ثبت می‌شود
        </div>
      </div>

      {/* ── فرم ورود ── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-16 py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* لوگوی موبایل */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              <ShieldCheck
                className="w-6 h-6"
                style={{ color: "var(--color-gold-500)" }}
              />
            </div>
            <div>
              <h1 className="text-lg font-black text-gray-900">پنل مدیریت</h1>
              <p className="text-[11px] text-gray-400">آرکان گلد</p>
            </div>
          </div>

          <div className="mb-8 hidden lg:block">
            <h2 className="text-2xl font-black text-gray-900 mb-1">
              ورود به پنل
            </h2>
            <p className="text-gray-500 text-sm">
              اطلاعات کاربری خود را وارد کنید
            </p>
          </div>

          {error && (
            <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-start gap-3 text-sm font-bold animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 mr-1">
                نام کاربری
              </label>
              <div className="relative">
                <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  dir="ltr"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full pr-12 pl-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none transition-all text-base font-medium text-left focus:border-gold-500 focus:ring-4"
                  style={{
                    ["--tw-ring-color" as string]: "rgba(197,160,89,.15)",
                  }}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-400 mr-1">
                رمز عبور
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute right-4 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full pr-12 pl-12 py-4 bg-white border border-gray-300 rounded-2xl outline-none transition-all text-base font-medium text-left focus:border-gold-500"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-2 rounded-2xl font-black text-lg text-white shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-70"
              style={{
                backgroundColor: "var(--color-emerald)",
                boxShadow: "0 8px 20px rgba(51,5,9,.25)",
              }}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                "ورود به پنل"
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-[11px] text-gray-400 leading-relaxed">
            این پنل صرفاً برای کارشناسان مجاز آرکان گلد است.
            <br />
            تمامی ورودها و فعالیت‌ها ثبت و رصد می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
