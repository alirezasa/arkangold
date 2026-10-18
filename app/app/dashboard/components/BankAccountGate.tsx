"use client";

// پس از احراز هویت، کاربر برای واریز و برداشت وجه باید دست‌کم یک حساب/کارت بانکی به نام خودش
// ثبت کند که مالکیت آن با کد ملی تطبیق داده شده باشد (کنترل قطعی در API انجام می‌شود).
import Link from "next/link";
import { CreditCard, ArrowLeft, Loader2 } from "lucide-react";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";

/** true: کاربر حساب تأییدشده دارد؛ false: ندارد؛ null: هنوز معلوم نیست */
export function useHasVerifiedBankAccount(): boolean | null {
  const { accounts, loading, error } = useBankAccounts();
  if (loading || error) return null;
  return accounts.some((a) => a.isVerified);
}

/** بنر یادآوری ثبت حساب بانکی (پس از تکمیل احراز هویت) */
export function BankAccountBanner() {
  const has = useHasVerifiedBankAccount();
  if (has !== false) return null;
  return (
    <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border bg-amber-50 border-amber-200 text-amber-800 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl shrink-0 bg-amber-100 text-amber-600">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-[14px] font-black mb-1">ثبت حساب بانکی</h3>
          <p className="text-[12px] opacity-80 font-medium leading-relaxed">
            احراز هویت شما تکمیل شد. برای واریز و برداشت وجه، کارت/حساب بانکی
            به نام خودتان را ثبت کنید.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/cards"
        className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm bg-amber-500 text-white hover:bg-amber-600"
      >
        <span>ثبت حساب بانکی</span>
        <ArrowLeft className="w-4 h-4" />
      </Link>
    </div>
  );
}

/** دروازه‌ی صفحات واریز/برداشت: تا ثبت حساب تأییدشده، فقط راهنمای ثبت حساب نمایش داده می‌شود */
export default function BankAccountGate({ children }: { children: React.ReactNode }) {
  const has = useHasVerifiedBankAccount();
  if (has === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
      </div>
    );
  }
  if (has) return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md" dir="rtl">
      <div
        className="rounded-3xl p-8 text-center"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "var(--color-gold-50)", color: "var(--color-emerald)" }}
        >
          <CreditCard className="h-8 w-8" />
        </div>
        <h2 className="mb-2 text-lg font-black text-gray-900">
          ابتدا حساب بانکی خود را ثبت کنید
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          واریز و برداشت وجه فقط از/به حساب بانکی به نام خودتان امکان‌پذیر
          است. کارت یا حساب بانکی خود را ثبت کنید تا مالکیت آن با کد ملی شما
          تطبیق داده شود.
        </p>
        <Link
          href="/dashboard/cards"
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          ثبت حساب بانکی
        </Link>
      </div>
    </div>
  );
}
