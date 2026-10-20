"use client";

// استعلام عمومی فاکتور فروش / پیش‌فاکتور آرکان گلد.
// QR چاپ‌شده روی هر سند به ‌/verifyInvoice?n={شماره سند}&t={توکن} اشاره می‌کند؛ با توکن
// معتبر متن کامل سند (با پوشاندن جزئی کد ملی و موبایل خریدار) به استعلام‌گیرنده نشان داده
// می‌شود. با ورود دستی شماره‌ی سند (بدون توکن) فقط اصالت و وضعیت سند تأیید می‌شود.
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import {
  FileCheck2,
  FileX2,
  Loader2,
  Printer,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import InvoiceDocumentView from "@/app/dashboard/components/documents/InvoiceDocument";
import ProformaDocument from "@/app/dashboard/components/documents/ProformaDocument";
import type { InvoiceDocument } from "@/app/dashboard/components/documents/document.types";

type VerifyResult =
  | { valid: false }
  | {
      valid: true;
      invoiceNumber: string;
      kind: "INVOICE" | "PROFORMA";
      status: "ISSUED" | "PAID" | "CONSUMED" | "EXPIRED" | "CANCELLED";
      issuedAtJalali: string;
      expiresAtJalali: string | null;
      cancelledAtJalali: string | null;
      issuerLegalName: string;
      contentHashPrefix: string;
      tokenProvided: boolean;
      document: InvoiceDocument | null;
    };

const KIND_LABEL = { INVOICE: "فاکتور فروش", PROFORMA: "پیش‌فاکتور" } as const;

const STATUS_META: Record<
  string,
  { label: string; tone: "ok" | "warn" | "bad"; note?: string }
> = {
  ISSUED: { label: "صادرشده و معتبر", tone: "ok" },
  PAID: { label: "پرداخت‌شده", tone: "ok" },
  CONSUMED: { label: "تسویه‌شده", tone: "ok" },
  EXPIRED: {
    label: "منقضی‌شده",
    tone: "warn",
    note: "مهلت اعتبار این سند به پایان رسیده است.",
  },
  CANCELLED: {
    label: "باطل‌شده",
    tone: "bad",
    note: "این سند توسط صادرکننده باطل شده و فاقد اعتبار است.",
  },
};

export default function VerifyInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-app items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald" />
        </div>
      }
    >
      <VerifyInvoice />
    </Suspense>
  );
}

function VerifyInvoice() {
  const router = useRouter();
  const params = useSearchParams();
  const n = params.get("n") ?? "";
  const t = params.get("t") ?? "";

  const [input, setInput] = useState(n);
  const [loading, setLoading] = useState(Boolean(n));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const lookup = useCallback(async (number: string, token: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<VerifyResult>("/api/public/invoice-verify", {
        params: { n: number, ...(token ? { t: token } : {}) },
      });
      setResult(res.data);
    } catch (err) {
      setResult(null);
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError("تعداد استعلام‌ها بیش از حد مجاز است. لطفاً یک دقیقه دیگر تلاش کنید.");
      } else {
        const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
        setError(typeof msg === "string" ? msg : "خطا در استعلام. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!n) return;
    // استعلام خودکار پس از اسکن QR (پارامترهای n و t در آدرس)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void lookup(n, t);
  }, [n, t, lookup]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const number = input.trim();
    if (!number) {
      setError("شماره‌ی سند را وارد کنید (مثلاً AG-1404-INV-000123).");
      return;
    }
    router.replace(`/verifyInvoice?n=${encodeURIComponent(number)}`);
    if (number === n && !t) void lookup(number, "");
  };

  const doc = result?.valid ? result.document : null;
  const status = result?.valid ? STATUS_META[result.status] : null;

  return (
    <div className="min-h-app bg-[#eceae3] px-4 py-6 sm:py-10">
      <div className="no-print mx-auto w-full max-w-xl">
        <header className="mb-5 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald/10">
            <ScanLine className="h-6 w-6 text-emerald" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-black text-gray-900">استعلام فاکتور و پیش‌فاکتور</h1>
            <p className="text-[11px] text-gray-500">آرکان گلد</p>
          </div>
        </header>

        {/* نتیجه */}
        {loading ? (
          <div className="flex justify-center rounded-2xl border border-border bg-white p-10">
            <Loader2 className="h-7 w-7 animate-spin text-emerald" />
          </div>
        ) : result && !result.valid ? (
          <div className="rounded-2xl border-2 border-red-200 bg-white p-6 text-center">
            <FileX2 className="mx-auto mb-3 h-14 w-14 text-red-500" />
            <h2 className="mb-1 text-base font-black text-gray-900">سندی با این شماره یافت نشد</h2>
            <p className="text-xs leading-relaxed text-gray-500">
              این سند توسط آرکان گلد صادر نشده یا شماره‌ی آن اشتباه وارد شده است. به اسناد بدون
              استعلام معتبر اعتماد نکنید.
            </p>
          </div>
        ) : result?.valid && status ? (
          <div
            className={`rounded-2xl border-2 bg-white p-5 ${
              status.tone === "ok"
                ? "border-emerald-200"
                : status.tone === "warn"
                  ? "border-amber-200"
                  : "border-red-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {status.tone === "ok" ? (
                <ShieldCheck className="h-10 w-10 shrink-0 text-emerald-600" />
              ) : (
                <ShieldAlert
                  className={`h-10 w-10 shrink-0 ${status.tone === "warn" ? "text-amber-500" : "text-red-500"}`}
                />
              )}
              <div className="min-w-0">
                <h2 className="text-base font-black text-gray-900">
                  {KIND_LABEL[result.kind]} معتبر و صادرشده توسط آرکان گلد است
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  وضعیت سند:{" "}
                  <b
                    className={
                      status.tone === "ok"
                        ? "text-emerald-700"
                        : status.tone === "warn"
                          ? "text-amber-700"
                          : "text-red-600"
                    }
                  >
                    {status.label}
                  </b>
                </p>
                {status.note && (
                  <p className="mt-1 text-xs font-bold text-red-600">{status.note}</p>
                )}
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-gray-50 p-4 text-[13px] sm:grid-cols-2">
              <Row label="شماره سند" value={result.invoiceNumber} ltr />
              <Row label="نوع سند" value={KIND_LABEL[result.kind]} />
              <Row label="تاریخ صدور" value={result.issuedAtJalali} />
              {result.expiresAtJalali && <Row label="مهلت اعتبار" value={result.expiresAtJalali} />}
              {result.cancelledAtJalali && (
                <Row label="تاریخ ابطال" value={result.cancelledAtJalali} />
              )}
              {result.issuerLegalName && <Row label="صادرکننده" value={result.issuerLegalName} />}
              <Row label="کد امنیتی سند" value={result.contentHashPrefix} ltr mono />
            </dl>

            {!doc && (
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                {result.tokenProvided
                  ? "لینک استعلام کامل نیست یا با این سند مطابقت ندارد؛ برای دیدن متن کامل سند، QR چاپ‌شده روی آن را دوباره اسکن کنید."
                  : "برای دیدن متن کامل سند، QR چاپ‌شده روی آن را اسکن کنید. کد امنیتی بالا باید با کد چاپ‌شده کنار QR یکسان باشد."}
              </p>
            )}
          </div>
        ) : null}

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-red-600">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ورود دستی شماره سند */}
        {!doc && (
          <form
            onSubmit={submit}
            className="mt-4 space-y-3 rounded-2xl border border-border bg-white p-5"
          >
            <label htmlFor="invoice-number" className="block text-xs font-bold text-gray-500">
              شماره‌ی سند (چاپ‌شده در بالای فاکتور)
            </label>
            <input
              id="invoice-number"
              dir="ltr"
              placeholder="AG-1404-INV-000123"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 40))}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-base font-black tracking-wider outline-none focus:border-gold-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald py-3 font-black text-white disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              استعلام سند
            </button>
          </form>
        )}
      </div>

      {/* متن کامل سند (فقط با QR معتبر) */}
      {doc && (
        <div className="mt-6">
          <div className="no-print mx-auto mb-3 flex max-w-xl items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
              متن کامل سند ثبت‌شده در سامانه
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              className="doc-btn doc-btn--ghost no-print"
            >
              <Printer size={16} />
              چاپ
            </button>
          </div>
          <FittedDocument doc={doc} />
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  ltr,
  mono,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd
        dir={ltr ? "ltr" : undefined}
        className={`truncate font-bold text-gray-900 ${mono ? "font-mono tracking-wider" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * ورق A4 سند در عرض صفحه (به‌ویژه گوشی) جا می‌شود: به‌جای transform (که عرض اصلی را
 * نگه می‌داشت و اسکرول افقی می‌ساخت) کل ورق با zoom کوچک می‌شود.
 */
function FittedDocument({ doc }: { doc: InvoiceDocument }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const sheetMm = doc.orientation === "landscape" ? 297 : 210;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const sheetPx = (sheetMm * 96) / 25.4;
    const fit = () => setZoom(Math.min(1, frame.clientWidth / sheetPx));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [sheetMm]);

  return (
    <div ref={frameRef} className="verify-doc mx-auto w-full" style={{ maxWidth: `${sheetMm}mm` }}>
      <div style={{ zoom }}>
        {doc.kind === "PROFORMA" ? (
          <ProformaDocument doc={doc} />
        ) : (
          <InvoiceDocumentView doc={doc} />
        )}
      </div>
    </div>
  );
}
