// admin/app/login/AgentLoginForm.tsx
// ورود نمایندگان در panel.arkan.gold: با کد یکبارمصرف پیامکی (فقط شماره‌ی ثبت‌شده توسط مدیر)
// یا با نام کاربری و رمز عبور. ثبت‌نام وجود ندارد؛ حساب نماینده را فقط مدیر می‌سازد.
"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, KeyRound, Loader2, MessageSquareText, Smartphone } from "lucide-react";
import { useAgentOtpLogin } from "@/app/hooks/useAdminAuth";
import AdminLoginForm from "./AdminLoginForm";
import LoginSteps, { type LoginStep } from "./LoginSteps";

type Method = "otp" | "password";

const toEnglishDigits = (v: string) =>
  v
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");

const faNum = (n: number) => n.toLocaleString("fa-IR");

const inputClass =
  "w-full pr-12 pl-4 py-4 bg-white border border-gray-300 rounded-2xl outline-none transition-all text-base font-medium text-left focus:border-gold-500 focus:ring-4";
const ringStyle = { ["--tw-ring-color" as string]: "rgba(197,160,89,.15)" };
const submitClass =
  "w-full py-4 mt-2 rounded-2xl font-black text-lg text-white shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-70";
const submitStyle = { backgroundColor: "var(--color-emerald)", boxShadow: "0 8px 20px rgba(51,5,9,.25)" };

export default function AgentLoginForm() {
  const [method, setMethod] = useState<Method>("otp");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-100" role="tablist">
        {(
          [
            { key: "otp", label: "کد پیامکی", icon: MessageSquareText },
            { key: "password", label: "رمز عبور", icon: KeyRound },
          ] as const
        ).map((t) => {
          const active = method === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMethod(t.key)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-black transition-colors ${
                active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {method === "otp" ? (
        <OtpLogin />
      ) : (
        <AdminLoginForm submitLabel="ورود به پنل نمایندگان" home="/agent-portal" />
      )}
    </div>
  );
}

function OtpLogin() {
  const { requestCode, verifyCode, loading, error, setError } = useAgentOtpLogin();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  // کد پیامکی فقط عامل اول است؛ پس از آن برنامه‌ی احراز هویت لازم است (FIA_UAU_EXT.2.3)
  const [nextStep, setNextStep] = useState<LoginStep | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const send = async () => {
    if (!/^09\d{9}$/.test(phone)) return setError("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود");
    const res = await requestCode(phone);
    if (!res) return;
    setInfo(res.message);
    setResendIn(res.resendAfter);
    setCode("");
    setStep("code");
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await send();
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return setError("کد ۶ رقمی پیامک‌شده را وارد کنید");
    const next = await verifyCode(phone, code);
    if (next) setNextStep(next);
  };

  if (nextStep) {
    return (
      <LoginSteps
        initial={nextStep}
        home="/agent-portal"
        onRestart={() => {
          setNextStep(null);
          setStep("phone");
          setCode("");
        }}
      />
    );
  }

  return (
    <>
      {error && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-start gap-3 text-sm font-bold animate-in fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="leading-relaxed">{error}</p>
        </div>
      )}

      {step === "phone" ? (
        <form onSubmit={handlePhoneSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 mr-1">شماره موبایل</label>
            <div className="relative">
              <Smartphone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="tel"
                inputMode="numeric"
                dir="ltr"
                placeholder="09xxxxxxxxx"
                value={phone}
                onChange={(e) => {
                  setPhone(toEnglishDigits(e.target.value).slice(0, 11));
                  if (error) setError(null);
                }}
                className={inputClass}
                style={ringStyle}
                autoComplete="tel"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed mr-1">
              فقط شماره‌ای که مدیر سیستم برای حساب نمایندگی شما ثبت کرده است کد دریافت می‌کند.
            </p>
          </div>
          <button type="submit" disabled={loading} className={submitClass} style={submitStyle}>
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "دریافت کد ورود"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleCodeSubmit} className="space-y-5">
          {info && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[12px] font-bold leading-relaxed">
              {info}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-gray-400 mr-1">کد ۶ رقمی</label>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setError(null);
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-700"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span dir="ltr">{phone}</span>
                <span>(تغییر شماره)</span>
              </button>
            </div>
            <div className="relative">
              <MessageSquareText className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={code}
                onChange={(e) => {
                  setCode(toEnglishDigits(e.target.value).slice(0, 6));
                  if (error) setError(null);
                }}
                className={`${inputClass} tracking-[0.5em] text-center`}
                style={ringStyle}
                autoComplete="one-time-code"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className={submitClass} style={submitStyle}>
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : "ورود به پنل نمایندگان"}
          </button>
          <div className="text-center">
            {resendIn > 0 ? (
              <p className="text-[12px] text-gray-400">ارسال مجدد کد تا {faNum(resendIn)} ثانیه دیگر</p>
            ) : (
              <button
                type="button"
                onClick={() => void send()}
                disabled={loading}
                className="text-[12px] font-black disabled:opacity-60"
                style={{ color: "var(--color-gold-600)" }}
              >
                ارسال مجدد کد
              </button>
            )}
          </div>
        </form>
      )}
    </>
  );
}
