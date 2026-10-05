"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Headset,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Clock,
} from "lucide-react";
import OtpInput from "@/app/components/OtpInput";
import { digitsOnly } from "@/app/utils/digits";
import { useMobileVerification } from "@/app/hooks/useMobileVerification";
import { useProfilePage } from "@/app/hooks/useProfilePage";
import { consumeReturnPath } from "@/app/utils/return-path";

type Step = "phone" | "otp" | "done";

const OTP_LENGTH = 6;

function formatPhone(phone: string) {
  return phone.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
}

export default function MobileVerificationPage() {
  const router = useRouter();
  const {
    info,
    loading,
    busy,
    error,
    setError,
    recheck,
    requestChange,
    confirmChange,
  } = useMobileVerification();
  // پروفایل مشترک با Layout: پس از تغییر شماره به‌روز می‌شود تا گیت داشبورد باز شود
  const { refetch: refetchProfile } = useProfilePage();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [notice, setNotice] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [newPhone, setNewPhone] = useState<string | null>(null);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const goOn = () => router.push(consumeReturnPath() ?? "/dashboard");

  const submitPhone = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^09\d{9}$/.test(phone)) {
      setError("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود");
      return;
    }
    const res = await requestChange(phone);
    if (res) {
      setNotice(res.message);
      setOtp(Array(OTP_LENGTH).fill(""));
      setTimer(res.expiresIn || 180);
      setStep("otp");
    }
  };

  const submitOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH) return;
    const res = await confirmChange(phone, code);
    if (res) {
      setNewPhone(res.phone);
      setStep("done");
      await refetchProfile();
    } else {
      setOtp(Array(OTP_LENGTH).fill(""));
    }
  };

  const handleRecheck = async () => {
    const res = await recheck();
    if (res) {
      setNotice(res.message);
      await refetchProfile();
    }
  };

  if (loading || !info) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
      </div>
    );
  }

  // ── احراز هویت هنوز تأیید نشده ──
  if (!info.identityVerified) {
    return (
      <Shell>
        <HeroCard tone="amber" icon={<ShieldAlert className="h-8 w-8" />}>
          <h2 className="mb-2 text-lg font-black text-gray-900">
            ابتدا احراز هویت را تکمیل کنید
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">
            مالکیت شماره موبایل پس از تأیید هویت، با کد ملی شما در سامانه شاهکار
            تطبیق داده می‌شود.
          </p>
          <PrimaryLink href="/dashboard/identity">رفتن به احراز هویت</PrimaryLink>
        </HeroCard>
      </Shell>
    );
  }

  // ── تغییر شماره با موفقیت انجام شد ──
  if (step === "done") {
    return (
      <Shell>
        <HeroCard tone="emerald" icon={<CheckCircle2 className="h-9 w-9" />}>
          <h2 className="mb-2 text-xl font-black text-gray-900">
            شماره موبایل شما تأیید و ثبت شد
          </h2>
          <p className="mb-2 text-sm leading-relaxed text-gray-500">
            از این پس با شماره‌ی زیر وارد حساب کاربری خود شوید:
          </p>
          <p
            className="mb-6 text-2xl font-black tracking-widest text-gray-900"
            dir="ltr"
          >
            {formatPhone(newPhone ?? phone)}
          </p>
          <PrimaryButton onClick={goOn}>
            ادامه و استفاده از خدمات
            <ArrowLeft className="h-4 w-4" />
          </PrimaryButton>
        </HeroCard>
      </Shell>
    );
  }

  // ── شماره تأیید شده ──
  if (info.status === "VERIFIED") {
    return (
      <Shell>
        <HeroCard tone="emerald" icon={<ShieldCheck className="h-9 w-9" />}>
          <h2 className="mb-2 text-xl font-black text-gray-900">{info.title}</h2>
          <p className="mb-2 text-sm leading-relaxed text-gray-500">
            {info.description}
          </p>
          <p
            className="mb-6 text-xl font-black tracking-widest text-gray-900"
            dir="ltr"
          >
            {formatPhone(info.phone)}
          </p>
          <PrimaryButton onClick={goOn}>
            ورود به پیشخوان
            <ArrowLeft className="h-4 w-4" />
          </PrimaryButton>
        </HeroCard>
      </Shell>
    );
  }

  // ── در انتظار سامانه / بررسی نشده ──
  if (info.status !== "MISMATCH") {
    return (
      <Shell>
        <HeroCard tone="blue" icon={<Clock className="h-8 w-8" />}>
          <h2 className="mb-2 text-lg font-black text-gray-900">{info.title}</h2>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">
            {info.description}
          </p>
          {notice && <InfoNote>{notice}</InfoNote>}
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="space-y-2">
            <PrimaryButton onClick={handleRecheck} disabled={busy !== null}>
              {busy === "recheck" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              استعلام مجدد
            </PrimaryButton>
            <SecondaryLink href="/dashboard">بازگشت به پیشخوان</SecondaryLink>
          </div>
        </HeroCard>
      </Shell>
    );
  }

  // ── عدم تطابق: راهنما + ثبت شماره‌ی جدید ──
  return (
    <Shell>
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 via-rose-500 to-orange-400 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-12 left-16 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <Smartphone className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="mb-1 text-lg font-black">{info.title}</h2>
            <p className="text-[13px] leading-relaxed text-white/90">
              {info.description}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-1.5 text-[12px] font-bold">
              شماره فعلی:
              <span dir="ltr" className="tracking-widest line-through decoration-2">
                {formatPhone(info.phone)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* راهنمای قدم‌به‌قدم */}
      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h3 className="mb-4 text-[14px] font-black text-gray-900">
          چه کاری باید انجام دهم؟
        </h3>
        <ol className="space-y-3">
          {info.steps.map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {(i + 1).toLocaleString("fa-IR")}
              </span>
              <p className="pt-0.5 text-[13px] leading-relaxed text-gray-600">
                {text}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* فرم */}
      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <StepIndicator step={step} />

        {notice && step === "otp" && <InfoNote>{notice}</InfoNote>}
        {error && <ErrorNote>{error}</ErrorNote>}

        {step === "phone" ? (
          <form onSubmit={submitPhone} className="space-y-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-bold text-gray-500">
                <Smartphone className="h-3.5 w-3.5" />
                شماره موبایل به نام خودتان
              </label>
              <input
                type="tel"
                inputMode="numeric"
                dir="ltr"
                maxLength={11}
                placeholder="09xxxxxxxxx"
                value={phone}
                onChange={(e) => {
                  setPhone(digitsOnly(e.target.value).slice(0, 11));
                  if (error) setError(null);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left text-lg font-black tracking-[0.2em] outline-none transition-all focus:border-gold-500"
              />
              <p className="text-[11px] text-gray-400">
                سیم‌کارت این شماره باید با همین کد ملی ثبت شده باشد (قابل استعلام از
                سامانه شاهکار).
              </p>
            </div>
            <PrimaryButton type="submit" disabled={busy !== null}>
              {busy === "request" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  در حال استعلام از شاهکار...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  استعلام و دریافت کد تأیید
                </>
              )}
            </PrimaryButton>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-[13px] text-gray-500">
              کد ۶ رقمی ارسال‌شده به{" "}
              <span dir="ltr" className="font-black text-gray-900">
                {formatPhone(phone)}
              </span>{" "}
              را وارد کنید
            </p>
            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (error) setError(null);
              }}
              onComplete={submitOtp}
              disabled={busy === "confirm"}
            />
            <PrimaryButton
              onClick={() => submitOtp(otp.join(""))}
              disabled={busy !== null || otp.join("").length !== OTP_LENGTH}
            >
              {busy === "confirm" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  تأیید و ثبت شماره
                </>
              )}
            </PrimaryButton>
            <div className="flex items-center justify-between text-[12px] font-bold">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setNotice(null);
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ویرایش شماره
              </button>
              {timer > 0 ? (
                <span className="text-gray-400">
                  ارسال مجدد تا {timer.toLocaleString("fa-IR")} ثانیه
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => submitPhone()}
                  disabled={busy !== null}
                  className="text-gold-600 hover:underline disabled:opacity-50"
                >
                  ارسال مجدد کد
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* سیم‌کارت به نام شد؟ */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleRecheck}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-[13px] font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
          style={{ borderColor: "var(--color-border)" }}
        >
          {busy === "recheck" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          سیم‌کارت فعلی را به نام خودم کردم؛ استعلام مجدد
        </button>
        <Link
          href="/dashboard/support/new"
          className="flex items-center justify-center gap-2 rounded-2xl border bg-white px-4 py-3 text-[13px] font-bold transition-colors hover:bg-gray-50"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-emerald)",
          }}
        >
          <Headset className="h-4 w-4" />
          نیاز به راهنمایی دارم
        </Link>
      </div>
      {notice && step === "phone" && <InfoNote>{notice}</InfoNote>}
    </Shell>
  );
}

// ── اجزای کوچک صفحه ──

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg space-y-4" dir="rtl">
      <div className="mb-2 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--color-emerald-light)" }}
        >
          <Smartphone className="h-5 w-5" style={{ color: "var(--color-emerald)" }} />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">تأیید شماره موبایل</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            تطبیق مالکیت سیم‌کارت با کد ملی (سامانه شاهکار)
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

const TONES = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-blue-50 text-blue-600",
} as const;

function HeroCard({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-3xl p-8 text-center"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${TONES[tone]}`}
      >
        {icon}
      </div>
      {children}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { key: "phone", label: "شماره جدید" },
    { key: "otp", label: "کد تأیید" },
  ];
  const activeIndex = step === "phone" ? 0 : 1;
  return (
    <div className="mb-5 flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
              i <= activeIndex ? "text-white" : "bg-gray-100 text-gray-400"
            }`}
            style={i <= activeIndex ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {(i + 1).toLocaleString("fa-IR")}
          </span>
          <span
            className={`text-[12px] font-bold ${i <= activeIndex ? "text-gray-800" : "text-gray-400"}`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="mx-1 h-px flex-1 bg-gray-200" />
          )}
        </div>
      ))}
    </div>
  );
}

function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-black text-white transition-all disabled:opacity-60"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      {children}
    </button>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      {children}
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block w-full rounded-xl border py-3 text-center font-bold transition-colors hover:bg-gray-50"
      style={{ borderColor: "var(--color-border)", color: "var(--color-emerald)" }}
    >
      {children}
    </Link>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] font-bold leading-relaxed text-red-600">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[13px] font-bold leading-relaxed text-emerald-700">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
