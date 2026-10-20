"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { useTypewriter } from "./useTypewriter";
import { authError } from "./styles";

const SLIDES = ["خرید و فروش طلای آب شده", "خرید و فروش شمش طلا"] as const;

interface AuthShellProps {
  /** متن معرفی پنل برندینگ دسکتاپ */
  tagline: string;
  /** محتوای اصلی (عنوان + فرم) — در وسط فضای باقی‌مانده قرار می‌گیرد */
  children: ReactNode;
  /** بخش پایین صفحه (لینک ثبت‌نام/ورود، قوانین) — همیشه به پایین صفحه چسبیده است */
  footer?: ReactNode;
}

/**
 * قالب ثابت صفحات ورود، ثبت‌نام و فراموشی رمز عبور.
 * کل صفحه دقیقاً به اندازه‌ی ارتفاع دیده‌شده‌ی گوشی است (fixed، بدون اسکرول صفحه) و
 * اندازه‌ی لوگو، فیلدها و فاصله‌ها با ارتفاع گوشی کوچک/بزرگ می‌شود (globals.css → auth-*).
 * فقط اگر محتوا روی گوشی بسیار کوتاه جا نشود، ناحیه‌ی فرم به‌تنهایی اسکرول می‌خورد.
 */
export default function AuthShell({ tagline, children, footer }: AuthShellProps) {
  const typed = useTypewriter(SLIDES);

  return (
    <div dir="rtl" className="auth-shell bg-[#fdfdfd]">
      {/* پنل برندینگ (دسکتاپ) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-emerald p-12 lg:flex lg:w-[45%] xl:p-16">
        <div className="absolute inset-0 bg-[url('/patterns/cubes.svg')] opacity-10" />
        <div className="relative z-10">
          <Image
            src="/brand/logo"
            unoptimized
            alt="آرکان گلد"
            width={160}
            height={160}
            className="mb-8 h-[clamp(6rem,16vh,10rem)] w-auto object-contain drop-shadow-xl"
            priority
          />
          <h1 className="text-4xl font-black leading-snug text-white xl:text-5xl">آرکان گلد</h1>
          <p className="mt-3 flex min-h-12 items-center whitespace-nowrap text-2xl font-black text-gold-500 xl:text-3xl">
            <span>{typed}</span>
            <span className="mr-1 animate-pulse font-normal text-white">|</span>
          </p>
          <p className="mt-8 max-w-sm text-lg font-light leading-relaxed text-emerald-100/80 xl:text-xl">
            {tagline}
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-3 font-bold text-gold-500/90">
          <ShieldCheck className="h-6 w-6" />
          <span>تضمین امنیت با رمزنگاری پیشرفته</span>
        </div>
      </aside>

      {/* ستون فرم */}
      <main className="auth-main flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-sm flex-col lg:justify-center">
          {/* لوگو و نام برند (موبایل/تبلت) */}
          <header className="flex shrink-0 flex-col items-center text-center lg:hidden">
            <Image
              src="/brand/logo"
              unoptimized
              alt="آرکان گلد"
              width={110}
              height={110}
              className="auth-logo object-contain"
              priority
            />
            <h1 className="auth-brand font-black text-emerald">
              آرکان <span className="text-gold-500">گلد</span>
            </h1>
            <p className="auth-typed flex items-center justify-center text-sm font-bold text-gray-500">
              <span>{typed}</span>
              <span className="mr-0.5 animate-pulse text-emerald">|</span>
            </p>
          </header>

          <div className="auth-body flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none] lg:flex-none">
            <div className="my-auto w-full">{children}</div>
          </div>

          {footer && <footer className="shrink-0 lg:mt-6">{footer}</footer>}
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="text-center lg:text-right">
      <h2 className="auth-title font-black text-emerald">{title}</h2>
      {subtitle && (
        <p className="auth-subtitle mt-1 text-sm font-medium text-gray-500">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className={authError}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

/** متن قوانین (پایین صفحات ورود/ثبت‌نام) */
export function AuthTerms() {
  return (
    <p className="px-3 text-[11px] font-medium leading-relaxed text-gray-400 sm:text-xs">
      ورود یا ثبت‌نام در سایت به منزله مطالعه و پذیرش{" "}
      <a
        href="https://arkan.gold/rules/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-gold-500 underline transition-colors hover:text-[#a88646]"
      >
        قوانین و مقررات
      </a>{" "}
      آرکان گلد است.
    </p>
  );
}

/** خط جداکننده با متن وسط */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-bold text-gray-400">{label}</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
