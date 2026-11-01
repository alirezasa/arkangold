"use client";
// admin/app/components/AdminStepUpProvider.tsx
// FTA_TSE_EXT.4.2 — پنجره‌ی دریافت کد برنامه‌ی احراز هویت پیش از عملیات حساس پنل
// (اصلاح موجودی، ساخت/تغییر نقش ادمین، بازنشانی رمز یا ورود دومرحله‌ای، خروج اضطراری)
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import { registerAdminStepUp } from "@/app/utils/step-up";
import { useAdminMe } from "@/app/hooks/useAdminMe";

export default function AdminStepUpProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);
  // بدون برنامه‌ی احراز هویت، تأیید ثانویه ممکن نیست: به‌جای درخواست کد، راه‌اندازی آن پیشنهاد می‌شود
  const { me } = useAdminMe();
  const mfaMissing = me ? !me.totpEnabled : false;

  useEffect(() => {
    registerAdminStepUp(
      (a) =>
        new Promise<string | null>((resolve) => {
          resolver.current?.(null);
          resolver.current = resolve;
          setCode("");
          setAction(a);
        }),
    );
    return () => registerAdminStepUp(null);
  }, []);

  const close = (value: string | null) => {
    resolver.current?.(value);
    resolver.current = null;
    setAction(null);
    setCode("");
  };

  return (
    <>
      {children}
      {action && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-stepup-title"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length >= 6) close(code.trim());
            }}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4"
            dir="rtl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h2
                  id="admin-stepup-title"
                  className="text-[15px] font-black text-gray-900"
                >
                  تأیید هویت
                </h2>
              </div>
              <button
                type="button"
                onClick={() => close(null)}
                aria-label="انصراف"
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {mfaMissing ? (
              <>
                <p className="text-[12px] text-gray-600 leading-6">
                  «{action}» عملیات حساس است و پیش از انجام، کد برنامه‌ی احراز
                  هویت خواسته می‌شود. ورود دومرحله‌ای حساب شما فعال نیست؛ ابتدا
                  آن را از پروفایل راه‌اندازی کنید.
                </p>
                <Link
                  href="/profile"
                  onClick={() => close(null)}
                  className="block w-full rounded-xl py-3 text-center text-[13px] font-black text-white"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  راه‌اندازی ورود دومرحله‌ای
                </Link>
              </>
            ) : (
              <>
                <p className="text-[12px] text-gray-600 leading-6">
                  برای «{action}» کد ۶ رقمی برنامه‌ی احراز هویت (یا یکی از کدهای
                  بازیابی) را وارد کنید.
                </p>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={11}
                  aria-label="کد برنامه‌ی احراز هویت"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/[^\d۰-۹A-Za-z-]/g, ""))
                  }
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-lg font-black tracking-[0.3em] outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={code.trim().length < 6}
                  className="w-full rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  تأیید و ادامه
                </button>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
