// app/app/dashboard/wallet/deposit/large-transfer/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CheckCircle2, ChevronLeft, Copy, FileText, Loader2, Upload,
} from "lucide-react";
import { useDepositConfig } from "@/app/hooks/useWallet";
import { useCreateDeposit, type DepositDetail } from "@/app/hooks/useDeposits";
import { openInvoicePrint } from "@/app/hooks/useInvoices";
import ReceiptUploadModal from "@/app/dashboard/components/deposit/ReceiptUploadModal";

function toEnglishDigits(s: string) {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function faNum(v: string | number) {
  return Number(v).toLocaleString("fa-IR");
}

export default function LargeTransferPage() {
  const router = useRouter();
  const { config } = useDepositConfig();
  const { create, loading, error, setError } = useCreateDeposit();

  const [amountToman, setAmountToman] = useState("");
  const [deposit, setDeposit] = useState<DepositDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const minRial = config?.largeTransfer?.minAmount ?? 4_000_000_000;
  const minToman = minRial / 10;

  const submit = async () => {
    const toman = Number(toEnglishDigits(amountToman).replace(/\D/g, ""));
    if (!toman || toman * 10 < minRial) {
      return setError(`حداقل مبلغ این روش ${faNum(minToman)} تومان است`);
    }
    const result = await create(toman * 10);
    if (result) setDeposit(result);
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  };

  // ── مرحله ۱: مبلغ ──
  if (!deposit) {
    return (
      <div className="max-w-lg mx-auto pb-24" dir="rtl">
        <header className="flex items-center gap-3 mb-5">
          <Link
            href="/dashboard/wallet/deposit"
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            aria-label="بازگشت"
          >
            <ChevronLeft className="w-5 h-5 rotate-180" />
          </Link>
          <div>
            <h1 className="text-[17px] font-black text-gray-900">واریز مبالغ بالا</h1>
            <p className="text-[11px] text-gray-400">
              بیش از {faNum(minToman)} تومان — با پیش‌فاکتور رسمی
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="rounded-2xl p-5 space-y-5 bg-white border border-gray-100">
          <div>
            <h2 className="text-[14px] font-black text-gray-800 mb-1">مبلغ واریز</h2>
            <p className="text-[12px] text-gray-400">
              حداقل {faNum(minToman)} تومان
            </p>
          </div>

          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              aria-label="مبلغ واریز به تومان"
              placeholder={faNum(minToman)}
              value={amountToman}
              onChange={(e) => {
                const raw = toEnglishDigits(e.target.value).replace(/\D/g, "");
                setAmountToman(raw ? Number(raw).toLocaleString("fa-IR") : "");
                if (error) setError(null);
              }}
              className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-gold-500 outline-none text-center text-[19px] font-black text-gray-800 bg-gray-50"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">
              تومان
            </span>
          </div>

          <ol className="space-y-3 text-[12px] text-gray-600">
            {[
              "مبلغ مورد نظر را وارد کنید.",
              "پیش‌فاکتور رسمی با شناسه واریز اختصاصی صادر می‌شود.",
              "پیش‌فاکتور را چاپ کنید و به شعبه بانک ببرید.",
              "شناسه واریز را در فیلد «شناسه پایا» درج کنید.",
              "تصویر فیش را از همین صفحه ارسال کنید.",
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 text-white"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  {faNum(i + 1)}
                </span>
                <span className="leading-relaxed pt-0.5">{t}</span>
              </li>
            ))}
          </ol>

          <button
            onClick={submit}
            disabled={loading || !amountToman}
            className="w-full py-4 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "صدور پیش‌فاکتور"
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── مرحله ۲: پیش‌فاکتور صادر شد ──
  const rows: { label: string; value: string; copyable?: boolean; strong?: boolean }[] = [
    { label: "مبلغ", value: `${faNum(Number(deposit.amountRial) / 10)} تومان`, strong: true },
    { label: "شماره پیش‌فاکتور", value: deposit.proformaInvoiceNumber ?? "—" },
    { label: "نام صاحب حساب", value: deposit.destination.owner },
    { label: "شماره شبا", value: deposit.destination.sheba, copyable: true },
    { label: "شناسه واریز اختصاصی", value: deposit.depositTrackingId, copyable: true, strong: true },
    { label: "مهلت اعتبار", value: deposit.expiresAtJalali },
  ];

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <header className="flex items-center gap-3 mb-5">
        <CheckCircle2 className="w-9 h-9 text-green-600" />
        <div>
          <h1 className="text-[17px] font-black text-gray-900">پیش‌فاکتور صادر شد</h1>
          <p className="text-[11px] text-gray-400">
            درخواست {deposit.requestNumber}
          </p>
        </div>
      </header>

      <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`flex items-center justify-between gap-3 px-4 py-3.5 ${
              i > 0 ? "border-t border-gray-100" : ""
            } ${r.strong ? "bg-amber-50/60" : ""}`}
          >
            <span className="text-[12px] text-gray-500 shrink-0">{r.label}</span>
            <span
              className={`text-left ${r.strong ? "text-[14px] font-black" : "text-[13px] font-bold"} text-gray-800`}
              dir={r.copyable ? "ltr" : "rtl"}
              style={{ unicodeBidi: "isolate" }}
            >
              {r.value}
            </span>
            {r.copyable && (
              <button
                onClick={() => copy(r.label, r.value)}
                aria-label={`کپی ${r.label}`}
                className="text-gray-400 hover:text-gray-700 shrink-0"
              >
                {copied === r.label ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
        واریز باید از حسابی به نام خودتان انجام شود. شناسه واریز را حتماً در فیلد
        «شناسه پایا» درج کنید، وگرنه شارژ کیف پول با تاخیر انجام می‌شود.
      </p>

      <div className="mt-4 space-y-3">
        <button
          onClick={() =>
            deposit.proformaInvoiceId && openInvoicePrint(deposit.proformaInvoiceId)
          }
          className="w-full py-3.5 rounded-xl font-black text-[14px] flex items-center justify-center gap-2 border-2"
          style={{ borderColor: "var(--color-emerald)", color: "var(--color-emerald)" }}
        >
          <FileText className="w-4 h-4" />
          مشاهده و چاپ پیش‌فاکتور
        </button>

        <button
          onClick={() => setReceiptOpen(true)}
          className="w-full py-4 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Upload className="w-4 h-4" />
          ارسال فیش واریزی
        </button>

        <button
          onClick={() => router.push(`/dashboard/wallet/deposits/${deposit.id}`)}
          className="w-full py-3.5 rounded-xl font-bold text-[13px] border border-gray-200 text-gray-600"
        >
          پیگیری وضعیت درخواست
        </button>
      </div>

      <ReceiptUploadModal
        open={receiptOpen}
        depositId={deposit.id}
        onClose={() => setReceiptOpen(false)}
        onUploaded={() => router.push(`/dashboard/wallet/deposits/${deposit.id}`)}
      />
    </div>
  );
}
