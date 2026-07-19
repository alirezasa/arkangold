"use client";
import { useState } from "react";
import { ShieldCheck, User, Lock, Loader2, AlertCircle } from "lucide-react";
import { useAdminLogin } from "@/app/hooks/useAdminAuth";

export default function AdminLoginPage() {
  const { login, loading, error, setError } = useAdminLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return setError("نام کاربری و رمز عبور را وارد کنید");
    await login(username, password);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      dir="rtl"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "var(--color-gold-500)" }}
          >
            <ShieldCheck className="w-8 h-8" style={{ color: "var(--color-emerald)" }} />
          </div>
          <h1 className="text-xl font-black text-white">پنل مدیریت آرکان گلد</h1>
          <p className="text-white/50 text-sm mt-1">ورود اختصاصی کارشناسان</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">نام کاربری</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); if (error) setError(null); }}
                className="w-full pr-10 pl-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
                autoComplete="username"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">رمز عبور</label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                className="w-full pr-10 pl-3 py-3 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: "var(--color-green)" }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ورود به پنل"}
          </button>
        </form>

        <p className="text-center text-white text-[11px] mt-2">
          دسترسی به این پنل صرفاً برای کارشناسان مجاز است
        </p>
      </div>
    </div>
  );
}