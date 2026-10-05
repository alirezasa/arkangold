// admin/app/login/AdminLoginForm.tsx
// فرم ورود با نام کاربری و رمز عبور (پنل مدیریت و تب «رمز عبور» پنل نمایندگان)
"use client";
import { useState } from "react";
import {
  User,
  Lock,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAdminLogin } from "@/app/hooks/useAdminAuth";
import LoginSteps, { type LoginStep } from "./LoginSteps";

export default function AdminLoginForm({
  submitLabel = "ورود به پنل",
  home = "/",
}: {
  submitLabel?: string;
  home?: string;
}) {
  const { login, loading, checking, error, setError } = useAdminLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // پس از رمز درست: تغییر رمز موقت و/یا برنامه‌ی احراز هویت (FIA_UAU_EXT.2.3)
  const [step, setStep] = useState<LoginStep | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError("نام کاربری را وارد کنید");
    if (!password) return setError("رمز عبور را وارد کنید");
    const next = await login(username.trim(), password);
    if (next) {
      setPassword("");
      setStep(next);
    }
  };

  if (step) {
    return <LoginSteps initial={step} home={home} onRestart={() => setStep(null)} />;
  }

  return (
    <>
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
              aria-label="نام کاربری"
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
              maxLength={128}
              aria-label="رمز عبور"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
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
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              {checking && <span className="text-sm font-bold">در حال بررسی امنیتی…</span>}
            </>
          ) : (
            submitLabel
          )}
        </button>
      </form>
    </>
  );
}
