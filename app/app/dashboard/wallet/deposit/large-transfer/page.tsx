"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useDepositConfig,
  useLargeTransferDeposit,
} from "@/app/hooks/useWallet";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import {
  ChevronLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Building2,
} from "lucide-react";

// ── توابع کمکی ──

const toEnglishDigits = (str: string) => {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const arabic = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str
    .replace(/[۰-۹]/g, (char) => persian.indexOf(char).toString())
    .replace(/[٠-٩]/g, (char) => arabic.indexOf(char).toString());
};

function rT(rial: number): string {
  return (rial / 10).toLocaleString("fa-IR");
}

function rTLabel(rial: number): string {
  const t = rial / 10;
  if (t >= 1_000_000_000)
    return `${(t / 1_000_000_000).toLocaleString("fa-IR")} میلیارد`;
  if (t >= 1_000_000)
    return `${(t / 1_000_000).toLocaleString("fa-IR")} میلیون`;
  return t.toLocaleString("fa-IR");
}

// استخراج عدد خالص از رشته فرمت شده
function parseTomanAmount(str: string): number {
  const sanitized = toEnglishDigits(str).replace(/\D/g, "");
  return sanitized ? Number(sanitized) : 0;
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors active:scale-95"
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

type Step = "enter-amount" | "show-proforma" | "confirmed";

export default function LargeTransferPage() {
  const { config } = useDepositConfig();
  const { data: goldPrice } = useGoldPrice();
  const { loading, error, setError, initiate } = useLargeTransferDeposit();

  const [step, setStep] = useState<Step>("enter-amount");
  const [amountToman, setAmountToman] = useState("");
  const [proformaData, setProformaData] = useState<{
    transactionId: string;
    proformaData: {
      amount: number;
      destinationAccount: string;
      destinationSheba: string;
      trackingId: string;
      recipientName: string;
      userFullName: string;
      generatedAt: string;
    };
  } | null>(null);

  const cfg = config?.largeTransfer;
  const minAmountRial = cfg?.minAmount ?? 4_000_000_000;
  const minToman = minAmountRial / 10;

  const handleSubmit = async () => {
    const amtToman = parseTomanAmount(amountToman);
    const amtRial = amtToman * 10;

    if (!amtToman || amtRial < minAmountRial) {
      return setError(
        `حداقل مبلغ برای این روش ${rTLabel(minAmountRial)} تومان است`,
      );
    }
    const result = await initiate(amtRial);
    if (result) {
      setProformaData(result);
      setStep("show-proforma");
    }
  };

  const handleDownload = () => {
    if (!proformaData) return;
    const d = proformaData.proformaData;
    const content = [
      "پیش‌فاکتور واریز - آرکان گلد",
      "================================",
      `مبلغ: ${rT(d.amount)} تومان`,
      `نام دریافت‌کننده: ${d.recipientName}`,
      `شماره حساب مقصد: ${d.destinationAccount}`,
      `شماره شبا: ${d.destinationSheba}`,
      `شناسه واریز: ${d.trackingId}`,
      `نام واریزکننده: ${d.userFullName || "—"}`,
      `تاریخ صدور: ${new Date(d.generatedAt).toLocaleDateString("fa-IR")}`,
      "================================",
      "لطفاً این پیش‌فاکتور را به بانک ارائه دهید.",
      "شناسه واریز را حتماً در قسمت شناسه پایا وارد کنید.",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proforma-${proformaData.transactionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet/deposit"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">مبالغ بالا</h1>
          <p className="text-[11px] text-gray-400">
            واریز بیش از {rTLabel(minAmountRial)} تومان | سیکل پایا
          </p>
        </div>
        {goldPrice && (
          <div
            className="mr-auto px-3 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background: "rgba(197,160,89,.1)", color: "#92400e" }}
          >
            🪙 {(goldPrice.price * 1000).toLocaleString("fa-IR")} ت
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ══ مرحله ۱: ورود مبلغ ══ */}
      {step === "enter-amount" && (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 space-y-5"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div>
              <h2 className="text-[14px] font-black text-gray-800 mb-1">
                مبلغ واریز:
              </h2>
              <p className="text-[12px] text-gray-400">
                حداقل {rTLabel(minAmountRial)} تومان
              </p>
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                dir="rtl"
                placeholder={`حداقل ${minToman.toLocaleString("fa-IR")}`}
                value={amountToman}
                onChange={(e) => {
                  const raw = toEnglishDigits(e.target.value).replace(
                    /\D/g,
                    "",
                  );
                  setAmountToman(
                    raw ? Number(raw).toLocaleString("fa-IR") : "",
                  );
                  setError(null);
                }}
                className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[18px] font-black text-gray-800 bg-gray-50 transition-all"
              />
              <span className="absolute left-4 top-1 -translate-y-1/2 text-[10px] font-bold text-gray-400">
                تومان
              </span>
            </div>
          </div>

          {/* راهنمای مراحل */}
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h3 className="text-[13px] font-black text-gray-800">
              راهنمای واریز مبالغ بالا
            </h3>
            {[
              {
                n: "۱",
                title: "تعیین مبلغ",
                desc: "مبلغ مورد نظر خود را وارد کنید.",
              },
              {
                n: "۲",
                title: "دریافت پیش‌فاکتور",
                desc: "فایل حاوی شناسه واریز و اطلاعات حساب را دریافت کنید.",
              },
              {
                n: "۳",
                title: "مراجعه به بانک",
                desc: "با فیزیک یا تصویر پیش‌فاکتور به شعبه بانک مراجعه کنید.",
              },
              {
                n: "۴",
                title: "انجام واریز",
                desc: "مبلغ را به حساب مشخص شده با شناسه واریز انتقال دهید.",
              },
            ].map((item) => (
              <div key={item.n} className="flex items-start gap-3">
                <span
                  className="w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: "var(--color-emerald)",
                    color: "white",
                  }}
                >
                  {item.n}
                </span>
                <div>
                  <p className="text-[13px] font-black text-gray-800">
                    {item.title}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={loading || !amountToman}
              className="flex-2 py-4 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
              style={{ backgroundColor: "var(--color-green)" }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4" /> دریافت پیش فاکتور
                </>
              )}
            </button>
            <button
              onClick={() => setStep("confirmed")}
              className="flex-1 py-4 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
            >
              واریز کردم
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۲: نمایش پیش‌فاکتور ══ */}
      {step === "show-proforma" && proformaData && (
        <div className="space-y-4">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid var(--color-border)" }}
          >
            <div
              className="flex items-center gap-3 px-5 py-4"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              <Building2 className="w-5 h-5 text-white opacity-80" />
              <div>
                <p className="text-[14px] font-black text-white">
                  پیش‌فاکتور واریز بانکی
                </p>
                <p className="text-[11px] text-white opacity-60">
                  تاریخ صدور:{" "}
                  {new Date(
                    proformaData.proformaData.generatedAt,
                  ).toLocaleDateString("fa-IR")}
                </p>
              </div>
            </div>

            {[
              {
                label: "مبلغ نهایی",
                value: `${rT(proformaData.proformaData.amount)} تومان`,
                highlight: true,
                copy: false,
              },
              {
                label: "دریافت‌کننده",
                value: proformaData.proformaData.recipientName,
                highlight: false,
                copy: false,
              },
              {
                label: "شماره حساب مقصد",
                value: proformaData.proformaData.destinationAccount,
                highlight: false,
                copy: true,
              },
              {
                label: "شماره شبا (IR)",
                value: proformaData.proformaData.destinationSheba,
                highlight: false,
                copy: true,
              },
              {
                label: "🔑 شناسه واریز اختصاصی",
                value: proformaData.proformaData.trackingId,
                highlight: true,
                copy: true,
              },
              {
                label: "نام واریزکننده مجاز",
                value: proformaData.proformaData.userFullName || "—",
                highlight: false,
                copy: false,
              },
            ].map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-4 border-t border-gray-100 ${row.highlight ? "bg-amber-50" : i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
              >
                <span
                  className={`text-[12px] ${row.highlight ? "text-amber-800 font-black" : "text-gray-500 font-medium"}`}
                >
                  {row.label}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-black ${row.highlight ? "text-amber-900 text-[15px]" : "text-gray-800 text-[12px]"}`}
                    dir="ltr"
                  >
                    {row.value}
                  </span>
                  {row.copy && <CopyBtn text={row.value} />}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleDownload}
            className="w-full py-4 rounded-xl font-black text-[14px] flex items-center justify-center gap-2 border-2 border-dashed transition-all hover:bg-emerald-50"
            style={{
              borderColor: "var(--color-emerald)",
              color: "var(--color-emerald)",
            }}
          >
            <Download className="w-5 h-5" /> دانلود فایل پیش‌فاکتور
          </button>

          <button
            onClick={() => setStep("confirmed")}
            className="w-full py-4 rounded-xl font-black text-white text-[14px]"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            تایید و ادامه
          </button>
        </div>
      )}

      {/* ══ مرحله ۳: تایید نهایی ══ */}
      {step === "confirmed" && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-[18px] font-black text-gray-900 mb-2">
            درخواست در انتظار واریز
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            لطفاً پس از واریز مبلغ در شعبه بانک، منتظر تایید کارشناسان و شارژ
            کیف پول خود در سیکل پایا باشید.
          </p>
          <div className="space-y-3">
            <Link
              href="/dashboard/wallet"
              className="block py-3.5 rounded-xl font-black text-white! text-[14px]"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              بازگشت به کیف پول
            </Link>
            <Link
              href="/dashboard/transactions"
              className="block py-3.5 rounded-xl font-bold text-gray-500 text-[13px] border border-gray-200"
            >
              تاریخچه تراکنش‌ها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
