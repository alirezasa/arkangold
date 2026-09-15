// admin/app/deposits/[id]/page.tsx
"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  AlertTriangle, ArrowRight, Check, Eye, FileText, Loader2, ShieldAlert, X,
} from "lucide-react";

interface Detail {
  id: string;
  requestNumber: string;
  amountRial: string;
  status: string;
  statusLabel: string;
  depositTrackingId: string;
  destination: { owner: string; bank: string; accountNumber: string; sheba: string };
  proformaInvoiceId: string | null;
  proformaInvoiceNumber: string | null;
  transactionId: string | null;
  rejectionReason: string | null;
  rejectionCount: number;
  adminNotes: string | null;
  createdAtJalali: string;
  expiresAtJalali: string;
  reviewedAtJalali: string | null;
  user: {
    id: string; phone: string; type: string; status: string;
    displayName: string; nationalCode: string | null;
    identityStatus: string | null; memberSinceJalali: string;
  };
  riskSignals: {
    previousApproved: number;
    previousRejected: number;
    duplicateReceiptDetected: boolean;
    duplicateOf: string[];
  };
  receipts: {
    id: string; fileName: string; fileSize: number; userNote: string | null;
    checksumPrefix: string; uploadedAtJalali: string;
  }[];
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);
const faNum = (v: string | number) => Number(v).toLocaleString("fa-IR");

export default function AdminDepositDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, mutate } = useSWR<Detail>(
    `/api/admin/deposits/${id}`,
    fetcher,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");
  const [typedAmount, setTypedAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const call = async (path: string, body?: unknown) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await axios.post(`/api/admin/deposits/${id}${path}`, body ?? {});
      setMode("none");
      setTypedAmount("");
      setReason("");
      await mutate();
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? (e.response?.data?.message ?? "عملیات ناموفق بود")
          : "عملیات ناموفق بود",
      );
    } finally {
      setBusy(false);
    }
  };

  const viewReceipt = async (receiptId: string) => {
    setError(null);
    try {
      const res = await axios.get<{ url: string }>(
        `/api/admin/deposits/${id}/receipts/${receiptId}/url`,
      );
      setReceiptUrl(res.data.url);
    } catch {
      setError("دریافت لینک رسید ناموفق بود");
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-24 text-gray-300" dir="rtl">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  const tomanExact = String(Math.round(Number(data.amountRial) / 10));
  const amountMatches = typedAmount.replace(/\D/g, "") === tomanExact;
  const canReview = data.status === "RECEIPT_UPLOADED";
  const canDecide = data.status === "UNDER_REVIEW";
  const risk = data.riskSignals;

  return (
    <div dir="rtl" className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center gap-3 mb-5">
        <Link
          href="/deposits"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500"
          aria-label="بازگشت"
        >
          <ArrowRight className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[18px] font-black text-gray-900">
            بررسی درخواست واریز
          </h1>
          <p className="text-[12px] text-gray-400">
            {data.requestNumber} · {data.statusLabel}
          </p>
        </div>
        {data.proformaInvoiceId && (
          <a
            href={`/invoices/${data.proformaInvoiceId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold border border-gray-200 bg-white text-gray-700"
          >
            <FileText className="w-4 h-4" />
            پیش‌فاکتور
          </a>
        )}
      </header>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-[13px] font-bold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {risk.duplicateReceiptDetected && (
        <div className="mb-4 p-4 rounded-xl bg-red-600 text-white flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-black">رسید تکراری شناسایی شد</p>
            <p className="text-[12px] mt-1 opacity-90">
              همین تصویر فیش قبلاً برای {faNum(risk.duplicateOf.length)} درخواست
              دیگر ارسال شده است. قبل از تایید حتماً با صورتحساب بانکی تطبیق دهید.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── کاربر ── */}
        <section className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <h2 className="text-[13px] font-black text-gray-700 mb-3">کاربر</h2>
            <dl className="space-y-2.5 text-[12px]">
              {[
                ["نام", data.user.displayName || "—"],
                ["موبایل", data.user.phone],
                ["کد ملی", data.user.nationalCode ?? "—"],
                ["نوع", data.user.type === "LEGAL" ? "حقوقی" : "حقیقی"],
                ["احراز هویت", data.user.identityStatus ?? "—"],
                ["عضویت از", data.user.memberSinceJalali],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-gray-400">{k}</dt>
                  <dd className="font-bold text-gray-800 text-left">
                    <bdi>{v}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <h2 className="text-[13px] font-black text-gray-700 mb-3">سابقه</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[18px] font-black text-emerald-700">
                  {faNum(risk.previousApproved)}
                </p>
                <p className="text-[10.5px] text-emerald-600 mt-0.5">تایید قبلی</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-[18px] font-black text-red-700">
                  {faNum(risk.previousRejected)}
                </p>
                <p className="text-[10.5px] text-red-600 mt-0.5">رد قبلی</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── مبلغ و اطلاعات واریز ── */}
        <section className="lg:col-span-5 space-y-4">
          <div
            className="rounded-2xl p-5 text-center text-white"
            style={{
              background: "linear-gradient(135deg, var(--color-emerald), #140103)",
            }}
          >
            <p className="text-[11px] opacity-60 mb-1">مبلغ درخواستی</p>
            <p className="text-[30px] font-black">
              {faNum(tomanExact)}
              <span className="text-[13px] opacity-60 mr-1.5">تومان</span>
            </p>
            <p className="text-[11px] opacity-50 mt-1">
              <bdi dir="ltr">{faNum(data.amountRial)}</bdi> ریال
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
            {[
              ["شناسه واریز", data.depositTrackingId, true],
              ["شماره پیش‌فاکتور", data.proformaInvoiceNumber ?? "—", false],
              ["صاحب حساب مقصد", data.destination.owner, false],
              ["شبا مقصد", data.destination.sheba, true],
              ["تاریخ ثبت", data.createdAtJalali, false],
              ["مهلت اعتبار", data.expiresAtJalali, false],
              ["تراکنش کیف پول", data.transactionId ?? "—", true],
            ].map(([k, v, ltr], i) => (
              <div
                key={k as string}
                className={`flex justify-between gap-3 px-4 py-3 text-[12px] ${i > 0 ? "border-t border-gray-50" : ""}`}
              >
                <span className="text-gray-400 shrink-0">{k}</span>
                <bdi
                  dir={ltr ? "ltr" : "rtl"}
                  className="font-bold text-gray-800 text-left break-all"
                  style={{ unicodeBidi: "isolate" }}
                >
                  {v}
                </bdi>
              </div>
            ))}
          </div>

          {data.rejectionReason && (
            <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
              <p className="text-[12px] font-black text-red-700 mb-1">
                دلیل رد قبلی (دفعه {faNum(data.rejectionCount)})
              </p>
              <p className="text-[12px] text-red-600 leading-relaxed">
                {data.rejectionReason}
              </p>
            </div>
          )}
        </section>

        {/* ── رسید و اقدام ── */}
        <section className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <h2 className="text-[13px] font-black text-gray-700 mb-3">
              رسیدهای ارسالی
            </h2>
            {!data.receipts.length ? (
              <p className="text-[12px] text-gray-400 py-6 text-center">
                هنوز رسیدی ارسال نشده است
              </p>
            ) : (
              <div className="space-y-2">
                {data.receipts.map((r) => (
                  <div key={r.id} className="rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-[11.5px] text-gray-500 flex-1">
                        {r.uploadedAtJalali}
                      </span>
                      <button
                        onClick={() => viewReceipt(r.id)}
                        className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-lg text-white"
                        style={{ backgroundColor: "var(--color-emerald)" }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        مشاهده
                      </button>
                    </div>
                    {r.userNote && (
                      <p className="text-[11.5px] text-gray-600 leading-relaxed">
                        {r.userNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {receiptUrl && (
            <div className="rounded-2xl bg-white border border-gray-100 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receiptUrl}
                alt="تصویر رسید"
                className="w-full rounded-xl"
              />
              <p className="text-[10.5px] text-gray-400 mt-2 text-center">
                این لینک پس از ۲ دقیقه منقضی می‌شود
              </p>
            </div>
          )}

          {/* ── اقدام ── */}
          <div className="rounded-2xl bg-white border border-gray-100 p-4">
            <h2 className="text-[13px] font-black text-gray-700 mb-3">اقدام</h2>

            {canReview && (
              <button
                onClick={() => call("/review")}
                disabled={busy}
                className="w-full py-3.5 rounded-xl font-black text-white text-[13px] disabled:opacity-50"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {busy ? "..." : "شروع بررسی"}
              </button>
            )}

            {canDecide && mode === "none" && (
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("reject")}
                  className="flex-1 py-3.5 rounded-xl font-black text-[13px] border border-red-200 text-red-600 bg-red-50"
                >
                  رد
                </button>
                <button
                  onClick={() => setMode("approve")}
                  className="flex-[2] py-3.5 rounded-xl font-black text-white text-[13px] bg-emerald-700"
                >
                  تایید و شارژ کیف پول
                </button>
              </div>
            )}

            {mode === "approve" && (
              <div className="space-y-3">
                <p className="text-[12px] text-gray-600 leading-relaxed">
                  برای تایید، مبلغ را دقیقاً تایپ کنید:{" "}
                  <b className="text-gray-900">{faNum(tomanExact)}</b> تومان
                </p>
                <input
                  value={typedAmount}
                  onChange={(e) => setTypedAmount(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder={tomanExact}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-emerald-600 outline-none text-center font-black"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="یادداشت داخلی (اختیاری)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-[12px]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode("none")}
                    className="flex-1 py-3 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={() => call("/approve", { note })}
                    disabled={!amountMatches || busy}
                    className="flex-[2] py-3 rounded-xl text-[13px] font-black text-white bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        تایید نهایی
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {mode === "reject" && (
              <div className="space-y-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="دلیل رد — حداقل ۱۰ کاراکتر. این متن به کاربر نمایش داده می‌شود."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-[12px] resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode("none")}
                    className="flex-1 py-3 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600"
                  >
                    انصراف
                  </button>
                  <button
                    onClick={() => call("/reject", { reason })}
                    disabled={reason.trim().length < 10 || busy}
                    className="flex-[2] py-3 rounded-xl text-[13px] font-black text-white bg-red-600 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <X className="w-4 h-4" />
                        رد درخواست
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {!canReview && !canDecide && (
              <p className="text-[12px] text-gray-400 text-center py-3">
                این درخواست در وضعیت «{data.statusLabel}» است و اقدام جدیدی ندارد.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
