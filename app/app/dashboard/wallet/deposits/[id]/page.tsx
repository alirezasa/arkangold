// app/app/dashboard/wallet/deposits/[id]/page.tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Check, ChevronLeft, Copy, FileText, Loader2, Upload, X,
} from "lucide-react";
import {
  useCancelDeposit, useDeposit, type DepositStatus,
} from "@/app/hooks/useDeposits";
import { openInvoicePrint } from "@/app/hooks/useInvoices";
import ReceiptUploadModal from "@/app/dashboard/components/deposit/ReceiptUploadModal";

function faNum(v: string | number) {
  return Number(v).toLocaleString("fa-IR");
}

/** مسیر پیش‌رفت — وضعیت‌های پایانی غیرموفق خارج از این خط نمایش داده می‌شوند. */
const TIMELINE: { key: DepositStatus; title: string; hint: string }[] = [
  {
    key: "PENDING_PAYMENT",
    title: "پیش‌فاکتور صادر شد",
    hint: "با پیش‌فاکتور به بانک مراجعه کنید",
  },
  {
    key: "RECEIPT_UPLOADED",
    title: "فیش ارسال شد",
    hint: "رسید شما دریافت شد",
  },
  {
    key: "UNDER_REVIEW",
    title: "در حال بررسی",
    hint: "کارشناسان در حال تطبیق واریز هستند",
  },
  {
    key: "APPROVED",
    title: "کیف پول شارژ شد",
    hint: "مبلغ به موجودی تومانی افزوده شد",
  },
];

export default function DepositDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { deposit, loading, refresh } = useDeposit(id);
  const { cancel, loading: cancelling } = useCancelDeposit();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-gray-300" dir="rtl">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  if (!deposit) {
    return (
      <div className="max-w-md mx-auto text-center py-20" dir="rtl">
        <p className="text-[14px] font-bold text-gray-600 mb-4">
          این درخواست واریز در دسترس نیست
        </p>
        <Link
          href="/dashboard/wallet/deposits"
          className="px-5 py-2.5 rounded-xl text-[13px] font-black text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          بازگشت به فهرست
        </Link>
      </div>
    );
  }

  const isFailed = ["REJECTED", "CANCELLED", "EXPIRED"].includes(deposit.status);
  const activeIndex = TIMELINE.findIndex((t) => t.key === deposit.status);

  const details: { label: string; value: string; copyable?: boolean }[] = [
    { label: "شماره درخواست", value: deposit.requestNumber },
    {
      label: "شماره پیش‌فاکتور",
      value: deposit.proformaInvoiceNumber ?? "—",
    },
    {
      label: "شناسه واریز",
      value: deposit.depositTrackingId,
      copyable: true,
    },
    { label: "نام صاحب حساب", value: deposit.destination.owner },
    { label: "شماره شبا", value: deposit.destination.sheba, copyable: true },
    { label: "تاریخ ثبت", value: deposit.createdAtJalali },
    { label: "مهلت اعتبار", value: deposit.expiresAtJalali },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 pb-24" dir="rtl">
      <header className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet/deposits"
          aria-label="بازگشت"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">جزئیات واریز</h1>
          <p className="text-[11px] text-gray-400">{deposit.requestNumber}</p>
        </div>
      </header>

      <div
        className="rounded-3xl p-5 mb-4 text-center"
        style={{
          background: "linear-gradient(135deg, var(--color-emerald), #140103)",
        }}
      >
        <p className="text-[11px] text-gold-600 mb-1.5">مبلغ درخواستی</p>
        <p className="text-[26px] font-black text-white">
          {faNum(Number(deposit.amountRial) / 10)}
          <span className="text-[12px] font-bold text-white/60 mr-1.5">تومان</span>
        </p>
        <p className="text-[11px] text-white/50 mt-1">
          <bdi dir="ltr">{faNum(deposit.amountRial)}</bdi> ریال
        </p>
      </div>

      {isFailed ? (
        <div className="rounded-2xl p-4 mb-4 bg-red-50 border border-red-100">
          <div className="flex items-start gap-2.5 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-black">{deposit.statusLabel}</p>
              {deposit.rejectionReason && (
                <p className="text-[12px] mt-1 leading-relaxed">
                  {deposit.rejectionReason}
                </p>
              )}
              {deposit.status === "REJECTED" && deposit.canUploadReceipt && (
                <p className="text-[11px] mt-2 text-red-600">
                  می‌توانید رسید صحیح را دوباره ارسال کنید.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <ol className="rounded-2xl bg-white border border-gray-100 p-5 mb-4 space-y-0">
          {TIMELINE.map((step, i) => {
            const done = activeIndex > i;
            const current = activeIndex === i;
            return (
              <li key={step.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 ${
                      done || current
                        ? "text-white border-transparent"
                        : "bg-white border-gray-200 text-gray-300"
                    }`}
                    style={
                      done || current
                        ? { backgroundColor: "var(--color-emerald)" }
                        : {}
                    }
                  >
                    {done ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <span className="text-[11px] font-black">
                        {faNum(i + 1)}
                      </span>
                    )}
                  </span>
                  {i < TIMELINE.length - 1 && (
                    <span
                      className={`w-0.5 flex-1 min-h-8 ${done ? "bg-gray-300" : "bg-gray-100"}`}
                    />
                  )}
                </div>
                <div className="pb-6">
                  <p
                    className={`text-[13px] font-black ${current ? "text-gray-900" : done ? "text-gray-700" : "text-gray-400"}`}
                  >
                    {step.title}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                    {step.hint}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white mb-4">
        {details.map((d, i) => (
          <div
            key={d.label}
            className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-50" : ""}`}
          >
            <span className="text-[12px] text-gray-500 shrink-0">{d.label}</span>
            <bdi
              dir={d.copyable ? "ltr" : "rtl"}
              className="text-[12.5px] font-bold text-gray-800 text-left"
              style={{ unicodeBidi: "isolate" }}
            >
              {d.value}
            </bdi>
            {d.copyable && (
              <button
                onClick={() => copy(d.label, d.value)}
                aria-label={`کپی ${d.label}`}
                className="text-gray-400 hover:text-gray-700 shrink-0"
              >
                {copied === d.label ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {deposit.receipts.length > 0 && (
        <div className="rounded-2xl bg-white border border-gray-100 p-4 mb-4">
          <h2 className="text-[13px] font-black text-gray-700 mb-3">
            رسیدهای ارسال‌شده
          </h2>
          <div className="space-y-2">
            {deposit.receipts.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5"
              >
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-gray-700 truncate">
                    {r.userNote || r.fileName}
                  </p>
                  <p className="text-[10.5px] text-gray-400">
                    {r.uploadedAtJalali}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {deposit.proformaInvoiceId && (
          <button
            onClick={() => openInvoicePrint(deposit.proformaInvoiceId!)}
            className="w-full py-3.5 rounded-xl font-black text-[14px] flex items-center justify-center gap-2 border-2"
            style={{
              borderColor: "var(--color-emerald)",
              color: "var(--color-emerald)",
            }}
          >
            <FileText className="w-4 h-4" />
            مشاهده و چاپ پیش‌فاکتور
          </button>
        )}

        {deposit.canUploadReceipt && (
          <button
            onClick={() => setReceiptOpen(true)}
            className="w-full py-4 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Upload className="w-4 h-4" />
            {deposit.receipts.length ? "ارسال فیش جدید" : "ارسال فیش واریزی"}
          </button>
        )}

        {deposit.canCancel &&
          (confirmCancel ? (
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <p className="text-[12px] font-bold text-red-700 mb-3">
                این درخواست لغو شود؟ پیش‌فاکتور هم باطل می‌شود.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 py-2.5 rounded-lg text-[12px] font-bold bg-white border border-gray-200 text-gray-600"
                >
                  انصراف
                </button>
                <button
                  onClick={async () => {
                    const ok = await cancel(deposit.id);
                    if (ok) refresh();
                    else router.refresh();
                    setConfirmCancel(false);
                  }}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-lg text-[12px] font-black text-white bg-red-600 disabled:opacity-50"
                >
                  {cancelling ? "..." : "لغو درخواست"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full py-3 rounded-xl font-bold text-[13px] text-gray-500 flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" />
              لغو درخواست
            </button>
          ))}
      </div>

      <ReceiptUploadModal
        open={receiptOpen}
        depositId={deposit.id}
        onClose={() => setReceiptOpen(false)}
        onUploaded={refresh}
      />
    </div>
  );
}
