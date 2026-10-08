// admin/app/(dashboard)/agent-portal/inquiry/page.tsx
//
// استعلام شمش توسط نماینده (مثلاً پیش از خرید/پذیرش شمشی که مشتری می‌آورد): اصالت، مالک
// (با کد ملی ماسک‌شده)، امانت نزد همین نماینده و — مهم‌تر از همه — هشدار سرقت/مفقودی.
// هر استعلام با نام نماینده در لاگ ثبت و در پرونده‌ی گزارش سرقت/مفقودی برای مدیریت دیده می‌شود.
"use client";
import { useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Loader2, Search, SearchCheck, ShieldAlert, ShieldCheck, ShieldQuestion, Siren } from "lucide-react";
import { Alert, PURITY_FA, cardStyle, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle } from "@/app/components/agents/ui";

interface InquiryResult {
  status: "INVALID_CODE" | "VALID_UNASSIGNED" | "VALID_ASSIGNED";
  message: string;
  product?: {
    weightGrams: string | null;
    purityKarat: string | null;
    factorySerialNumber: string | null;
    batchNumber: string;
  };
  owner?: { fullName: string; nationalCode: string; ownershipStartAt: string } | null;
  incident?: {
    type: "THEFT" | "LOSS";
    typeLabel: string;
    statusLabel: string;
    reportNumber: string;
    reportedAt: string;
    message: string;
  } | null;
  custody?: { atThisAgent: boolean; atAnotherAgent: boolean };
}

const toEn = (s: string) =>
  s.replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/\D/g, "");

export default function AgentInquiryPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InquiryResult | null>(null);
  const [queried, setQueried] = useState("");

  const submit = async () => {
    const clean = toEn(code);
    if (!/^\d{8}$/.test(clean)) return setError("کد هولوگرام باید دقیقاً ۸ رقم باشد");
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post<InquiryResult>("/api/agent-portal/hologram-inquiry", { code: clean });
      setResult(res.data);
      setQueried(clean);
    } catch (err) {
      setError(getErrorMessage(err, "استعلام ممکن نشد"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-2 mb-1">
        <SearchCheck className="w-5 h-5 text-gray-700" />
        <h1 className="text-lg font-black text-gray-900">استعلام شمش</h1>
      </div>
      <p className="text-[12px] text-gray-400 mb-4">
        پیش از خرید یا تحویل‌گرفتن هر شمش، کد هولوگرام آن را استعلام کنید. شمش سرقتی یا مفقودی با هشدار قرمز نمایش داده
        می‌شود.
      </p>

      <div className="rounded-2xl p-4 flex gap-2 items-end" style={cardStyle}>
        <input
          dir="ltr"
          inputMode="numeric"
          maxLength={8}
          placeholder="کد ۸ رقمی هولوگرام"
          value={code}
          onChange={(e) => setCode(toEn(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className={`${inputCls} mt-0 text-center font-black tracking-[0.2em]`}
        />
        <button onClick={submit} disabled={loading} className={primaryBtn} style={primaryBtnStyle}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4" /> استعلام</>}
        </button>
      </div>

      {error && <div className="mt-3"><Alert kind="error" text={error} /></div>}

      {result?.incident && (
        <div className="mt-4 rounded-2xl p-4 border-2 border-red-300 bg-red-50 space-y-1.5">
          <p className="flex items-center gap-2 text-red-700 text-[16px] font-black">
            <Siren className="w-6 h-6" /> هشدار: شمش «{result.incident.typeLabel}» گزارش شده است
          </p>
          <p className="text-[13px] text-red-700 leading-relaxed">
            از خرید، پذیرش یا معامله‌ی این شمش خودداری کنید و بلافاصله موضوع را به آرکان گلد اطلاع دهید.
          </p>
          <p className="text-[11px] text-red-500">
            شماره گزارش <bdi dir="ltr">{result.incident.reportNumber}</bdi> — {result.incident.statusLabel} — ثبت{" "}
            {new Date(result.incident.reportedAt).toLocaleDateString("fa-IR")}
          </p>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl p-4 space-y-2 text-[13px]" style={cardStyle}>
          <div className="flex items-center gap-2">
            {result.status === "INVALID_CODE" || result.incident ? (
              <ShieldAlert className="w-6 h-6 text-red-500" />
            ) : result.status === "VALID_UNASSIGNED" ? (
              <ShieldQuestion className="w-6 h-6 text-gray-400" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-emerald-500" />
            )}
            <span className="font-black text-gray-900">
              {result.status === "INVALID_CODE"
                ? "کد نامعتبر — این شمش در سامانه‌ی آرکان گلد ثبت نشده است"
                : result.status === "VALID_UNASSIGNED"
                  ? "شمش معتبر — بدون مالک ثبت‌شده"
                  : result.incident
                    ? "شمش اصل است اما گزارش شده"
                    : "اصالت شمش تأیید شد"}
            </span>
          </div>

          {result.custody?.atThisAgent && (
            <Alert kind="info" text="این شمش در موجودی امانی نمایندگی شماست." />
          )}
          {result.custody?.atAnotherAgent && (
            <Alert kind="warn" text="این شمش در امانت نماینده‌ی دیگری است و نباید نزد شما باشد." />
          )}

          {result.product && (
            <div className="text-gray-600 space-y-1">
              {result.product.weightGrams && (
                <p>
                  وزن: {Number(result.product.weightGrams).toLocaleString("fa-IR")} گرم
                  {result.product.purityKarat ? ` — ${PURITY_FA[result.product.purityKarat] ?? result.product.purityKarat}` : ""}
                </p>
              )}
              {result.product.factorySerialNumber && <p>سریال کارخانه: {result.product.factorySerialNumber}</p>}
              <p>دسته: {result.product.batchNumber}</p>
            </div>
          )}
          {result.owner && (
            <p className="text-gray-600">
              مالک ثبت‌شده: <b>{result.owner.fullName}</b> — کد ملی <bdi dir="ltr">{result.owner.nationalCode}</bdi>
            </p>
          )}
          {result.status === "VALID_ASSIGNED" && !result.incident && (
            <p className="text-[11px] text-gray-400">
              برای خرید از مالک، هویت فروشنده را با کارت ملی تطبیق دهید؛ انتقال مالکیت باید از پنل کاربری مالک انجام شود.
            </p>
          )}
          {result.custody?.atThisAgent && !result.incident && (
            <Link
              href={`/agent-portal/sell?code=${queried}`}
              className={`${primaryBtn} w-fit`}
              style={primaryBtnStyle}
            >
              ثبت فروش این شمش
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
