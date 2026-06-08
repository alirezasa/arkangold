"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  Building2,
  Phone,
  Hash,
  Calendar,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  useProfilePage,
  useLegalProfileForm,
} from "@/app/hooks/useProfilePage";

// ─── کامپوننت نمایش یک فیلد اطلاعاتی ───
function InfoField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  icon: React.ElementType;
}) {
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-2xl"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "var(--color-emerald-light)" }}
      >
        <Icon className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-gray-400 mb-0.5">{label}</p>
        <p className="text-[14px] font-bold text-gray-800">{value || "—"}</p>
      </div>
    </div>
  );
}

// ─── بج وضعیت احراز هویت ───
function IdentityStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  if (status === "VERIFIED") {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[12px] font-bold">
        <ShieldCheck className="w-4 h-4" /> احراز شده
      </span>
    );
  }
  if (status === "PENDING" || status === "MANUAL_REVIEW") {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[12px] font-bold">
        <Clock className="w-4 h-4 animate-pulse" /> در حال بررسی
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[12px] font-bold">
      <ShieldAlert className="w-4 h-4" /> احراز نشده
    </span>
  );
}

// ─── فرم اطلاعات شرکت (فقط برای LEGAL) ───
function LegalProfileForm({
  existing,
  onSuccess,
}: {
  existing: {
    companyName?: string;
    nationalId?: string;
    economicCode?: string | null;
    registrationNumber?: string | null;
  } | null;
  onSuccess: () => void;
}) {
  const { loading, error, success, submit } = useLegalProfileForm();
  const [form, setForm] = useState({
    companyName: existing?.companyName || "",
    nationalId: existing?.nationalId || "",
    economicCode: existing?.economicCode || "",
    registrationNumber: existing?.registrationNumber || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await submit({
      companyName: form.companyName,
      nationalId: form.nationalId,
      economicCode: form.economicCode || undefined,
      registrationNumber: form.registrationNumber || undefined,
    });
    if (ok) onSuccess();
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <CheckCircle2 className="w-14 h-14 text-green-500" />
        <h3 className="text-[16px] font-black text-gray-800">اطلاعات ثبت شد</h3>
        <p className="text-[13px] text-gray-500">
          اطلاعات شرکت شما ثبت شد و در انتظار تایید کارشناسان ماست.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm font-bold text-red-600 bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* نام شرکت */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          نام شرکت / موسسه
        </label>
        <input
          type="text"
          required
          placeholder="شرکت نمونه (سهامی خاص)"
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all"
        />
      </div>

      {/* شناسه ملی */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          شناسه ملی شرکت (۱۱ رقم)
        </label>
        <input
          type="tel"
          dir="ltr"
          required
          maxLength={11}
          placeholder="10320000000"
          value={form.nationalId}
          onChange={(e) =>
            setForm({ ...form, nationalId: e.target.value.replace(/\D/g, "") })
          }
          className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left tracking-widest"
        />
      </div>

      {/* کد اقتصادی */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          کد اقتصادی (اختیاری — ۱۲ رقم)
        </label>
        <input
          type="tel"
          dir="ltr"
          maxLength={12}
          placeholder="123456789012"
          value={form.economicCode}
          onChange={(e) =>
            setForm({
              ...form,
              economicCode: e.target.value.replace(/\D/g, ""),
            })
          }
          className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left tracking-widest"
        />
      </div>

      {/* شماره ثبت */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          شماره ثبت شرکت (اختیاری)
        </label>
        <input
          type="text"
          dir="ltr"
          placeholder="12345"
          value={form.registrationNumber}
          onChange={(e) =>
            setForm({ ...form, registrationNumber: e.target.value })
          }
          className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Building2 className="w-5 h-5" />
            ثبت اطلاعات شرکت
          </>
        )}
      </button>
    </form>
  );
}

// ─── صفحه اصلی پروفایل ───
export default function ProfilePage() {
  const router = useRouter();
  const { data, loading, refetch } = useProfilePage();
  // اگر لود شد و احراز هویت نشده → ریدایرکت
  useEffect(() => {
    if (!loading && data) {
      const identityNotVerified =
        !data.identity || data.identity.status !== "VERIFIED";

      if (identityNotVerified) {
        router.replace("/dashboard/identity");
      }
    }
  }, [loading, data, router]);

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

  const isVerified = data.identity?.status === "VERIFIED";
  if (!isVerified) return null; // در حال ریدایرکت

  // فرمت تاریخ میلادی به فارسی خوانا
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
      {/* ── هدر ── */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "var(--color-emerald-light)" }}
        >
          <User className="w-5 h-5" style={{ color: "var(--color-emerald)" }} />
        </div>
        <div>
          <h1 className="text-[18px] font-black text-gray-900">
            پروفایل کاربری
          </h1>
          <p className="text-[12px] text-gray-400">
            {data.type === "LEGAL" ? "حساب حقوقی" : "حساب حقیقی"}
          </p>
        </div>
      </div>

      {/* ── بخش اطلاعات هویتی (مشترک بین REAL و LEGAL) ── */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-black text-gray-800">
            {data.type === "LEGAL" ? "اطلاعات نماینده" : "اطلاعات هویتی"}
          </h2>
          <IdentityStatusBadge status={data.identity?.status} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoField label="نام" value={data.identity?.firstName} icon={User} />
          <InfoField
            label="نام خانوادگی"
            value={data.identity?.lastName}
            icon={User}
          />
          <InfoField
            label="کد ملی"
            value={data.identity?.nationalCode}
            icon={Hash}
          />
          <InfoField
            label="تاریخ تولد"
            value={formatDate(data.identity?.birthDate ?? null)}
            icon={Calendar}
          />
          <InfoField label="شماره موبایل" value={data.phone} icon={Phone} />
        </div>
      </div>

      {/* ── بخش حقوقی (فقط برای LEGAL) ── */}
      {data.type === "LEGAL" && (
        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Building2
                className="w-5 h-5"
                style={{ color: "var(--color-emerald)" }}
              />
              <h2 className="text-[14px] font-black text-gray-800">
                اطلاعات شرکت / موسسه
              </h2>
            </div>

            {/* وضعیت تایید شرکت */}
            {data.legalProfile?.verified ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[12px] font-bold">
                <CheckCircle2 className="w-4 h-4" /> تایید شده
              </span>
            ) : data.legalProfile ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[12px] font-bold">
                <Clock className="w-4 h-4 animate-pulse" /> در انتظار تایید
              </span>
            ) : null}
          </div>

          {/* اگر لگال پروفایل تایید شده → نمایش اطلاعات */}
          {data.legalProfile?.verified ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoField
                label="نام شرکت"
                value={data.legalProfile.companyName}
                icon={Building2}
              />
              <InfoField
                label="شناسه ملی"
                value={data.legalProfile.nationalId}
                icon={Hash}
              />
              {data.legalProfile.economicCode && (
                <InfoField
                  label="کد اقتصادی"
                  value={data.legalProfile.economicCode}
                  icon={FileText}
                />
              )}
              {data.legalProfile.registrationNumber && (
                <InfoField
                  label="شماره ثبت"
                  value={data.legalProfile.registrationNumber}
                  icon={FileText}
                />
              )}
            </div>
          ) : data.legalProfile && !data.legalProfile.verified ? (
            /* اگر ثبت شده ولی تایید نشده → پیام انتظار + نمایش اطلاعات فعلی */
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[13px] font-medium">
                <Clock className="w-4 h-4 mt-0.5 shrink-0 animate-pulse" />
                <p>
                  اطلاعات شرکت شما ثبت شده و در انتظار بررسی توسط کارشناسان
                  ماست. این فرآیند معمولاً ۱ تا ۳ روز کاری طول می‌کشد.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-70">
                <InfoField
                  label="نام شرکت"
                  value={data.legalProfile.companyName}
                  icon={Building2}
                />
                <InfoField
                  label="شناسه ملی"
                  value={data.legalProfile.nationalId}
                  icon={Hash}
                />
                {data.legalProfile.economicCode && (
                  <InfoField
                    label="کد اقتصادی"
                    value={data.legalProfile.economicCode}
                    icon={FileText}
                  />
                )}
              </div>
            </div>
          ) : (
            /* اگر هنوز لگال پروفایل ندارد → فرم */
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-[13px] font-medium">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  برای فعال‌سازی کامل حساب حقوقی، اطلاعات شرکت یا موسسه خود را
                  تکمیل کنید.
                </p>
              </div>
              <LegalProfileForm
                existing={null}
                onSuccess={refetch} // ← به جای () => setRefreshKey(k => k + 1)
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
