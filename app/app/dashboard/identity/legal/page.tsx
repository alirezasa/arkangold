"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Hash,
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  useProfilePage,
  useLegalProfileForm,
} from "@/app/hooks/useProfilePage";

type LegalForm = {
  companyName: string;
  nationalId: string;
  economicCode: string;
  registrationNumber: string;
};

export default function LegalProfileCompletionPage() {
  const router = useRouter();
  const { data, loading, refetch } = useProfilePage();
  const { loading: submitting, error, success, submit } = useLegalProfileForm();

  const initialForm = useMemo<LegalForm>(
    () => ({
      companyName: data?.legalProfile?.companyName ?? "",
      nationalId: data?.legalProfile?.nationalId ?? "",
      economicCode: data?.legalProfile?.economicCode ?? "",
      registrationNumber: data?.legalProfile?.registrationNumber ?? "",
    }),
    [data],
  );

  const [form, setForm] = useState<LegalForm | null>(null);

  const currentForm = form ?? initialForm;

  useEffect(() => {
    if (loading || !data) return;

    if (data.type !== "LEGAL") {
      router.replace("/dashboard");
      return;
    }

    if (data.identity?.status !== "VERIFIED") {
      router.replace("/dashboard/identity");
      return;
    }

    if (data.legalProfile?.verified) {
      router.replace("/dashboard");
    }
  }, [loading, data, router]);

  const hasSubmitted =
    Boolean(data?.legalProfile?.companyName?.trim()) || success;

  const updateForm = (field: keyof LegalForm, value: string) => {
    setForm((prev) => ({
      ...(prev ?? initialForm),
      [field]: value,
    }));
  };

  const nationalIdError =
    currentForm.nationalId.length > 0 && currentForm.nationalId.length !== 11
      ? "شناسه ملی باید ۱۱ رقم باشد"
      : "";

  const economicCodeError =
    currentForm.economicCode.length > 0 &&
    currentForm.economicCode.length !== 12
      ? "کد اقتصادی باید ۱۲ رقم باشد"
      : "";

  const formError = nationalIdError || economicCodeError;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (formError) return;

    const ok = await submit({
      companyName: currentForm.companyName.trim(),
      nationalId: currentForm.nationalId,
      economicCode: currentForm.economicCode || undefined,
      registrationNumber: currentForm.registrationNumber.trim() || undefined,
    });

    if (ok) {
      setForm(null);
      refetch();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--color-emerald)" }}
        />
      </div>
    );
  }

  if (!data) return null;

  if (hasSubmitted) {
    return (
      <div className="max-w-md mx-auto mt-8" dir="rtl">
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-black text-gray-900 mb-2">
            در انتظار تایید ادمین
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            اطلاعات شرکت شما با موفقیت ثبت شد و توسط کارشناسان ما در حال بررسی
            است. پس از تایید، حساب کاربری شما فعال شده و
            استفاده از سایر بخش‌های اپلیکیشن برای شما باز خواهد شد.
          </p>

          <div
            className="rounded-xl p-4 text-right space-y-2 mb-6"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <div className="flex justify-between text-[12px] gap-4">
              <span className="text-gray-400">نام شرکت</span>
              <span className="font-bold text-gray-700 text-left">
                {data.legalProfile?.companyName || currentForm.companyName}
              </span>
            </div>
            <div className="flex justify-between text-[12px] gap-4">
              <span className="text-gray-400">شناسه ملی</span>
              <span className="font-bold text-gray-700" dir="ltr">
                {data.legalProfile?.nationalId || currentForm.nationalId}
              </span>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <RefreshCw className="w-4 h-4" />
            بررسی مجدد وضعیت
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "var(--color-emerald-light)" }}
        >
          <Building2
            className="w-5 h-5"
            style={{ color: "var(--color-emerald)" }}
          />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">
            تکمیل اطلاعات حقوقی
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            برای فعال‌سازی حساب شرکت، این اطلاعات را کامل کنید
          </p>
        </div>
      </div>

      <div
        className="flex items-start gap-3 p-4 rounded-xl mb-6 text-sm"
        style={{
          backgroundColor: "#fefce8",
          border: "1px solid #fef08a",
          color: "#854d0e",
        }}
      >
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          پس از ثبت، اطلاعات توسط کارشناسان بررسی و حساب کاربری شما فعال می‌شود.
          تا آن زمان امکان احراز هویت شخصی و استفاده از سایر امکانات پلتفرم برای
          شما وجود ندارد.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl p-6 space-y-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {(error || formError) && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm font-bold text-red-600 bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {formError || error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            نام شرکت / موسسه
          </label>
          <input
            type="text"
            required
            placeholder="شرکت نمونه (سهامی خاص)"
            value={currentForm.companyName}
            onChange={(e) => updateForm("companyName", e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500 flex items-center gap-1">
            <Hash className="w-3.5 h-3.5" /> شناسه ملی شرکت (۱۱ رقم)
          </label>
          <input
            type="tel"
            dir="ltr"
            required
            maxLength={11}
            inputMode="numeric"
            placeholder="10320000000"
            value={currentForm.nationalId}
            onChange={(e) =>
              updateForm("nationalId", e.target.value.replace(/\D/g, ""))
            }
            className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left tracking-widest"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> کد اقتصادی (اختیاری — ۱۲ رقم)
          </label>
          <input
            type="tel"
            dir="ltr"
            maxLength={12}
            inputMode="numeric"
            placeholder="123456789012"
            value={currentForm.economicCode}
            onChange={(e) =>
              updateForm("economicCode", e.target.value.replace(/\D/g, ""))
            }
            className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left tracking-widest"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            شماره ثبت شرکت (اختیاری)
          </label>
          <input
            type="text"
            dir="ltr"
            placeholder="12345"
            value={currentForm.registrationNumber}
            onChange={(e) => updateForm("registrationNumber", e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || Boolean(formError)}
          className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              ثبت اطلاعات شرکت
            </>
          )}
        </button>
      </form>
    </div>
  );
}
