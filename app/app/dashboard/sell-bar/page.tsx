"use client";

// فروش شمش آرکان گلد به خود آرکان گلد (بازخرید):
// ثبت درخواست ← تحویل شمش ← اصالت‌سنجی ← اعلام قیمت نهایی و تأیید کاربر ← تأیید نهایی و واریز
// به حساب بانکی پیش‌فرض کاربر
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  HandCoins,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  ScanLine,
  Send,
  Truck,
  X,
  XCircle,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function errorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const m = (err.response?.data as { message?: string | string[] } | undefined)?.message;
    if (m) return Array.isArray(m) ? m[0] : m;
  }
  return fallback;
}

const toman = (rial?: string | null) =>
  rial == null ? "—" : Math.floor(Number(rial) / 10).toLocaleString("fa-IR");
const grams = (g?: string | null) => (g == null ? "—" : Number(g).toLocaleString("fa-IR"));
const karat = (k?: string | null) => (k === "K18" ? "۱۸" : k === "K24" ? "۲۴" : "—");
const faDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// ─────────────────────────── انواع داده ───────────────────────────

interface PriceBreakdown {
  pricePerGramRial: string;
  weightGrams: string;
  grossRial: string;
  deductionPercent: string;
  deductionRial: string;
  feeRial: string;
  netRial: string;
}

interface Bar {
  hologramCodeId: string;
  code: string;
  productTitle: string | null;
  weightGrams: string | null;
  purityKarat: string | null;
  factorySerialNumber: string | null;
  ownershipStartAt: string;
  eligible: boolean;
  reasons: string[];
  estimate: PriceBreakdown | null;
}

type Status =
  | "SUBMITTED"
  | "AWAITING_DELIVERY"
  | "RECEIVED"
  | "INSPECTION_PASSED"
  | "OFFERED"
  | "ACCEPTED"
  | "APPROVED"
  | "PAID"
  | "RETURN_PENDING"
  | "RETURNED"
  | "REJECTED"
  | "CANCELLED";

interface BuybackRequest {
  id: string;
  requestNumber: string;
  hologramCode: string;
  productTitle: string | null;
  weightGrams: string;
  purityKarat: string | null;
  status: Status;
  statusLabel: string;
  deliveryMethod: "IN_PERSON" | "INSURED_POST";
  deliveryMethodLabel: string;
  estimatedPriceRial: string;
  appointmentAt: string | null;
  appointmentNote: string | null;
  receivedAt: string | null;
  inspectionPassed: boolean | null;
  measuredWeightGrams: string | null;
  offer: {
    pricePerGramRial: string | null;
    grossRial: string | null;
    deductionRial: string | null;
    feeRial: string | null;
    netRial: string | null;
    note: string | null;
    offeredAt: string | null;
    expiresAt: string | null;
  } | null;
  destination: { bankName: string | null; cardNumber: string; sheba: string };
  paidAt: string | null;
  bankReference: string | null;
  rejectionReason: string | null;
  returnReason: string | null;
  returnedAt: string | null;
  cancelledAt: string | null;
  canCancel: boolean;
  canRespond: boolean;
  createdAt: string;
}

interface Overview {
  enabled: boolean;
  blockers: string[];
  terms: {
    deductionPercent: string;
    feeRial: string;
    offerValidityHours: number;
    minHoldingDays: number;
    dropoffAddress: string;
    postInstructions: string;
    deliveryMethods: { key: "IN_PERSON" | "INSURED_POST"; label: string }[];
  };
  bankAccount: { bankName: string; cardNumber: string; sheba: string; ownerName: string | null } | null;
  bars: Bar[];
  requests: BuybackRequest[];
}

interface Detail extends BuybackRequest {
  dropoffAddress: string;
  postInstructions: string;
  timeline: { status: Status; statusLabel: string; note: string | null; at: string }[];
}

// ─────────────────────────── مراحل ───────────────────────────

const STEPS = [
  { label: "ثبت درخواست", icon: Send },
  { label: "تحویل شمش", icon: PackageCheck },
  { label: "اصالت‌سنجی", icon: ScanLine },
  { label: "قیمت نهایی", icon: CircleDollarSign },
  { label: "تأیید و واریز", icon: Banknote },
] as const;

const STEP_OF: Partial<Record<Status, number>> = {
  SUBMITTED: 0,
  AWAITING_DELIVERY: 1,
  RECEIVED: 2,
  INSPECTION_PASSED: 3,
  OFFERED: 3,
  ACCEPTED: 4,
  APPROVED: 4,
  PAID: 5,
};

const STATUS_TONE: Record<Status, string> = {
  SUBMITTED: "bg-sky-50 text-sky-700 border-sky-100",
  AWAITING_DELIVERY: "bg-amber-50 text-amber-700 border-amber-100",
  RECEIVED: "bg-indigo-50 text-indigo-700 border-indigo-100",
  INSPECTION_PASSED: "bg-indigo-50 text-indigo-700 border-indigo-100",
  OFFERED: "bg-gold-50 text-[#8a6d35] border-gold-100",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-100",
  PAID: "bg-emerald-100 text-emerald-800 border-emerald-200",
  RETURN_PENDING: "bg-orange-50 text-orange-700 border-orange-100",
  RETURNED: "bg-gray-100 text-gray-600 border-gray-200",
  REJECTED: "bg-red-50 text-red-600 border-red-100",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
};

// ─────────────────────────── صفحه ───────────────────────────

export default function SellBarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      }
    >
      <SellBar />
    </Suspense>
  );
}

function SellBar() {
  const params = useSearchParams();
  const { data, isLoading, error, mutate } = useSWR<Overview>("/api/user/buyback/overview", fetcher);
  const [selected, setSelected] = useState<Bar | null>(null);

  // ورود از دکمه‌ی «فروش به آرکان گلد» در صفحه‌ی شمش‌های من (?bar=...)
  const preselect = params.get("bar");
  useEffect(() => {
    if (!preselect || !data) return;
    const bar = data.bars.find((b) => b.hologramCodeId === preselect && b.eligible);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (bar && !data.blockers.length) setSelected(bar);
  }, [preselect, data]);

  return (
    <div className="mx-auto max-w-3xl space-y-5" dir="rtl">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-light">
          <HandCoins className="h-5 w-5 text-emerald" />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">فروش شمش به آرکان گلد</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            شمش‌های آرکان گلد خود را با قیمت روز به خود ما بفروشید
          </p>
        </div>
      </header>

      <HowItWorks terms={data?.terms} />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        </div>
      ) : error || !data ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600">
          {errorMessage(error, "دریافت اطلاعات ممکن نشد. لطفاً دوباره تلاش کنید.")}
        </div>
      ) : (
        <>
          {data.blockers.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              {data.blockers.map((b) => (
                <p key={b} className="flex items-start gap-2 text-[13px] font-bold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {b}
                </p>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/dashboard/identity" className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                  احراز هویت
                </Link>
                <Link href="/dashboard/cards" className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                  کارت‌های بانکی
                </Link>
              </div>
            </div>
          )}

          <RequestsSection requests={data.requests} onChanged={() => mutate()} />

          <section className="space-y-3">
            <h2 className="text-sm font-black text-gray-800">شمش‌های من</h2>
            {data.bars.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white py-12 text-center">
                <ScanLine className="h-10 w-10 text-gray-200" />
                <p className="text-[13px] text-gray-400">شمش آرکان گلدی به نام شما ثبت نشده است</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.bars.map((b) => (
                  <BarCard
                    key={b.hologramCodeId}
                    bar={b}
                    disabled={!data.enabled || data.blockers.length > 0}
                    onSell={() => setSelected(b)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {selected && data && (
        <RequestModal
          bar={selected}
          overview={data}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

function HowItWorks({ terms }: { terms?: Overview["terms"] }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-white p-4">
      <div className="grid grid-cols-5 gap-1">
        {STEPS.map(({ label, icon: Icon }, i) => (
          <div key={label} className="flex flex-col items-center gap-1.5 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald/10 text-emerald">
              <Icon className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-bold leading-tight text-gray-600 sm:text-[11px]">
              {(i + 1).toLocaleString("fa-IR")}. {label}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-bold text-emerald"
      >
        شرایط و استانداردهای بازخرید
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-3 list-disc space-y-1.5 pr-5 text-xs leading-6 text-gray-600">
          <li>فقط شمش‌های آرکان گلد که با کد هولوگرام به نام خود شما ثبت شده‌اند قابل فروش هستند.</li>
          <li>
            پس از ثبت درخواست، شمش تا پایان فرآیند قفل می‌شود و انتقال مالکیت آن ممکن نیست. تا پیش از
            تحویل شمش می‌توانید درخواست را لغو کنید.
          </li>
          <li>
            شمش باید سالم، با هولوگرام و بسته‌بندی بدون دستکاری تحویل شود. اصالت، وزن و عیار شمش توسط
            کارشناس آرکان گلد بررسی می‌شود.
          </li>
          <li>
            قیمت نهایی بر اساس قیمت روز، وزن و عیار اندازه‌گیری‌شده
            {terms && Number(terms.deductionPercent) > 0
              ? ` با کسر ${Number(terms.deductionPercent).toLocaleString("fa-IR")}٪`
              : ""}
            {terms && Number(terms.feeRial) > 0 ? ` و ${toman(terms.feeRial)} تومان هزینه‌ی کارشناسی` : ""}{" "}
            اعلام می‌شود و تا
            {terms ? ` ${terms.offerValidityHours.toLocaleString("fa-IR")} ` : " "}
            ساعت برای تأیید شما معتبر است.
          </li>
          <li>اگر قیمت را نپذیرید یا اصالت‌سنجی ناموفق باشد، شمش به خود شما عودت داده می‌شود.</li>
          <li>مبلغ فقط به حساب بانکی پیش‌فرض و تأییدشده‌ی خود شما واریز می‌شود.</li>
        </ul>
      )}
    </section>
  );
}

function BarCard({ bar, disabled, onSell }: { bar: Bar; disabled: boolean; onSell: () => void }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black text-gray-900">{bar.productTitle ?? "شمش طلا"}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {grams(bar.weightGrams)} گرم — عیار {karat(bar.purityKarat)}
          </p>
        </div>
        <span dir="ltr" className="shrink-0 rounded-lg bg-gray-50 px-2 py-1 font-mono text-xs font-bold text-gray-700">
          {bar.code}
        </span>
      </div>
      <div className="mt-3 rounded-xl bg-gray-50 p-3">
        <p className="text-[11px] text-gray-500">برآورد مبلغ دریافتی (غیرقطعی)</p>
        <p className="mt-0.5 text-base font-black text-emerald">
          {bar.estimate ? `${toman(bar.estimate.netRial)} تومان` : "قیمت لحظه‌ای در دسترس نیست"}
        </p>
      </div>
      {!bar.eligible && bar.reasons.length > 0 && (
        <p className="mt-2 text-[11px] font-bold leading-5 text-amber-700">{bar.reasons.join("، ")}</p>
      )}
      <button
        type="button"
        disabled={disabled || !bar.eligible}
        onClick={onSell}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-emerald py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <HandCoins className="h-4 w-4" />
        درخواست فروش
      </button>
    </div>
  );
}

// ─────────────────────────── ثبت درخواست ───────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="max-h-app-sheet relative w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="بستن">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RequestModal({
  bar,
  overview,
  onClose,
  onDone,
}: {
  bar: Bar;
  overview: Overview;
  onClose: () => void;
  onDone: () => void;
}) {
  const methods = overview.terms.deliveryMethods;
  const [method, setMethod] = useState<"IN_PERSON" | "INSURED_POST">(methods[0]?.key ?? "IN_PERSON");
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const e = bar.estimate;

  const submit = async () => {
    if (!accept) return setError("برای ادامه، شرایط بازخرید را بپذیرید.");
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("/api/user/buyback", {
        hologramCodeId: bar.hologramCodeId,
        deliveryMethod: method,
        note: note.trim() || undefined,
        acceptTerms: true,
      });
      setDone(res.data?.requestNumber ?? "");
    } catch (err) {
      setError(errorMessage(err, "ثبت درخواست ممکن نشد"));
    } finally {
      setLoading(false);
    }
  };

  if (done !== null) {
    return (
      <Modal title="درخواست ثبت شد" onClose={onDone}>
        <div className="space-y-3 py-2 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className="text-sm font-bold text-gray-800">
            درخواست فروش شمش با شماره <bdi dir="ltr">{done}</bdi> ثبت شد.
          </p>
          <p className="text-xs leading-6 text-gray-500">
            پس از بررسی، زمان و نحوه‌ی تحویل شمش از طریق پیامک و اعلان به شما اطلاع داده می‌شود.
          </p>
          <button type="button" onClick={onDone} className="w-full rounded-xl bg-emerald py-3 text-sm font-bold text-white">
            متوجه شدم
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="درخواست فروش شمش" onClose={onClose}>
      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 text-xs">
        <span className="font-bold text-gray-700">
          {bar.productTitle ?? "شمش طلا"} — {grams(bar.weightGrams)} گرم
        </span>
        <span dir="ltr" className="font-mono font-bold text-gray-600">{bar.code}</span>
      </div>

      {e && (
        <dl className="space-y-1.5 rounded-xl border border-border p-3 text-xs">
          <Row label="قیمت روز هر گرم" value={`${toman(e.pricePerGramRial)} تومان`} />
          <Row label="ارزش روز شمش" value={`${toman(e.grossRial)} تومان`} />
          {Number(e.deductionRial) > 0 && (
            <Row
              label={`کسر بازخرید (${Number(e.deductionPercent).toLocaleString("fa-IR")}٪)`}
              value={`− ${toman(e.deductionRial)} تومان`}
            />
          )}
          {Number(e.feeRial) > 0 && <Row label="هزینه‌ی کارشناسی" value={`− ${toman(e.feeRial)} تومان`} />}
          <div className="flex items-center justify-between border-t border-dashed border-border pt-2">
            <dt className="font-black text-gray-800">برآورد مبلغ دریافتی</dt>
            <dd className="text-sm font-black text-emerald">{toman(e.netRial)} تومان</dd>
          </div>
          <p className="pt-1 text-[11px] leading-5 text-gray-400">
            مبلغ قطعی پس از اصالت‌سنجی و با قیمت روز همان زمان اعلام می‌شود و تا تأیید شما نهایی نیست.
          </p>
        </dl>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-black text-gray-600">نحوه‌ی تحویل شمش</legend>
        {methods.map((m) => (
          <label
            key={m.key}
            className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 text-xs ${
              method === m.key ? "border-emerald bg-emerald/5" : "border-gray-100"
            }`}
          >
            <input
              type="radio"
              name="delivery"
              className="mt-0.5 accent-[var(--color-emerald)]"
              checked={method === m.key}
              onChange={() => setMethod(m.key)}
            />
            <span className="space-y-1">
              <span className="flex items-center gap-1.5 font-bold text-gray-800">
                {m.key === "IN_PERSON" ? <MapPin className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
                {m.label}
              </span>
              {m.key === "IN_PERSON" && overview.terms.dropoffAddress && (
                <span className="block leading-5 text-gray-500">{overview.terms.dropoffAddress}</span>
              )}
              {m.key === "INSURED_POST" && overview.terms.postInstructions && (
                <span className="block leading-5 text-gray-500">{overview.terms.postInstructions}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      {overview.bankAccount && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald/5 p-3 text-xs">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
          <div className="space-y-0.5">
            <p className="font-bold text-gray-800">واریز به حساب پیش‌فرض: {overview.bankAccount.bankName}</p>
            <p dir="ltr" className="text-right font-mono text-gray-500">
              {overview.bankAccount.sheba || overview.bankAccount.cardNumber}
            </p>
          </div>
        </div>
      )}

      <textarea
        value={note}
        onChange={(ev) => setNote(ev.target.value.slice(0, 500))}
        rows={2}
        placeholder="توضیحات (اختیاری) — مثلاً زمان مناسب برای تحویل"
        className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-gold-500"
      />

      <label className="flex cursor-pointer items-start gap-2 text-xs leading-6 text-gray-600">
        <input
          type="checkbox"
          className="mt-1.5 accent-[var(--color-emerald)]"
          checked={accept}
          onChange={(ev) => setAccept(ev.target.checked)}
        />
        شرایط بازخرید را می‌پذیرم: شمش تا پایان فرآیند قفل می‌شود، اصالت و وزن آن توسط کارشناس آرکان گلد
        بررسی و قیمت نهایی پس از آن اعلام می‌شود و مبلغ فقط به حساب پیش‌فرض من واریز می‌شود.
      </label>

      {error && (
        <p className="flex items-start gap-1.5 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={submit}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "ثبت درخواست فروش"}
      </button>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-bold text-gray-800">{value}</dd>
    </div>
  );
}

// ─────────────────────────── درخواست‌های من ───────────────────────────

function RequestsSection({ requests, onChanged }: { requests: BuybackRequest[]; onChanged: () => void }) {
  if (!requests.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black text-gray-800">درخواست‌های فروش من</h2>
      {requests.map((r) => (
        <RequestCard key={r.id} r={r} onChanged={onChanged} />
      ))}
    </section>
  );
}

function RequestCard({ r, onChanged }: { r: BuybackRequest; onChanged: () => void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(r.status === "OFFERED");
  const { data: detail } = useSWR<Detail>(open ? `/api/user/buyback/${r.id}` : null, fetcher);
  const step = STEP_OF[r.status];

  const act = async (kind: "accept" | "decline" | "cancel") => {
    if (kind === "decline" && !window.confirm("با رد قیمت، فرآیند فروش متوقف و شمش به شما عودت داده می‌شود. ادامه می‌دهید؟")) return;
    if (kind === "cancel" && !window.confirm("درخواست فروش لغو شود؟")) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "cancel") await axios.post(`/api/user/buyback/${r.id}/cancel`, {});
      else await axios.post(`/api/user/buyback/${r.id}/respond`, { accept: kind === "accept" });
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "انجام عملیات ممکن نشد"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="rounded-2xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-black text-gray-900">
            {r.productTitle ?? "شمش طلا"} — {grams(r.weightGrams)} گرم
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            <bdi dir="ltr">{r.requestNumber}</bdi> · کد <bdi dir="ltr">{r.hologramCode}</bdi> ·{" "}
            {faDateTime(r.createdAt)}
          </p>
        </div>
        <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[r.status]}`}>
          {r.statusLabel}
        </span>
      </div>

      {step !== undefined && (
        <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="مراحل">
          {STEPS.map(({ label }, i) => {
            const state = i < step ? "done" : i === step ? "current" : "todo";
            return (
              <li key={label} className="flex flex-col items-center gap-1 text-center">
                <span
                  className={`h-1.5 w-full rounded-full ${
                    state === "done" ? "bg-emerald" : state === "current" ? "bg-gold-500" : "bg-gray-100"
                  }`}
                />
                <span className={`text-[10px] font-bold ${state === "todo" ? "text-gray-300" : "text-gray-600"}`}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {r.status === "AWAITING_DELIVERY" && (
        <InfoBox icon={PackageCheck} tone="amber">
          شمش را {r.appointmentAt ? `در ${faDateTime(r.appointmentAt)}` : "در ساعات کاری"} به همراه کارت ملی
          ({r.deliveryMethodLabel}) تحویل دهید.
          {r.appointmentNote ? ` ${r.appointmentNote}` : ""}
        </InfoBox>
      )}

      {r.status === "OFFERED" && r.offer && (
        <div className="mt-4 space-y-2 rounded-xl border-2 border-gold-500/40 bg-gold-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-black text-[#8a6d35]">
            <BadgeCheck className="h-4 w-4" /> اصالت شمش تأیید شد — قیمت نهایی
          </p>
          <dl className="space-y-1 text-xs">
            <Row label="قیمت هر گرم" value={`${toman(r.offer.pricePerGramRial)} تومان`} />
            {r.measuredWeightGrams && <Row label="وزن اندازه‌گیری‌شده" value={`${grams(r.measuredWeightGrams)} گرم`} />}
            <Row label="ارزش شمش" value={`${toman(r.offer.grossRial)} تومان`} />
            {Number(r.offer.deductionRial) > 0 && <Row label="کسر بازخرید" value={`− ${toman(r.offer.deductionRial)} تومان`} />}
            {Number(r.offer.feeRial) > 0 && <Row label="هزینه‌ی کارشناسی" value={`− ${toman(r.offer.feeRial)} تومان`} />}
            <div className="flex items-center justify-between border-t border-dashed border-gold-500/40 pt-2">
              <dt className="font-black text-gray-800">مبلغ قابل واریز</dt>
              <dd className="text-base font-black text-emerald">{toman(r.offer.netRial)} تومان</dd>
            </div>
          </dl>
          {r.offer.note && <p className="text-[11px] text-gray-600">{r.offer.note}</p>}
          <p className="text-[11px] text-gray-500">
            مهلت تأیید: تا {faDateTime(r.offer.expiresAt)} · واریز به {r.destination.bankName}{" "}
            <bdi dir="ltr">{r.destination.sheba || r.destination.cardNumber}</bdi>
          </p>
          {r.canRespond ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act("accept")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald py-2.5 text-xs font-bold text-white disabled:opacity-60"
              >
                {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                تأیید و فروش
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => act("decline")}
                className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 py-2.5 text-xs font-bold text-gray-600 disabled:opacity-60"
              >
                {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                انصراف و عودت شمش
              </button>
            </div>
          ) : (
            <p className="text-[11px] font-bold text-amber-700">مهلت تأیید این قیمت تمام شده؛ قیمت جدید اعلام می‌شود.</p>
          )}
        </div>
      )}

      {(r.status === "ACCEPTED" || r.status === "APPROVED") && r.offer && (
        <InfoBox icon={ClipboardCheck} tone="emerald">
          مبلغ {toman(r.offer.netRial)} تومان پس از تأیید نهایی به حساب {r.destination.bankName} شما واریز می‌شود.
        </InfoBox>
      )}

      {r.status === "PAID" && r.offer && (
        <InfoBox icon={Banknote} tone="emerald">
          مبلغ {toman(r.offer.netRial)} تومان در {faDateTime(r.paidAt)} به حساب {r.destination.bankName} واریز شد.
          {r.bankReference ? ` شماره پیگیری: ${r.bankReference}` : ""}
        </InfoBox>
      )}

      {(r.status === "RETURN_PENDING" || r.status === "RETURNED") && (
        <InfoBox icon={Info} tone="orange">
          {r.status === "RETURNED"
            ? `شمش در ${faDateTime(r.returnedAt)} به شما عودت داده شد و همچنان به نام شما ثبت است.`
            : "شمش به شما عودت داده می‌شود؛ برای هماهنگی تحویل با شما تماس گرفته می‌شود."}
          {r.returnReason ? ` دلیل: ${r.returnReason}` : ""}
        </InfoBox>
      )}

      {r.status === "REJECTED" && r.rejectionReason && (
        <InfoBox icon={XCircle} tone="red">دلیل رد: {r.rejectionReason}</InfoBox>
      )}

      {error && <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs font-bold text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs font-bold text-gray-500"
        >
          جزئیات و مراحل
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {r.canCancel && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("cancel")}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 ring-1 ring-red-100 disabled:opacity-60"
          >
            {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "لغو درخواست"}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <dl className="grid gap-1.5 text-xs sm:grid-cols-2 sm:gap-x-6">
            <Row label="نحوه‌ی تحویل" value={r.deliveryMethodLabel} />
            <Row label="برآورد اولیه" value={`${toman(r.estimatedPriceRial)} تومان`} />
            <Row label="حساب مقصد" value={r.destination.bankName ?? "—"} />
            {r.receivedAt && <Row label="تاریخ دریافت شمش" value={faDateTime(r.receivedAt)} />}
          </dl>
          {r.deliveryMethod === "IN_PERSON" && detail?.dropoffAddress && !["PAID", "RETURNED", "REJECTED", "CANCELLED"].includes(r.status) && (
            <p className="flex items-start gap-1.5 rounded-xl bg-gray-50 p-2.5 text-xs leading-5 text-gray-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {detail.dropoffAddress}
            </p>
          )}
          {r.deliveryMethod === "INSURED_POST" && detail?.postInstructions && !["PAID", "RETURNED", "REJECTED", "CANCELLED"].includes(r.status) && (
            <p className="flex items-start gap-1.5 rounded-xl bg-gray-50 p-2.5 text-xs leading-5 text-gray-600">
              <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {detail.postInstructions}
            </p>
          )}
          {!detail ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin text-gray-300" />
          ) : (
            <ol className="relative space-y-3 border-r-2 border-gray-100 pr-4">
              {detail.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -right-[1.3rem] top-1 h-2.5 w-2.5 rounded-full bg-emerald ring-2 ring-white" />
                  <p className="text-xs font-bold text-gray-800">{t.statusLabel}</p>
                  <p className="text-[11px] text-gray-400">{faDateTime(t.at)}</p>
                  {t.note && <p className="mt-0.5 text-[11px] text-gray-500">{t.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function InfoBox({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Info;
  tone: "amber" | "emerald" | "orange" | "red";
  children: React.ReactNode;
}) {
  const cls = {
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-100",
    orange: "bg-orange-50 text-orange-800 border-orange-100",
    red: "bg-red-50 text-red-700 border-red-100",
  }[tone];
  return (
    <p className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs leading-6 ${cls}`}>
      <Icon className="mt-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
