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

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

function toToman(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}

type Step = "enter-amount" | "show-proforma" | "confirmed";

export default function LargeTransferPage() {
  const { config } = useDepositConfig();
  const { data: goldPrice } = useGoldPrice();
  const { loading, error, setError, initiate } = useLargeTransferDeposit();

  const [step, setStep] = useState<Step>("enter-amount");

  // تغییر: مقدار کاملاً خام و انگلیسی در استیت ذخیره می‌شود
  const [amount, setAmount] = useState("");
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
  const minAmount = cfg?.minAmount ?? 4_000_000_000;

  const handleSubmit = async () => {
    // تغییر: استفاده مستقیم از مقدار خام استیت و تبدیل به ریال
    const amountRial = Number(amount) * 10;
    if (!amountRial || amountRial < minAmount) {
      return setError(
        `حداقل مبلغ برای این روش ${toToman(minAmount)} تومان است`,
      );
    }
    const result = await initiate(amountRial);
    if (result) {
      setProformaData(result);
      setStep("show-proforma");
    }
  };

  // شبیه‌سازی دانلود پیش‌فاکتور
  const handleDownloadProforma = () => {
    if (!proformaData) return;
    const d = proformaData.proformaData;
    const content = `
پیش‌فاکتور واریز - آرکان گلد
================================
مبلغ: ${toToman(d.amount)} تومان
نام دریافت‌کننده: ${d.recipientName}
شماره حساب مقصد: ${d.destinationAccount}
شماره شبا: ${d.destinationSheba}
شناسه واریز: ${d.trackingId}
نام واریزکننده: ${d.userFullName}
تاریخ صدور: ${new Date(d.generatedAt).toLocaleDateString("fa-IR")}
================================
لطفاً این پیش‌فاکتور را به بانک ارائه دهید.
    `.trim();
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
            واریز مبالغ بیش از {toToman(minAmount)} تومان | سیکل پایا
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
                مبلغ واریز :
              </h2>
              <p className="text-[12px] text-gray-400">
                حداقل {toToman(minAmount)} تومان
              </p>
            </div>

            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="مبلغ موردنظر خود را وارد کنید"
                // فرمت‌دهی به صورت خودکار فقط برای نمایش
                value={amount ? Number(amount).toLocaleString("fa-IR") : ""}
                onChange={(e) => {
                  let val = e.target.value;

                  // رفع مشکل کیبورد فارسی و عربی
                  const persianNumbers = [
                    /۰/g,
                    /۱/g,
                    /۲/g,
                    /۳/g,
                    /۴/g,
                    /۵/g,
                    /۶/g,
                    /۷/g,
                    /۸/g,
                    /۹/g,
                  ];
                  const arabicNumbers = [
                    /٠/g,
                    /١/g,
                    /٢/g,
                    /٣/g,
                    /٤/g,
                    /٥/g,
                    /٦/g,
                    /٧/g,
                    /٨/g,
                    /٩/g,
                  ];
                  for (let i = 0; i < 10; i++) {
                    val = val
                      .replace(persianNumbers[i], i.toString())
                      .replace(arabicNumbers[i], i.toString());
                  }

                  const raw = val.replace(/[^0-9]/g, "");
                  setAmount(raw);
                  setError(null);
                }}
                // تغییر استایل: pr-4 و pl-14 برای رفع مشکل تداخل و text-right برای راست‌چین شدن اعداد
                className="w-full py-4 pr-4 pl-14 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-right text-[18px] font-black text-gray-800 bg-gray-50 transition-all"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">
                تومان
              </span>
            </div>
          </div>

          {/* راهنمای مبالغ بالا */}
          <div
            className="rounded-xl p-4 space-y-3"
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
                title: "تعیین مبلغ واریز",
                desc: "ابتدا مبلغی که می‌خواهید به کیف پولتان واریز نمایید را وارد نمایید.",
              },
              {
                n: "۲",
                title: "دریافت پیش‌فاکتور",
                desc: "فایل پیش‌فاکتور حاوی شناسه واریز و اطلاعات حساب واریز را دانلود کنید.",
              },
              {
                n: "۳",
                title: "مراجعه به بانک",
                desc: "با همراه داشتن پیش‌فاکتور، به بانک بروید و مبلغ را به حساب ملی‌گلد واریز کنید.",
              },
              {
                n: "۴",
                title: "بارگذاری رسید بانکی",
                desc: "پس از واریز، تصویر رسید بانکی را بارگذاری کنید تا تراکنش‌تان تأیید شود.",
              },
              {
                n: "۵",
                title: "شارژ کیف پول",
                desc: "پس از تأیید تراکنش‌تان، در سیکل پایا، موجودی کیف پول شما به صورت خودکار شارژ می‌شود.",
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
              disabled={loading || !amount}
              className="flex-1 py-4 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "دریافت پیش فاکتور"
              )}
            </button>
            <button
              onClick={() => setStep("confirmed")}
              className="flex-1 py-4 rounded-xl font-bold text-[13px] border border-gray-200 text-gray-600 hover:bg-gray-50"
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
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Building2
                  className="w-5 h-5"
                  style={{ color: "var(--color-emerald)" }}
                />
              </div>
              <div>
                <h2 className="text-[14px] font-black text-gray-800">
                  پیش‌فاکتور واریز
                </h2>
                <p className="text-[11px] text-gray-400">
                  {new Date(
                    proformaData.proformaData.generatedAt,
                  ).toLocaleDateString("fa-IR")}
                </p>
              </div>
            </div>

            {/* اطلاعات پیش‌فاکتور */}
            <div className="space-y-2">
              {[
                {
                  label: "مبلغ",
                  value: `${toToman(proformaData.proformaData.amount)} تومان`,
                  highlight: true,
                },
                {
                  label: "نام دریافت‌کننده",
                  value: proformaData.proformaData.recipientName,
                  copy: false,
                },
                {
                  label: "شماره حساب مقصد",
                  value: proformaData.proformaData.destinationAccount,
                  copy: true,
                },
                {
                  label: "شماره شبا",
                  value: proformaData.proformaData.destinationSheba,
                  copy: true,
                },
                {
                  label: "🔑 شناسه واریز",
                  value: proformaData.proformaData.trackingId,
                  copy: true,
                  highlight: true,
                },
                {
                  label: "نام واریزکننده",
                  value: proformaData.proformaData.userFullName || "—",
                  copy: false,
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl ${row.highlight ? "bg-amber-50 border border-amber-100" : "bg-gray-50"}`}
                >
                  <span
                    className={`text-[12px] font-medium ${row.highlight ? "text-amber-800 font-black" : "text-gray-500"}`}
                  >
                    {row.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[12px] font-black ${row.highlight ? "text-amber-900" : "text-gray-800"}`}
                      dir="ltr"
                    >
                      {row.value}
                    </span>
                    {(row as { copy?: boolean }).copy && (
                      <CopyBtn text={row.value} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* دکمه دانلود */}
          <button
            onClick={handleDownloadProforma}
            className="w-full py-4 rounded-xl font-black text-[14px] flex items-center justify-center gap-2 border-2 border-dashed"
            style={{
              borderColor: "var(--color-emerald)",
              color: "var(--color-emerald)",
            }}
          >
            <Download className="w-5 h-5" />
            دریافت پیش فاکتور (فایل متنی)
          </button>

          <button
            onClick={() => setStep("confirmed")}
            className="w-full py-4 rounded-xl font-black text-white text-[14px]"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            واریز را انجام دادم
          </button>
        </div>
      )}

      {/* ══ تایید ══ */}
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
            منتظر واریز شما هستیم
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            پس از تأیید تراکنش توسط کارشناسان، مبلغ در سیکل پایا به کیف پول شما
            افزوده می‌شود.
          </p>
          <Link
            href="/dashboard/wallet"
            className="block py-3.5 rounded-xl font-black text-white text-[14px]"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            بازگشت به کیف پول
          </Link>
        </div>
      )}
    </div>
  );
}
