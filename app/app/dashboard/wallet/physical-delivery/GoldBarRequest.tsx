"use client";
// تحویل فیزیکی طلای آب‌شده = خرید شمش موجود فروشگاه با کیف طلایی.
// گام‌ها: انتخاب شمش (فقط وزن‌های موجود) ← روش پرداخت مابه‌التفاوت و آدرس ← تأیید.
// محاسبه‌ی قطعی در API انجام می‌شود؛ این‌جا فقط پیش‌فاکتور قفل‌شده نمایش داده می‌شود.
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import useSWR from "swr";
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  CreditCard,
  Loader2,
  MapPin,
  Plus,
  Timer,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { useAddresses, type AddressItem } from "@/app/hooks/usePhysicalDelivery";
import { useActiveGateways } from "@/app/hooks/useShop";
import { newIdempotencyKey } from "@/app/utils/idempotency";
import AddAddressForm from "./AddAddressForm";
import type { ShippingOption } from "@/app/hooks/useShipping";
import ShippingMethodPicker from "@/app/dashboard/components/shop/ShippingMethodPicker";

export interface BarPlanView {
  goldForBarGrams: string;
  goldForBarToman: string;
  differenceToman: string;
  shortfallGrams: string;
  extraGoldGrams: string;
  extraGoldToman: string;
  rialWalletToman: string;
  gatewayToman: string;
  goldAppliedGrams: string;
  goldAppliedToman: string;
}

export interface BarItem extends BarPlanView {
  variantId: string;
  productName: string;
  imageUrl: string | null;
  weightGrams: string;
  stock: number;
  priceToman: string;
}

export interface BarsResponse {
  minGoldGrams: string;
  eligible: boolean;
  goldAvailableGrams: string;
  rialAvailableToman: string;
  goldRateToman: string;
  bars: BarItem[];
}

interface Quote extends BarPlanView {
  quoteId: string;
  /** هزینه‌ی ارسال پیش‌پرداخت که در مابه‌التفاوت لحاظ شده (تومان) */
  shippingToman?: string;
  shipping?: {
    enabled: boolean;
    options: ShippingOption[];
    selected: {
      methodId: string;
      name: string;
      chargedToman: string;
      estimateToman: string;
      payOnDelivery: boolean;
      free: boolean;
    } | null;
    error: string | null;
  };
  expiresAt: string;
  expiresInSeconds: number;
  productName: string;
  weightGrams: string;
  priceToman: string;
  goldRateToman: string;
  goldAvailableGrams: string;
  rialAvailableToman: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);
const NEST_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN ||
  (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export const fmtG = (v: string | number) =>
  Number(v).toLocaleString("fa-IR", { maximumFractionDigits: 4 });
export const fmtT = (v: string | number) => Math.round(Number(v)).toLocaleString("fa-IR");
/** سوت = میلی‌گرم */
export const fmtSoot = (grams: string | number) =>
  Math.round(Number(grams) * 1000).toLocaleString("fa-IR");

function errMsg(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) {
    const m = e.response?.data?.message;
    return Array.isArray(m) ? m[0] : m || fallback;
  }
  return fallback;
}

export function useGoldBars() {
  const { data, isLoading, error, mutate } = useSWR<BarsResponse>(
    "/api/gold-delivery/bars",
    fetcher,
    { revalidateOnFocus: false },
  );
  return { data, loading: isLoading, error: error ? errMsg(error, "خطا در دریافت شمش‌ها") : null, refresh: mutate };
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="text-gray-500">{label}</span>
      <span className={strong ? "font-black text-gray-900" : "font-bold text-gray-700"}>{value}</span>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-right transition-colors ${
        checked ? "border-emerald bg-emerald/5" : "border-gray-100 bg-white"
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${checked ? "text-emerald" : "text-gray-400"}`} />
      <span className="flex-1">
        <span className="block text-[12.5px] font-black text-gray-800">{label}</span>
        <span className="block text-[11px] text-gray-400">{hint}</span>
      </span>
      <span
        className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-emerald" : "bg-gray-200"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "-translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

export default function GoldBarRequest({
  open,
  bars,
  onClose,
  onDone,
}: {
  open: boolean;
  bars: BarsResponse | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const { addresses, refresh: refreshAddresses } = useAddresses();
  const { gateways } = useActiveGateways();

  const [variantId, setVariantId] = useState<string | null>(null);
  const [useExtraGold, setUseExtraGold] = useState(true);
  const [useRialWallet, setUseRialWallet] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [addressId, setAddressId] = useState("");
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [payOnDelivery, setPayOnDelivery] = useState(false);
  const [gateway, setGateway] = useState<"ZARINPAL" | "BEHPARDAKHT" | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [idemKey, setIdemKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!quote) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [quote]);

  // آدرس پیش‌فرض تا انتخاب صریح کاربر
  const effectiveAddressId =
    addressId || (addresses.find((a) => a.isDefault) ?? addresses[0])?.id || "";

  // پیش‌فاکتور با هر تغییر شمش/روش پرداخت/آدرس/روش ارسال دوباره قفل می‌شود (فقط آخرین درخواست اعمال می‌شود)
  type QuoteParams = {
    vid: string;
    extra: boolean;
    rial: boolean;
    addressId: string;
    methodId: string | null;
    cod: boolean;
  };
  const quoteSeq = useRef(0);
  const requestQuote = (p: QuoteParams) => {
    const seq = ++quoteSeq.current;
    setQuoting(true);
    setError(null);
    axios
      .post<Quote>("/api/gold-delivery/quote", {
        variantId: p.vid,
        useExtraGold: p.extra,
        useRialWallet: p.rial,
        addressId: p.addressId || undefined,
        shippingMethodId: p.methodId ?? undefined,
        shippingFeePayment: p.methodId ? (p.cod ? "ON_DELIVERY" : "PREPAID") : undefined,
      })
      .then((r) => {
        if (quoteSeq.current !== seq) return;
        // روش ارسال انتخاب نشده یا برای این آدرس معتبر نیست: اولین روش در دسترس پیشنهاد می‌شود
        const ship = r.data.shipping;
        if (ship?.enabled && !ship.selected) {
          const first = ship.options.find((o) => o.available);
          if (first && first.methodId !== p.methodId) {
            setShippingMethodId(first.methodId);
            setPayOnDelivery(false);
            requestQuote({ ...p, methodId: first.methodId, cod: false });
            return;
          }
        }
        setQuote(r.data);
        setNow(Date.now());
      })
      .catch((e) => {
        if (quoteSeq.current !== seq) return;
        setQuote(null);
        setError(errMsg(e, "محاسبه‌ی قیمت ناموفق بود"));
      })
      .finally(() => {
        if (quoteSeq.current === seq) setQuoting(false);
      });
  };
  const params = (over: Partial<QuoteParams> = {}): QuoteParams => ({
    vid: variantId ?? "",
    extra: useExtraGold,
    rial: useRialWallet,
    addressId: effectiveAddressId,
    methodId: shippingMethodId,
    cod: payOnDelivery,
    ...over,
  });
  const selectBar = (vid: string) => {
    setVariantId(vid);
    setQuote(null);
    requestQuote(params({ vid }));
  };
  const changeExtraGold = (v: boolean) => {
    setUseExtraGold(v);
    if (variantId) requestQuote(params({ extra: v }));
  };
  const changeRialWallet = (v: boolean) => {
    setUseRialWallet(v);
    if (variantId) requestQuote(params({ rial: v }));
  };
  const changeAddress = (id: string) => {
    setAddressId(id);
    setShippingMethodId(null);
    setPayOnDelivery(false);
    if (variantId) requestQuote(params({ addressId: id, methodId: null, cod: false }));
  };
  const changeShipping = (methodId: string, cod: boolean) => {
    setShippingMethodId(methodId);
    setPayOnDelivery(cod);
    if (variantId) requestQuote(params({ methodId, cod }));
  };

  if (!open) return null;

  // درگاه پیش‌فرض تا انتخاب صریح کاربر
  const effectiveGateway = gateway || gateways[0]?.key || "";

  const reset = () => {
    setVariantId(null);
    setQuote(null);
    setError(null);
    setDone(null);
    setIdemKey(newIdempotencyKey());
  };
  const close = () => {
    onClose();
    setTimeout(reset, 250);
  };

  const remaining = quote ? Math.max(0, Math.floor((new Date(quote.expiresAt).getTime() - now) / 1000)) : 0;
  const expired = !!quote && remaining <= 0;
  const needsGateway = !!quote && Number(quote.gatewayToman) > 0;
  const shippingSelected = quote?.shipping?.selected ?? null;
  const shippingMissing = !!quote?.shipping?.enabled && !shippingSelected;

  const submit = async () => {
    if (!quote) return;
    if (!effectiveAddressId) return setError("آدرس تحویل را انتخاب کنید");
    if (shippingMissing) return setError(quote.shipping?.error ?? "روش ارسال را انتخاب کنید");
    if (needsGateway && !effectiveGateway) return setError("درگاه پرداخت را انتخاب کنید");
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await axios.post(
        "/api/gold-delivery/order",
        {
          quoteId: quote.quoteId,
          addressId: effectiveAddressId,
          useExtraGold,
          useRialWallet,
          gatewayProvider: needsGateway ? effectiveGateway : undefined,
          shippingMethodId: shippingSelected?.methodId,
          shippingFeePayment: shippingSelected
            ? shippingSelected.payOnDelivery
              ? "ON_DELIVERY"
              : "PREPAID"
            : undefined,
        },
        { headers: { "idempotency-key": idemKey } },
      );
      if (data.requiresRedirect && data.redirectUrl) {
        window.location.assign(data.redirectUrl);
        return;
      }
      setDone(data.message ?? "درخواست ثبت شد");
      onDone();
    } catch (e) {
      setError(errMsg(e, "ثبت درخواست ناموفق بود"));
      setIdemKey(newIdempotencyKey());
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAddress: AddressItem | undefined = addresses.find((a) => a.id === effectiveAddressId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative max-h-app-sheet w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-black text-gray-900">
            {done ? "ثبت شد" : variantId ? "پرداخت و ارسال" : "انتخاب شمش"}
          </h2>
          <button onClick={close} aria-label="بستن" className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[12px] font-bold text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600" />
            <p className="text-[14px] font-black text-gray-900">{done}</p>
            <p className="mt-1 text-[12px] text-gray-500">
              پس از آماده‌سازی، شمش برای شما ارسال و کد تحویل پیامک می‌شود.
            </p>
            <button
              onClick={close}
              className="mt-5 w-full rounded-xl py-3 text-[13px] font-black text-white"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              متوجه شدم
            </button>
          </div>
        ) : !variantId ? (
          <>
            {bars && (
              <p className="mb-3 text-[12px] leading-relaxed text-gray-500">
                موجودی طلای قابل استفاده: <b className="text-gray-800">{fmtG(bars.goldAvailableGrams)} گرم</b>{" "}
                ({fmtSoot(bars.goldAvailableGrams)} سوت) — نرخ لحظه‌ای هر گرم:{" "}
                <b className="text-gray-800">{fmtT(bars.goldRateToman)} تومان</b>
              </p>
            )}
            {!bars?.bars.length ? (
              <p className="py-10 text-center text-[13px] text-gray-400">در حال حاضر شمشی موجود نیست</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {bars.bars.map((b) => (
                  <button
                    key={b.variantId}
                    type="button"
                    disabled={!bars.eligible}
                    onClick={() => selectBar(b.variantId)}
                    className="flex flex-col rounded-2xl border border-gray-100 bg-white p-3 text-right transition-all hover:border-gold-500/60 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="mb-2 flex h-16 items-center justify-center rounded-xl bg-gold-50">
                      {b.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.imageUrl.startsWith("http") ? b.imageUrl : `${NEST_ORIGIN}${b.imageUrl}`}
                          alt=""
                          className="max-h-14 object-contain"
                        />
                      ) : (
                        <Coins className="h-7 w-7 text-gold-600" />
                      )}
                    </div>
                    <span className="text-[12.5px] font-black text-gray-900">
                      شمش {fmtG(b.weightGrams)} گرمی
                    </span>
                    <span className="text-[11px] text-gray-400">{fmtSoot(b.weightGrams)} سوت</span>
                    <span className="mt-1.5 text-[12px] font-bold text-gray-800">{fmtT(b.priceToman)} تومان</span>
                    <span className="mt-1 text-[10.5px] leading-relaxed text-gray-500">
                      از طلای شما: {fmtG(b.goldForBarGrams)} گرم
                      <br />
                      مابه‌التفاوت: <b className="text-emerald">{fmtT(b.differenceToman)} تومان</b>
                    </span>
                    {Number(b.shortfallGrams) > 0 && (
                      <span className="mt-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        کسری طلا: {fmtG(b.shortfallGrams)} گرم
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setVariantId(null);
                setQuote(null);
              }}
              className="mb-3 text-[12px] font-bold text-emerald hover:underline"
            >
              → تغییر شمش
            </button>

            <div className="space-y-2">
              <Toggle
                checked={useExtraGold}
                onChange={changeExtraGold}
                icon={Coins}
                label="پرداخت مابه‌التفاوت با طلای کیف"
                hint="میلی‌گرم‌های اضافه‌ی کیف طلایی با نرخ لحظه‌ای کسر شود"
              />
              <Toggle
                checked={useRialWallet}
                onChange={changeRialWallet}
                icon={Wallet}
                label="پرداخت از کیف پول ریالی"
                hint={quote ? `موجودی: ${fmtT(quote.rialAvailableToman)} تومان` : "موجودی ریالی کیف پول"}
              />
            </div>

            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-gray-700">
                <MapPin className="h-4 w-4" /> آدرس تحویل
              </p>
              {showAddAddress ? (
                <AddAddressForm
                  onSuccess={(a) => {
                    void refreshAddresses();
                    changeAddress(a.id);
                    setShowAddAddress(false);
                  }}
                  onCancel={() => setShowAddAddress(false)}
                />
              ) : (
                <>
                  <select
                    value={effectiveAddressId}
                    onChange={(e) => changeAddress(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12.5px] outline-none focus:border-gold-500"
                  >
                    <option value="">انتخاب آدرس…</option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {(a.title ? `${a.title} — ` : "") + [a.city, a.fullAddress].filter(Boolean).join("، ")}
                      </option>
                    ))}
                  </select>
                  {selectedAddress?.receiverName && (
                    <p className="mt-1 text-[11px] text-gray-400">گیرنده: {selectedAddress.receiverName}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAddAddress(true)}
                    className="mt-2 flex items-center gap-1 text-[12px] font-bold text-emerald"
                  >
                    <Plus className="h-4 w-4" /> افزودن آدرس جدید
                  </button>
                </>
              )}
            </div>

            {quote?.shipping?.enabled && effectiveAddressId && !showAddAddress && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-gray-700">
                  <Truck className="h-4 w-4" /> روش ارسال
                </p>
                <ShippingMethodPicker
                  options={quote.shipping.options}
                  loading={false}
                  error={quote.shipping.options.length === 0 ? quote.shipping.error : null}
                  selectedId={shippingSelected?.methodId ?? null}
                  onSelect={(id) => changeShipping(id, false)}
                  payOnDelivery={shippingSelected?.payOnDelivery ?? payOnDelivery}
                  onPayOnDeliveryChange={(v) => shippingSelected && changeShipping(shippingSelected.methodId, v)}
                />
                {quote.shipping.error && quote.shipping.options.length > 0 && (
                  <p className="mt-1 text-[11px] font-bold text-red-600">{quote.shipping.error}</p>
                )}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
              {quoting && !quote ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                </div>
              ) : quote ? (
                <>
                  <Row label="شمش" value={`${quote.productName} — ${fmtG(quote.weightGrams)} گرم`} />
                  <Row label="قیمت شمش (نرخ لحظه‌ای + سود)" value={`${fmtT(quote.priceToman)} تومان`} strong />
                  <Row
                    label="کسر از کیف طلایی بابت وزن شمش"
                    value={`${fmtG(quote.goldForBarGrams)} گرم ≈ ${fmtT(quote.goldForBarToman)} تومان`}
                  />
                  {Number(quote.shortfallGrams) > 0 && (
                    <Row label="کسری طلا نسبت به وزن شمش" value={`${fmtG(quote.shortfallGrams)} گرم`} />
                  )}
                  {shippingSelected && (
                    <Row
                      label={`هزینه ارسال (${shippingSelected.name})`}
                      value={
                        shippingSelected.free
                          ? "رایگان"
                          : shippingSelected.payOnDelivery
                            ? `پس‌کرایه (حدود ${fmtT(shippingSelected.estimateToman)} تومان هنگام تحویل)`
                            : Number(shippingSelected.chargedToman) > 0
                              ? `${fmtT(shippingSelected.chargedToman)} تومان`
                              : "رایگان"
                      }
                    />
                  )}
                  <Row label="مابه‌التفاوت" value={`${fmtT(quote.differenceToman)} تومان`} strong />
                  <div className="my-2 border-t border-dashed border-gray-200" />
                  {Number(quote.extraGoldGrams) > 0 && (
                    <Row
                      label="از طلای اضافه‌ی کیف"
                      value={`${fmtG(quote.extraGoldGrams)} گرم (${fmtT(quote.extraGoldToman)} تومان)`}
                    />
                  )}
                  {Number(quote.rialWalletToman) > 0 && (
                    <Row label="از کیف پول ریالی" value={`${fmtT(quote.rialWalletToman)} تومان`} />
                  )}
                  <Row
                    label="پرداخت با درگاه"
                    value={`${fmtT(quote.gatewayToman)} تومان`}
                    strong={needsGateway}
                  />
                  <Row label="جمع طلای کسرشده از کیف" value={`${fmtG(quote.goldAppliedGrams)} گرم`} strong />
                  <p className={`mt-2 flex items-center gap-1 text-[11px] font-bold ${expired ? "text-red-600" : "text-gray-400"}`}>
                    <Timer className="h-3.5 w-3.5" />
                    {expired
                      ? "مهلت قیمت تمام شد؛ گزینه‌ای را تغییر دهید یا دوباره شمش را انتخاب کنید"
                      : `قیمت تا ${remaining.toLocaleString("fa-IR")} ثانیه‌ی دیگر قفل است`}
                  </p>
                </>
              ) : null}
            </div>

            {needsGateway && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-gray-700">
                  <CreditCard className="h-4 w-4" /> درگاه پرداخت
                </p>
                {gateways.length === 0 ? (
                  <p className="text-[12px] text-red-600">
                    درگاه فعالی وجود ندارد؛ موجودی کیف ریالی یا طلای اضافه را افزایش دهید.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {gateways.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setGateway(g.key)}
                        className={`rounded-xl border-2 px-3 py-2 text-[12px] font-bold ${
                          effectiveGateway === g.key ? "border-emerald text-emerald" : "border-gray-100 text-gray-600"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={
                !quote || expired || submitting || quoting || shippingMissing || (needsGateway && gateways.length === 0)
              }
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[13px] font-black text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : needsGateway ? (
                `پرداخت ${quote ? fmtT(quote.gatewayToman) : ""} تومان و ثبت درخواست`
              ) : (
                "تأیید و ثبت درخواست تحویل"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
