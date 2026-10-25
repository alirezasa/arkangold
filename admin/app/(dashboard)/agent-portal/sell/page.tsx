// admin/app/(dashboard)/agent-portal/sell/page.tsx
//
// ثبت فروش شمش توسط نماینده برای مالک نهایی (فقط ثبت اصالت/مالکیت در سامانه — فاکتور فروش را
// خود نماینده صادر می‌کند و آرکان گلد برای مشتری نماینده فاکتور صادر نمی‌کند):
// ۱) انتخاب شمش (ملکی یا امانی) و استعلام؛ برای شمش ملکی قیمت فروش آزاد تا سقف مصرف‌کننده
// ۲) مشخصات خریدار — استعلام ثبت احوال و ساخت خودکار پنل کاربری خریدار
// ۳) روش دریافت وجه، رضایت مشتری و تأیید نهایی → ثبت مالکیت به نام خریدار
"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import {
  ShoppingCart,
  Search,
  Loader2,
  Timer,
  RefreshCcw,
  UserCheck,
  UserPlus,
  CheckCircle2,
  FileText,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import {
  Alert,
  Field,
  PURITY_FA,
  SALE_PAYMENT_FA,
  Spinner,
  cardStyle,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
} from "@/app/components/agents/ui";
import type { InventoryItem } from "@/app/components/agents/InventoryTable";

interface Quote {
  quoteId: string;
  code: string;
  /** OWNED: ملک نماینده (فقط ثبت اصالت) | CONSIGNMENT: امانی */
  stockSource: "OWNED" | "CONSIGNMENT";
  consumerMaxPriceRial: string;
  weightGrams: string;
  purityKarat: string;
  goldPricePerGramRial: string;
  goldValueRial: string;
  premiumRial: string;
  totalRial: string;
  commissionType: string;
  commissionValue: string;
  commissionRial: string;
  netPayableRial: string;
  expiresAt: string;
}

interface BuyerLookup {
  exists: boolean;
  status?: string;
  identityStatus?: string | null;
  maskedName?: string | null;
  nationalCodeHint?: string | null;
}

interface SaleResult {
  id: string;
  saleNumber: string;
  buyerFullName: string;
  buyerPhone: string;
  buyerAccountCreated: boolean;
  identityVerified: boolean;
  totalRial: string;
  commissionRial: string;
  netPayableRial: string;
  invoiceId: string | null;
  stockSource: "OWNED" | "CONSIGNMENT";
  hologramCode: { code: string };
}

const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/** تبدیل تاریخ جلالی به میلادی (الگوریتم استاندارد jdf) */
function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days =
    -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > monthDays[gm]; gm++) gd -= monthDays[gm];
  return [gy, gm, gd];
}

const currentJalaliYear = () =>
  Number(new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric" }).format(new Date()).replace(/\D/g, "")) || 1404;

function isValidNationalCode(code: string) {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  const sum = code
    .slice(0, 9)
    .split("")
    .reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return r < 2 ? check === r : check === 11 - r;
}

export default function SellPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SellWizard />
    </Suspense>
  );
}

function SellWizard() {
  const params = useSearchParams();
  const { me } = useAdminMe();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  // خریدار
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<BuyerLookup | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nationalCode, setNationalCode] = useState("");
  const jYearNow = currentJalaliYear();
  const [birth, setBirth] = useState({ y: "", m: "", d: "" });
  const [paymentMethod, setPaymentMethod] = useState("POS");
  const [paymentReference, setPaymentReference] = useState("");
  const [note, setNote] = useState("");
  // قیمت فروش نماینده به مشتری (تومان) — فقط شمش ملکی
  const [salePrice, setSalePrice] = useState("");
  const [agentInvoiceNumber, setAgentInvoiceNumber] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);

  const { data: inventory } = useSWR<{ data: InventoryItem[] }>(
    me?.agent ? "/api/agent-portal/inventory?page=1&limit=200" : null,
    fetcher,
  );

  useEffect(() => {
    if (!quote) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [quote]);

  const secondsLeft = quote ? Math.max(0, Math.floor((new Date(quote.expiresAt).getTime() - now) / 1000)) : 0;
  const expired = !!quote && secondsLeft <= 0;

  const getQuote = async (c = code) => {
    setError(null);
    if (!/^\d{8}$/.test(c)) return setError("کد هولوگرام باید ۸ رقم باشد");
    setQuoting(true);
    try {
      const res = await axios.get<Quote>(`/api/agent-portal/quote/${c}`);
      setQuote(res.data);
      setSalePrice(res.data.stockSource === "OWNED" ? String(Math.round(Number(res.data.totalRial) / 10)) : "");
      setNow(Date.now());
    } catch (err) {
      setQuote(null);
      setError(getErrorMessage(err, "استعلام قیمت ممکن نشد"));
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    // ورود با ?code= از صفحه‌ی موجودی — استعلام خودکار، فقط یک بار
    const initial = params.get("code");
    if (!initial || !/^\d{8}$/.test(initial)) return;
    const t = setTimeout(() => void getQuote(initial), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLookup = async (p: string) => {
    setLookup(null);
    if (!/^09\d{9}$/.test(p)) return;
    try {
      const res = await axios.get<BuyerLookup>(`/api/agent-portal/buyer-lookup?phone=${p}`);
      setLookup(res.data);
    } catch {
      setLookup(null);
    }
  };

  const birthIso = useMemo(() => {
    const y = Number(birth.y);
    const m = Number(birth.m);
    const d = Number(birth.d);
    if (!y || !m || !d) return null;
    const [gy, gm, gd] = jalaliToGregorian(y, m, d);
    return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
  }, [birth]);

  const submit = async () => {
    setError(null);
    if (!quote) return setError("ابتدا قیمت شمش را استعلام کنید");
    if (expired) return setError("اعتبار قیمت تمام شده؛ دوباره استعلام کنید");
    if (!/^09\d{9}$/.test(phone)) return setError("شماره موبایل خریدار معتبر نیست");
    if (firstName.trim().length < 2 || lastName.trim().length < 2) return setError("نام و نام خانوادگی خریدار را کامل وارد کنید");
    if (!isValidNationalCode(nationalCode)) return setError("کد ملی خریدار معتبر نیست");
    if (!birthIso) return setError("تاریخ تولد خریدار را کامل انتخاب کنید");
    if (paymentMethod !== "CASH" && !paymentReference.trim()) return setError("شماره پیگیری/مرجع پرداخت مشتری را وارد کنید");
    const salePriceRial = quote.stockSource === "OWNED" ? Math.round(Number(salePrice || 0) * 10) : undefined;
    if (salePriceRial !== undefined) {
      if (!salePriceRial) return setError("قیمت فروش به مشتری را وارد کنید");
      if (salePriceRial > Number(quote.consumerMaxPriceRial))
        return setError(`قیمت فروش نباید از سقف قیمت مصرف‌کننده (${toman(quote.consumerMaxPriceRial)} تومان) بیشتر باشد`);
    }
    if (!consent) return setError("رضایت خریدار برای ثبت اطلاعات او در سامانه را تأیید کنید (بند ۸-۵ قرارداد)");
    if (!confirmChecked) return setError("صحت اطلاعات و دریافت وجه را تأیید کنید");

    setSubmitting(true);
    try {
      const res = await axios.post<SaleResult>("/api/agent-portal/sales", {
        hologramCode: quote.code,
        quoteId: quote.quoteId,
        buyerPhone: phone,
        buyerFirstName: firstName.trim(),
        buyerLastName: lastName.trim(),
        buyerNationalCode: nationalCode,
        buyerBirthDate: birthIso,
        paymentMethod,
        paymentReference: paymentReference.trim() || undefined,
        note: note.trim() || undefined,
        salePriceRial,
        agentInvoiceNumber: agentInvoiceNumber.trim() || undefined,
        buyerConsent: true,
      });
      setResult(res.data);
    } catch (err) {
      setError(getErrorMessage(err, "ثبت فروش ممکن نشد"));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setResult(null);
    setQuote(null);
    setCode("");
    setPhone("");
    setLookup(null);
    setFirstName("");
    setLastName("");
    setNationalCode("");
    setBirth({ y: "", m: "", d: "" });
    setPaymentReference("");
    setNote("");
    setSalePrice("");
    setAgentInvoiceNumber("");
    setConsent(false);
    setConfirmChecked(false);
    setError(null);
  };

  if (me && !me.agent) return <Alert kind="warn" text="این حساب به نماینده‌ای متصل نیست." />;

  // ─────────── نتیجه ───────────
  if (result) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl p-6 space-y-4 text-center" style={cardStyle}>
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
        <h1 className="text-[18px] font-black text-gray-900">اصالت و مالکیت به نام خریدار ثبت شد</h1>
        <p className="text-[13px] text-gray-600">
          شمش <span className="font-mono font-bold">{result.hologramCode.code}</span> به نام{" "}
          <b>{result.buyerFullName}</b> ثبت شد.
        </p>
        <div className="rounded-xl bg-gray-50 p-4 text-[12px] space-y-1.5 text-right">
          <p>
            شماره فروش: <b dir="ltr">{result.saleNumber}</b>
          </p>
          <p>
            مبلغ فروش شما به مشتری: <b>{toman(result.totalRial)} تومان</b>
          </p>
          {result.stockSource === "CONSIGNMENT" && (
            <p>
              قیمت نمایندگی شمش امانی (صورتحساب به نام شما و اضافه‌شده به بدهی):{" "}
              <b style={{ color: "var(--color-emerald)" }}>{toman(result.netPayableRial)} تومان</b>
            </p>
          )}
        </div>
        <Alert
          kind="warn"
          text="آرکان گلد برای مشتری شما فاکتور صادر نمی‌کند. صورتحساب فروش را خودتان با کد اقتصادی نمایندگی در سامانه مؤدیان صادر و به مشتری تحویل دهید (بند ۸-۲ قرارداد)."
        />
        <Alert
          kind="info"
          text={`${result.buyerAccountCreated ? "برای خریدار حساب کاربری جدید ساخته شد. " : ""}خریدار با شماره ${result.buyerPhone} و رمز یکبار مصرف (پیامکی) وارد اپلیکیشن می‌شود و شمش، سند مالکیت و امکان استعلام و انتقال مالکیت را در پنل خود دارد.`}
        />
        {result.stockSource === "CONSIGNMENT" && !result.invoiceId && (
          <Alert kind="warn" text="صورتحساب شرکت به نام شما (قیمت نمایندگی) خودکار صادر نشد؛ از «فروش‌های من» دوباره اقدام کنید یا با واحد مالی تماس بگیرید." />
        )}
        <div className="flex gap-2 justify-center flex-wrap">
          {result.invoiceId && (
            <a href={`/invoices/${result.invoiceId}/print?scope=agent-company`} target="_blank" rel="noreferrer" className={primaryBtn} style={primaryBtnStyle}>
              <FileText className="w-4 h-4" /> صورتحساب شرکت به نام شما
            </a>
          )}
          <button type="button" onClick={reset} className={secondaryBtn}>
            <ShoppingCart className="w-4 h-4" /> ثبت فروش جدید
          </button>
          <Link href="/agent-portal/sales" className={secondaryBtn}>
            فروش‌های من <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const years = Array.from({ length: 100 }, (_, i) => jYearNow - i);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" /> ثبت فروش و اصالت شمش برای مشتری
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          اصالت و مالکیت شمش به نام خریدار در سامانه ثبت و برای او پنل کاربری ساخته/به‌روز می‌شود. فاکتور فروش را خودتان صادر کنید؛
          آرکان گلد برای مشتری شما فاکتور صادر نمی‌کند.
        </p>
      </div>

      {error && <Alert kind="error" text={error} />}

      {/* ── ۱. شمش و قیمت ── */}
      <section className="rounded-2xl p-5 space-y-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800">۱. انتخاب شمش و استعلام قیمت</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
          <Field label="کد هولوگرام روی شمش">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 8));
                setQuote(null);
              }}
              className={`${inputCls} font-mono text-left text-[15px] tracking-widest`}
              dir="ltr"
              placeholder="12345678"
              inputMode="numeric"
            />
          </Field>
          <Field label="یا انتخاب از موجودی (ملکی/امانی)">
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setCode(e.target.value);
                void getQuote(e.target.value);
              }}
              className={inputCls}
            >
              <option value="">— {faNum(inventory?.data.length ?? 0)} شمش موجود —</option>
              {inventory?.data.map((i) => (
                <option key={i.id} value={i.code}>
                  {i.code} · {faNum(i.weightGrams, 4)} گرم · {i.purityKarat ? PURITY_FA[i.purityKarat] : ""}
                  {i.stockSource === "CONSIGNMENT" ? " · امانی" : ""}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" onClick={() => void getQuote()} disabled={quoting} className={primaryBtn} style={primaryBtnStyle}>
            {quoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            استعلام قیمت
          </button>
        </div>

        {quote && (
          <div className={`rounded-xl border p-4 space-y-2 ${expired ? "border-red-200 bg-red-50/40" : "border-emerald-100 bg-emerald-50/30"}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[13px] font-black text-gray-800">
                شمش <span className="font-mono">{quote.code}</span> · {faNum(quote.weightGrams, 4)} گرم ·{" "}
                {PURITY_FA[quote.purityKarat] ?? quote.purityKarat}
              </p>
              {expired ? (
                <button type="button" onClick={() => void getQuote(quote.code)} className="flex items-center gap-1 text-[12px] font-bold text-red-600">
                  <RefreshCcw className="w-4 h-4" /> اعتبار قیمت تمام شد — استعلام مجدد
                </button>
              ) : (
                <span className="flex items-center gap-1 text-[12px] font-bold text-emerald-700">
                  <Timer className="w-4 h-4" /> اعتبار قیمت: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[12px]">
              <div>
                <p className="text-gray-400">نرخ هر گرم</p>
                <p className="font-bold">{toman(quote.goldPricePerGramRial)} ت</p>
              </div>
              <div>
                <p className="text-gray-400">ارزش طلا</p>
                <p className="font-bold">{toman(quote.goldValueRial)} ت</p>
              </div>
              <div>
                <p className="text-gray-400">اجرت / حق ضرب</p>
                <p className="font-bold">{toman(quote.premiumRial)} ت</p>
              </div>
              {quote.stockSource === "OWNED" ? (
                <>
                  <div>
                    <p className="text-gray-400">سقف قیمت مصرف‌کننده (بند ۸-۳)</p>
                    <p className="font-black text-[16px]">{toman(quote.consumerMaxPriceRial)} تومان</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-gray-400">شمش ملکی شما</p>
                    <p className="font-bold text-purple-700">
                      قیمت فروش را خودتان تعیین می‌کنید؛ اثر مالی برای شرکت ندارد و فقط اصالت/مالکیت ثبت می‌شود.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-gray-400">مبلغ قابل دریافت از مشتری</p>
                    <p className="font-black text-[16px]">{toman(quote.totalRial)} تومان</p>
                  </div>
                  <div>
                    <p className="text-gray-400">حق‌العمل شما</p>
                    <p className="font-bold text-amber-700">{toman(quote.commissionRial)} ت</p>
                  </div>
                  <div>
                    <p className="text-gray-400">قیمت نمایندگی (صورتحساب به نام شما و بدهی)</p>
                    <p className="font-bold" style={{ color: "var(--color-emerald)" }}>
                      {toman(quote.netPayableRial)} ت
                    </p>
                  </div>
                </>
              )}
            </div>
            {quote.stockSource === "OWNED" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="قیمت فروش شما به مشتری (تومان)">
                  <input
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value.replace(/\D/g, ""))}
                    className={`${inputCls} text-left font-black`}
                    dir="ltr"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="شماره صورتحساب شما برای مشتری (اختیاری)">
                  <input value={agentInvoiceNumber} onChange={(e) => setAgentInvoiceNumber(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
                </Field>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── ۲. خریدار ── */}
      <section className="rounded-2xl p-5 space-y-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800">۲. مشخصات خریدار (مالک نهایی)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="موبایل خریدار (نام کاربری پنل او)">
            <input
              value={phone}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                setPhone(v);
                if (v.length === 11) void doLookup(v);
                else setLookup(null);
              }}
              className={`${inputCls} text-left`}
              dir="ltr"
              placeholder="09xxxxxxxxx"
              inputMode="numeric"
            />
          </Field>
          <div className="flex items-end">
            {lookup &&
              (lookup.exists ? (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 text-blue-700 text-[12px] font-bold w-full">
                  <UserCheck className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    خریدار حساب کاربری دارد{lookup.maskedName ? ` (${lookup.maskedName})` : ""}
                    {lookup.identityStatus === "VERIFIED"
                      ? ` — احراز هویت شده${lookup.nationalCodeHint ? `، کد ملی ${lookup.nationalCodeHint}` : ""}`
                      : " — احراز هویت تکمیل نشده"}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-[12px] font-bold w-full">
                  <UserPlus className="w-4 h-4 mt-0.5 shrink-0" />
                  حساب جدید با همین شماره برای خریدار ساخته می‌شود
                </div>
              ))}
          </div>
          <Field label="نام (مطابق کارت ملی)">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} maxLength={50} />
          </Field>
          <Field label="نام خانوادگی">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} maxLength={50} />
          </Field>
          <Field label="کد ملی">
            <input
              value={nationalCode}
              onChange={(e) => setNationalCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className={`${inputCls} text-left ${nationalCode.length === 10 && !isValidNationalCode(nationalCode) ? "border-red-300" : ""}`}
              dir="ltr"
              inputMode="numeric"
            />
          </Field>
          <Field label="تاریخ تولد (شمسی)">
            <div className="grid grid-cols-3 gap-2">
              <select value={birth.d} onChange={(e) => setBirth((b) => ({ ...b, d: e.target.value }))} className={inputCls}>
                <option value="">روز</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d.toLocaleString("fa-IR")}
                  </option>
                ))}
              </select>
              <select value={birth.m} onChange={(e) => setBirth((b) => ({ ...b, m: e.target.value }))} className={inputCls}>
                <option value="">ماه</option>
                {JALALI_MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select value={birth.y} onChange={(e) => setBirth((b) => ({ ...b, y: e.target.value }))} className={inputCls}>
                <option value="">سال</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y.toLocaleString("fa-IR", { useGrouping: false })}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          اطلاعات هویتی هنگام ثبت از سامانه ثبت احوال استعلام می‌شود و سند مالکیت به نام رسمی خریدار صادر می‌گردد.
        </p>
      </section>

      {/* ── ۳. پرداخت و تأیید ── */}
      <section className="rounded-2xl p-5 space-y-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800">۳. دریافت وجه از مشتری و تأیید نهایی</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="روش دریافت وجه">
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
              {Object.entries(SALE_PAYMENT_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="شماره پیگیری / مرجع تراکنش">
            <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
          </Field>
        </div>
        <Field label="یادداشت (اختیاری)">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} maxLength={500} />
        </Field>
        <label className="flex items-start gap-2 text-[12px] font-bold text-gray-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>رضایت خریدار برای ثبت اطلاعات هویتی او در سامانه‌ی آرکان گلد (ثبت مالکیت و استعلام اصالت) اخذ شده است (بند ۸-۵ قرارداد).</span>
        </label>
        <label className="flex items-start gap-2 text-[12px] font-bold text-gray-700">
          <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-0.5" />
          <span>
            تأیید می‌کنم مبلغ{" "}
            {quote ? <b>{quote.stockSource === "OWNED" ? `${Number(salePrice || 0).toLocaleString("fa-IR")} تومان` : `${toman(quote.totalRial)} تومان`}</b> : "فروش"}{" "}
            از خریدار دریافت شده، شمش با کد
            هولوگرام درج‌شده تحویل خریدار شده و اطلاعات هویتی از روی کارت ملی خریدار وارد شده است.
          </span>
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !quote || expired}
          className={`${primaryBtn} w-full py-3.5 text-[14px]`}
          style={primaryBtnStyle}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
          ثبت نهایی و ثبت مالکیت به نام خریدار
        </button>
      </section>
    </div>
  );
}
