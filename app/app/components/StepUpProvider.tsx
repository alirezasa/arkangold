"use client";
// app/app/components/StepUpProvider.tsx
// FTA_TSE_EXT.4.2 — پنجره‌ی «تأیید ثانویه» پیش از عملیات حساس (برداشت، انتقال، افزودن حساب بانکی):
// کد پیامکی به شماره‌ی کاربر (یا کد برنامه‌ی احراز هویت اگر فعال باشد) گرفته و پس از تأیید، توکن
// یک‌بارمصرف به hook درخواست‌دهنده برگردانده می‌شود.
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { registerStepUpRequester, type StepUpPurpose } from "@/app/utils/step-up";

interface Challenge {
  challengeToken: string;
  method: "SMS" | "TOTP";
  action: string;
  maskedPhone?: string;
}

const errorText = (e: unknown, fallback: string) =>
  axios.isAxiosError(e) ? ((e.response?.data as { message?: string })?.message ?? fallback) : fallback;

export default function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [purpose, setPurpose] = useState<StepUpPurpose | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const start = useCallback(async (p: StepUpPurpose) => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await axios.post<Challenge>("/api/auth/step-up/start", { purpose: p });
      setChallenge(data);
      setResendIn(60);
    } catch (e) {
      setError(errorText(e, "ارسال کد تأیید ناموفق بود"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    registerStepUpRequester(
      (p) =>
        new Promise<string | null>((resolve) => {
          resolver.current?.(null);
          resolver.current = resolve;
          setPurpose(p);
          setChallenge(null);
          setCode("");
          void start(p);
        }),
    );
    return () => registerStepUpRequester(null);
  }, [start]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const close = (token: string | null) => {
    resolver.current?.(token);
    resolver.current = null;
    setPurpose(null);
    setChallenge(null);
    setCode("");
    setError(null);
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await axios.post<{ stepUpToken: string }>("/api/auth/step-up/verify", {
        challengeToken: challenge.challengeToken,
        code: code.trim(),
      });
      close(data.stepUpToken);
    } catch (err) {
      setError(errorText(err, "کد تأیید نادرست است"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {children}
      {purpose && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
          <form onSubmit={verify} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4" dir="rtl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h2 id="stepup-title" className="text-[15px] font-black text-gray-900">تأیید هویت برای این عملیات</h2>
              </div>
              <button type="button" onClick={() => close(null)} aria-label="انصراف" className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {challenge ? (
              <p className="text-[12px] text-gray-600 leading-6">
                برای «{challenge.action}»{" "}
                {challenge.method === "SMS" ? (
                  <>
                    کد ۶ رقمی ارسال‌شده به <bdi dir="ltr">{challenge.maskedPhone}</bdi> را وارد کنید.
                  </>
                ) : (
                  <>کد ۶ رقمی برنامه‌ی احراز هویت (یا یکی از کدهای بازیابی) را وارد کنید.</>
                )}
              </p>
            ) : (
              <p className="text-[12px] text-gray-500 flex items-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} در حال آماده‌سازی تأیید...
              </p>
            )}
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={challenge?.method === "TOTP" ? 11 : 6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d۰-۹A-Za-z-]/g, ""))}
              aria-label="کد تأیید"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg font-black tracking-[0.3em] outline-none focus:border-emerald-500"
            />
            {error && <p className="text-[12px] font-bold text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy || !challenge || code.trim().length < 6}
              className="w-full rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "تأیید"}
            </button>
            {challenge?.method === "SMS" && (
              <button
                type="button"
                disabled={busy || resendIn > 0}
                onClick={() => purpose && void start(purpose)}
                className="w-full text-[12px] font-bold text-gray-500 disabled:opacity-50"
              >
                {resendIn > 0 ? `ارسال دوباره تا ${resendIn.toLocaleString("fa-IR")} ثانیه` : "ارسال دوباره‌ی کد"}
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
