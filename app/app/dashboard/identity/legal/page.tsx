// app/app/dashboard/identity/legal/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
  XCircle,
  Upload,
  Trash2,
  File as FileIcon,
  CheckCircle2,
} from "lucide-react";
import {
  useProfilePage,
  useLegalProfileForm,
} from "@/app/hooks/useProfilePage";
import {
  useLegalDocuments,
  useUploadLegalDocument,
  useRemoveLegalDocument,
  DOC_TYPES,
} from "@/app/hooks/useLegalDocuments";

type LegalForm = {
  companyName: string;
  nationalId: string;
  economicCode: string;
  registrationNumber: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function DocumentsUploader() {
  const { documents, loading: docsLoading, refetch } = useLegalDocuments();
  const {
    upload,
    loading: uploading,
    error: uploadError,
    setError,
  } = useUploadLegalDocument();
  const { remove, loading: removing } = useRemoveLegalDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<string | null>(null);

  const handleFileSelect = (type: string) => {
    setPendingType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingType) return;
    const result = await upload(file, pendingType);
    if (result) refetch();
  };

  const handleRemove = async (id: string) => {
    if (!confirm("آیا از حذف این مدرک مطمئنید؟")) return;
    const ok = await remove(id);
    if (ok) refetch();
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {uploadError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {uploadError}
          <button onClick={() => setError(null)} className="mr-auto">
            ✕
          </button>
        </div>
      )}

      {DOC_TYPES.map((docType) => {
        const uploaded = documents.filter((d) => d.type === docType.key);
        return (
          <div
            key={docType.key}
            className="rounded-xl p-3 border border-gray-100 bg-gray-50/50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-gray-700 flex items-center gap-1.5">
                {docType.label}
                {docType.required && <span className="text-red-500">*</span>}
              </span>
              <button
                type="button"
                onClick={() => handleFileSelect(docType.key)}
                disabled={uploading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {uploading && pendingType === docType.key ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                آپلود
              </button>
            </div>

            {docsLoading ? (
              <p className="text-[11px] text-gray-400">در حال بارگذاری...</p>
            ) : uploaded.length === 0 ? (
              <p className="text-[11px] text-gray-400">هنوز فایلی آپلود نشده</p>
            ) : (
              <div className="space-y-1.5">
                {uploaded.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-2 border border-gray-100"
                  >
                    <FileIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-[11px] text-gray-600 flex-1 truncate">
                      {doc.fileName}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {formatFileSize(doc.fileSize)}
                    </span>
                    <button
                      onClick={() => handleRemove(doc.id)}
                      disabled={removing}
                      className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] text-gray-400 leading-relaxed">
        فرمت‌های مجاز: PDF، JPG، PNG — حداکثر ۱۰ مگابایت برای هر فایل
      </p>
    </div>
  );
}

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

  const legalStatus = data?.legalProfile?.status; // "PENDING" | "VERIFIED" | "REJECTED" | undefined
  const isRejected = legalStatus === "REJECTED";
  const isPending =
    legalStatus === "PENDING" &&
    Boolean(data?.legalProfile?.companyName?.trim());
  const showForm = !data?.legalProfile?.companyName?.trim() || isRejected; // فرم برای ثبت اولیه یا اصلاح بعد از رد

  const updateForm = (field: keyof LegalForm, value: string) => {
    setForm((prev) => ({ ...(prev ?? initialForm), [field]: value }));
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

  // ── حالت: در انتظار بررسی ادمین (نه رد شده) ──
  if (isPending && !success) {
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
            اطلاعات شرکت شما ثبت شد و در حال بررسی است. پس از تایید، حساب کاربری
            شما فعال خواهد شد.
          </p>
          <div
            className="rounded-xl p-4 text-right space-y-2 mb-6"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <div className="flex justify-between text-[12px] gap-4">
              <span className="text-gray-400">نام شرکت</span>
              <span className="font-bold text-gray-700 text-left">
                {data.legalProfile?.companyName}
              </span>
            </div>
            <div className="flex justify-between text-[12px] gap-4">
              <span className="text-gray-400">شناسه ملی</span>
              <span className="font-bold text-gray-700" dir="ltr">
                {data.legalProfile?.nationalId}
              </span>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <RefreshCw className="w-4 h-4" /> بررسی مجدد وضعیت
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
            {isRejected ? "اصلاح اطلاعات حقوقی" : "تکمیل اطلاعات حقوقی"}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            برای فعال‌سازی حساب شرکت، این اطلاعات و مدارک را کامل کنید
          </p>
        </div>
      </div>

      {isRejected && data.legalProfile?.rejectionReason && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl mb-6"
          style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}
        >
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-black text-red-700 mb-1">
              علت رد درخواست توسط ادمین:
            </p>
            <p className="text-[13px] text-red-600 leading-relaxed">
              {data.legalProfile.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {!isRejected && (
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
            پس از ثبت، اطلاعات و مدارک توسط کارشناسان بررسی و حساب کاربری شما
            فعال می‌شود.
          </p>
        </div>
      )}

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

        <div className="pt-2 border-t border-gray-100">
          <p className="text-[12px] font-bold text-gray-500 mb-3">
            مدارک هویتی شرکت و نماینده
          </p>
          <DocumentsUploader />
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
              {isRejected ? "ارسال مجدد اطلاعات" : "ثبت اطلاعات شرکت"}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
