// admin/app/(dashboard)/legal-profiles/page.tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Download,
  X,
} from "lucide-react";

const fetcher = (url: string) =>
  axios.get(url).then((response) => response.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;

    if (data?.message) {
      return Array.isArray(data.message) ? data.message[0] : data.message;
    }
  }

  return fallback;
}

interface LegalProfileDocument {
  id: string;
  fileName: string;
  fileSize: number;
}

interface LegalProfileItem {
  userId: string;
  companyName: string;
  nationalId: string;
  economicCode: string | null;
  registrationNumber: string | null;
  status?: string;
  rejectionReason?: string | null;
  documents?: LegalProfileDocument[];
  representative: {
    firstName: string | null;
    lastName: string | null;
    nationalCode: string | null;
    status: string;
  } | null;
  user: {
    id: string;
    phone: string;
    status: string;
  };
  createdAt: string;
}

interface LegalProfilesResponse {
  data: LegalProfileItem[];
  total: number;
  totalPages: number;
  page?: number;
  limit?: number;
}

function formatFileSize(fileSize: number): string {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return "۰ KB";
  }

  if (fileSize < 1024 * 1024) {
    return `${Math.ceil(fileSize / 1024).toLocaleString("fa-IR")} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toLocaleString("fa-IR", {
    maximumFractionDigits: 1,
  })} MB`;
}

function RejectModal({
  item,
  onClose,
  onDone,
}: {
  item: LegalProfileItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [editable, setEditable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setError("علت رد را وارد کنید");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await axios.post(`/api/admin/legal-profiles/${item.userId}/reject`, {
        reason: reason.trim(),
        editable,
      });

      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در رد درخواست"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => {
          if (!loading) onClose();
        }}
      />

      <div
        className="relative w-full max-w-sm space-y-4 rounded-2xl p-6"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-gray-900">
            رد پروفایل حقوقی
          </h2>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="بستن"
            className="rounded-lg p-1 transition-colors hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-[13px] font-bold text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <label
            className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"
            style={{
              borderColor: editable ? "var(--color-emerald)" : "#e5e7eb",
            }}
          >
            <input
              type="radio"
              name="rejectType"
              checked={editable}
              onChange={() => setEditable(true)}
              disabled={loading}
            />

            <div>
              <p className="text-[12px] font-bold text-gray-800">
                رد قابل ویرایش
              </p>
              <p className="text-[11px] text-gray-400">
                کاربر می‌تواند اطلاعات را اصلاح و مجدداً ارسال کند
              </p>
            </div>
          </label>

          <label
            className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"
            style={{
              borderColor: !editable ? "#dc2626" : "#e5e7eb",
            }}
          >
            <input
              type="radio"
              name="rejectType"
              checked={!editable}
              onChange={() => setEditable(false)}
              disabled={loading}
            />

            <div>
              <p className="text-[12px] font-bold text-gray-800">
                رد کامل (حذف اطلاعات)
              </p>
              <p className="text-[11px] text-gray-400">
                اطلاعات حقوقی حذف و حساب به حقیقی برمی‌گردد
              </p>
            </div>
          </label>
        </div>

        <textarea
          placeholder="علت رد (الزامی — برای کاربر نمایش داده می‌شود)"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);

            if (error) {
              setError(null);
            }
          }}
          disabled={loading}
          rows={3}
          className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gold-500 disabled:opacity-60"
        />

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="w-full rounded-xl py-3 font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "#dc2626" }}
        >
          {loading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          ) : (
            "ثبت رد درخواست"
          )}
        </button>
      </div>
    </div>
  );
}

export default function LegalProfilesPage() {
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<LegalProfileItem | null>(
    null,
  );
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<LegalProfilesResponse>(
    `/api/admin/legal-profiles/pending?page=${page}&limit=20`,
    fetcher,
  );

  const handleApprove = async (userId: string) => {
    setActionError(null);
    setProcessingId(userId);

    try {
      await axios.post(`/api/admin/legal-profiles/${userId}/approve`);
      await mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در تایید درخواست"));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div dir="rtl">
      <h1 className="mb-1 text-lg font-black text-gray-900">
        پروفایل‌های حقوقی
      </h1>

      <p className="mb-5 text-[12px] text-gray-400">
        {data
          ? `${data.total.toLocaleString("fa-IR")} درخواست در انتظار تایید`
          : "..."}
      </p>

      {actionError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] font-bold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data?.length ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Building2 className="h-8 w-8 text-gray-200" />
          <p className="text-[12px] text-gray-400">
            درخواستی برای بررسی وجود ندارد
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.data.map((item) => {
            const isProcessing = processingId === item.userId;

            return (
              <div
                key={item.userId}
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-[14px] font-black text-gray-900">
                      {item.companyName}
                    </h3>

                    <p className="mt-0.5 text-[11px] text-gray-400" dir="ltr">
                      {item.user.phone}
                    </p>
                  </div>

                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: "var(--color-emerald-light)",
                    }}
                  >
                    <Building2
                      className="h-4 w-4"
                      style={{ color: "var(--color-emerald)" }}
                    />
                  </div>
                </div>

                <div className="mb-3 space-y-1.5 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-gray-400">شناسه ملی</span>
                    <span dir="ltr" className="font-bold text-gray-700">
                      {item.nationalId}
                    </span>
                  </div>

                  {item.economicCode && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-400">کد اقتصادی</span>
                      <span dir="ltr" className="font-bold text-gray-700">
                        {item.economicCode}
                      </span>
                    </div>
                  )}

                  {item.registrationNumber && (
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-400">شماره ثبت</span>
                      <span dir="ltr" className="font-bold text-gray-700">
                        {item.registrationNumber}
                      </span>
                    </div>
                  )}
                </div>

                {item.representative && (
                  <div
                    className="mb-3 rounded-xl p-3"
                    style={{ backgroundColor: "var(--color-bg-page)" }}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      {item.representative.status === "VERIFIED" ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                      )}

                      <span className="text-[11px] font-bold text-gray-600">
                        نماینده شرکت
                      </span>
                    </div>

                    <p className="text-[12px] text-gray-700">
                      {[
                        item.representative.firstName,
                        item.representative.lastName,
                      ]
                        .filter(Boolean)
                        .join(" ") || "نام نماینده ثبت نشده است"}
                    </p>

                    {item.representative.nationalCode && (
                      <p className="mt-0.5 text-[11px] text-gray-400" dir="ltr">
                        {item.representative.nationalCode}
                      </p>
                    )}
                  </div>
                )}

                {item.documents && item.documents.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    <div className="mb-1 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-gray-400" />
                      <p className="text-[11px] font-bold text-gray-500">
                        مدارک بارگذاری‌شده
                      </p>
                    </div>

                    {item.documents.map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/admin/legal-profiles/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] transition-colors hover:bg-gray-100"
                        title={`دانلود ${doc.fileName}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />

                          <span className="truncate text-gray-600">
                            {doc.fileName}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1 text-gray-400">
                          <span dir="ltr">{formatFileSize(doc.fileSize)}</span>

                          <Download className="h-3.5 w-3.5 transition-colors group-hover:text-gray-600" />
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                {item.status === "REJECTED" && item.rejectionReason && (
                  <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-[11px] text-red-600">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

                    <p>
                      <span className="font-bold">علت رد قبلی:</span>{" "}
                      {item.rejectionReason}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 border-t border-gray-50 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setRejectTarget(item);
                    }}
                    disabled={isProcessing}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-red-100 py-2.5 text-[12px] font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    رد
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApprove(item.userId)}
                    disabled={isProcessing}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-white transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: "var(--color-emerald)" }}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        تایید
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPage((currentPage) => Math.max(1, currentPage - 1))
            }
            disabled={page <= 1}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>

          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {data.totalPages.toLocaleString("fa-IR")}
          </span>

          <button
            type="button"
            onClick={() =>
              setPage((currentPage) =>
                Math.min(data.totalPages, currentPage + 1),
              )
            }
            disabled={page >= data.totalPages}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}

      {rejectTarget && (
        <RejectModal
          item={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}
