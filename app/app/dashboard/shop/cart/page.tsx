"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Trash2,
  Minus,
  Plus,
  ShoppingBag,
  AlertCircle,
  Loader2,
  CheckCircle2,
  MapPin,
  Home,
  Building2,
  CreditCard,
  Clock,
  Scale,
  Gift,
  User,
  TicketPercent,
  X,
} from "lucide-react";
import {
  useCart,
  useUpdateCartItem,
  useCheckout,
  usePayShopOrder,
  useShopOrder,
  useValidateDiscount,
  CartItemDto,
  ShopOrderDto,
  CheckoutRecipient,
  DiscountPreview,
} from "@/app/hooks/useShop";
import { useAddresses } from "@/app/hooks/usePhysicalDelivery";
import { useWallet } from "@/app/hooks/useWallet";
import { useActiveGateways } from "@/app/hooks/useShop";
import { Suspense } from "react";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

type Step = "cart" | "address" | "confirm" | "done";

function CartRow({
  item,
  onQuantityChange,
  onWeightChange,
  onRemove,
}: {
  item: CartItemDto;
  onQuantityChange: (id: string, qty: number) => void;
  onWeightChange: (id: string, weightGrams: number) => void;
  onRemove: (id: string) => void;
}) {
  // کانتر محلی برای زمان انقضای قفل قیمت این آیتم
  const [remaining, setRemaining] = useState(item.expiresInSeconds);

  // ── همگام‌سازی remaining با item.expiresInSeconds حین رندر (نه در افکت) ──
  // هر بار که سرور مقدار جدیدی برای این آیتم برگرداند (مثلاً بعد از تغییر
  // وزن/تعداد و قفل مجدد قیمت)، باید کانتر از نو شروع شود.
  const [trackedKey, setTrackedKey] = useState(
    `${item.id}:${item.expiresInSeconds}`,
  );
  const currentKey = `${item.id}:${item.expiresInSeconds}`;
  if (currentKey !== trackedKey) {
    setTrackedKey(currentKey);
    setRemaining(item.expiresInSeconds);
  }

  // افکت فقط مسئول تیک‌زدن ثانیه‌شمار است، نه همگام‌سازی با prop
  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isWeightRange = item.kind === "WEIGHT_RANGE";
  const expiringSoon = remaining > 0 && remaining <= 60;
  const expired = remaining <= 0;

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center text-rose-300 shrink-0">
          {isWeightRange ? (
            <Scale className="w-6 h-6" />
          ) : (
            <ShoppingBag className="w-6 h-6" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-gray-800 truncate">
            {item.productName}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {item.weightGrams} گرم
          </p>
          {!item.available && (
            <p className="text-[10px] text-red-500 font-bold mt-1">
              ناموجود / موجودی ناکافی
            </p>
          )}
        </div>

        {/* ── کنترل تعداد یا وزن ── */}
        {isWeightRange ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              dir="ltr"
              defaultValue={item.weightGrams}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0 && v !== Number(item.weightGrams)) {
                  onWeightChange(item.id, v);
                }
              }}
              className="w-16 h-8 text-center text-[12px] font-bold border border-gray-200 rounded-lg outline-none focus:border-rose-400"
            />
            <span className="text-[10px] text-gray-400">گرم</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() =>
                onQuantityChange(item.id, Math.max(1, item.quantity - 1))
              }
              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-6 text-center text-[13px] font-bold">
              {item.quantity.toLocaleString("fa-IR")}
            </span>
            <button
              onClick={() =>
                onQuantityChange(
                  item.id,
                  item.stockQuantity
                    ? Math.min(item.stockQuantity, item.quantity + 1)
                    : item.quantity + 1,
                )
              }
              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="text-left shrink-0 w-24">
          <p className="text-[13px] font-black text-gray-800">
            {fmtToman(item.lineTotalToman)}
          </p>
          <p className="text-[10px] text-gray-400">تومان</p>
        </div>
        <button
          onClick={() => onRemove(item.id)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {(expiringSoon || expired) && (
        <div
          className={`flex items-center gap-1.5 mt-2 mr-17 text-[11px] font-bold ${
            expired ? "text-red-500" : "text-amber-600"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          {expired
            ? "قیمت این آیتم منقضی شده — صفحه را رفرش کنید"
            : `قیمت تا ${formatCountdown(remaining)} دیگر معتبر است`}
        </div>
      )}
    </div>
  );
}

function ShopCartPageInner() {
  const { cart, loading, refresh } = useCart();
  const { update, remove } = useUpdateCartItem();
  const { addresses, loading: addressesLoading } = useAddresses();
  const { wallet } = useWallet();
  const {
    loading: checkoutLoading,
    error: checkoutError,
    setError: setCheckoutError,
    checkout,
  } = useCheckout();
  const { gateways } = useActiveGateways();
  const [paymentMode, setPaymentMode] = useState<
    "WALLET" | "GATEWAY" | "SPLIT"
  >("WALLET");
  const [selectedGateway, setSelectedGateway] = useState<
    "ZARINPAL" | "BEHPARDAKHT" | ""
  >("");
  const [walletPortionToman, setWalletPortionToman] = useState("");
  const { loading: payLoading, error: payError, pay } = usePayShopOrder();

  const [step, setStep] = useState<Step>("cart");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [order, setOrder] = useState<ShopOrderDto | null>(null);
  // گیرنده هر آیتم — «خرید برای خودم» یا «برای فرد دیگر» (بند ۳.۳)
  const [recipients, setRecipients] = useState<
    Record<string, { type: "SELF" | "OTHER"; phone: string }>
  >({});
  // کد تخفیف — پیش‌نمایش سمت سرور؛ مبلغ قطعی هنگام ثبت سفارش دوباره محاسبه می‌شود
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] =
    useState<DiscountPreview | null>(null);
  const {
    loading: discountLoading,
    error: discountError,
    setError: setDiscountError,
    validate: validateDiscount,
  } = useValidateDiscount();

  // ── بازگشت از درگاه پرداخت: خواندن paymentStatus/orderId از query ──
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get("paymentStatus");
  const returnedOrderId = searchParams.get("orderId");
  const { order: returnedOrder } = useShopOrder(
    paymentStatus === "success" && returnedOrderId ? returnedOrderId : null,
  );

  useEffect(() => {
    if (paymentStatus === "success" && returnedOrder) {
      setOrder(returnedOrder);
      setStep("done");
    } else if (paymentStatus === "failed") {
      setCheckoutError(
        "پرداخت ناموفق بود یا توسط شما لغو شد. می‌توانید دوباره تلاش کنید.",
      );
    } else if (paymentStatus === "error") {
      setCheckoutError(
        "خطا در تایید پرداخت رخ داد. اگر مبلغی کسر شده، با پشتیبانی تماس بگیرید.",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentStatus, returnedOrder]);

  const handleQuantityChange = async (itemId: string, qty: number) => {
    await update(itemId, { quantity: qty });
    refresh();
  };

  const handleWeightChange = async (itemId: string, weightGrams: number) => {
    await update(itemId, { weightGrams });
    refresh();
  };

  const handleRemove = async (itemId: string) => {
    await remove(itemId);
    refresh();
  };

  const handleGoToAddress = () => {
    if (!cart || cart.items.length === 0) return;
    setCheckoutError(null);
    // سبد ممکن است تغییر کرده باشد؛ کد تخفیف دوباره روی مبلغ جدید بررسی شود
    setAppliedDiscount(null);
    setDiscountError(null);
    setStep("address");
  };

  const handleApplyDiscount = async () => {
    const code = discountInput.trim();
    if (!code) return setDiscountError("کد تخفیف را وارد کنید");
    const res = await validateDiscount(code);
    if (res) {
      setAppliedDiscount(res);
      setDiscountInput(res.code);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError(null);
  };

  const handleConfirmAddress = () => {
    if (!selectedAddressId) return setCheckoutError("یک آدرس را انتخاب کنید");
    setCheckoutError(null);
    setStep("confirm");
  };

  const handlePlaceOrder = async () => {
    const recipientPayload: CheckoutRecipient[] = (cart?.items ?? []).map(
      (item) => {
        const r = recipients[item.id];
        return {
          cartItemId: item.id,
          recipientType: r?.type ?? "SELF",
          recipientPhoneNumber: r?.type === "OTHER" ? r.phone.trim() : undefined,
        };
      },
    );
    const invalidRecipient = recipientPayload.find(
      (r) =>
        r.recipientType === "OTHER" &&
        !/^09\d{9}$/.test(r.recipientPhoneNumber ?? ""),
    );
    if (invalidRecipient) {
      return setCheckoutError(
        "شماره موبایل گیرنده برای کالاهای «برای فرد دیگر» را به‌درستی وارد کنید",
      );
    }

    const res = await checkout(
      selectedAddressId,
      recipientPayload,
      appliedDiscount?.code,
    );
    if (!res) return;
    setOrder(res);

    const totalRial = Number(res.totalToman) * 10;

    let payload:
      | { mode: "WALLET" }
      | { mode: "GATEWAY"; gatewayProvider: "ZARINPAL" | "BEHPARDAKHT" }
      | {
          mode: "SPLIT";
          gatewayProvider: "ZARINPAL" | "BEHPARDAKHT";
          walletAmountRial: string;
          gatewayAmountRial: string;
        };

    // سفارش با تخفیف کامل مبلغی برای پرداخت ندارد
    if (paymentMode === "WALLET" || totalRial <= 0) {
      payload = { mode: "WALLET" };
    } else if (paymentMode === "GATEWAY") {
      if (!selectedGateway)
        return setCheckoutError("یک درگاه پرداخت انتخاب کنید");
      payload = { mode: "GATEWAY", gatewayProvider: selectedGateway };
    } else {
      if (!selectedGateway)
        return setCheckoutError("یک درگاه پرداخت انتخاب کنید");
      const walletRial = Number(walletPortionToman.replace(/,/g, "")) * 10;
      if (!walletRial || walletRial <= 0 || walletRial >= totalRial) {
        return setCheckoutError(
          "مبلغ کیف‌پول باید بین صفر تا کل مبلغ فاکتور باشد",
        );
      }
      payload = {
        mode: "SPLIT",
        gatewayProvider: selectedGateway,
        walletAmountRial: String(walletRial),
        gatewayAmountRial: String(totalRial - walletRial),
      };
    }

    const payRes = await pay(res.id, payload);
    if (payRes?.requiresRedirect && payRes.redirectUrl) {
      window.location.href = payRes.redirectUrl; // ریدایرکت به درگاه
      return;
    }
    if (payRes) {
      setStep("done");
      refresh();
    }
  };

  const error = checkoutError || payError;
  const hasExpiredItem = cart?.items.some((i) => i.expiresInSeconds <= 0);
  // مبلغ قابل پرداخت پس از اعمال کد تخفیف
  const payableToman = appliedDiscount
    ? Number(appliedDiscount.totalToman)
    : (cart?.totalToman ?? 0);
  const isFree = !!appliedDiscount && payableToman <= 0;

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/shop"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">سبد خرید</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {cart?.items.length
              ? `${cart.items.length.toLocaleString("fa-IR")} کالا`
              : "سبد شما خالی است"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {step === "cart" && (
        <div className="space-y-4">
          {!cart || cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-2xl border-2 border-dashed border-gray-200">
              <ShoppingBag className="w-12 h-12 text-gray-300" />
              <p className="text-[13px] font-bold text-gray-400">
                سبد خرید شما خالی است
              </p>
              <Link
                href="/dashboard/shop"
                className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                مشاهده فروشگاه
              </Link>
            </div>
          ) : (
            <>
              <div
                className="rounded-2xl px-5 py-2 divide-y divide-gray-100"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                {cart.items.map((item) => (
                  <CartRow
                    key={item.id}
                    item={item}
                    onQuantityChange={handleQuantityChange}
                    onWeightChange={handleWeightChange}
                    onRemove={handleRemove}
                  />
                ))}
              </div>

              <div
                className="rounded-2xl p-4 flex items-center justify-between"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <span className="text-[13px] font-bold text-gray-600">
                  جمع کل
                </span>
                <span className="text-[18px] font-black text-gray-900">
                  {fmtToman(cart.totalToman)}{" "}
                  <span className="text-[12px] font-bold text-gray-400">
                    تومان
                  </span>
                </span>
              </div>

              {hasExpiredItem && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[12px] font-bold">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                  قیمت برخی از آیتم‌های سبد منقضی شده. برای ادامه، آیتم را حذف و
                  مجدداً اضافه کنید تا قیمت جدید قفل شود.
                </div>
              )}

              <button
                onClick={handleGoToAddress}
                disabled={
                  cart.items.some((i) => !i.available) || hasExpiredItem
                }
                className="w-full py-4 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                ادامه فرآیند خرید
              </button>
            </>
          )}
        </div>
      )}

      {step === "address" && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h2 className="text-[14px] font-black text-gray-800">آدرس تحویل</h2>

          {addressesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : addresses.length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">
                برای ثبت آدرس، ابتدا از بخش تحویل فیزیکی یک آدرس اضافه کنید
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  onClick={() => {
                    setSelectedAddressId(addr.id);
                    setCheckoutError(null);
                  }}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-right transition-all ${
                    selectedAddressId === addr.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-100 bg-gray-50 hover:border-gray-200"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedAddressId === addr.id
                        ? "bg-emerald-100"
                        : "bg-white"
                    }`}
                  >
                    {addr.title?.includes("کار") ? (
                      <Building2 className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Home className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-gray-800">
                      {addr.title || "آدرس"}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                      {[addr.province, addr.city, addr.fullAddress]
                        .filter(Boolean)
                        .join("، ")}
                    </p>
                  </div>
                  {selectedAddressId === addr.id && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("cart")}
              className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              بازگشت
            </button>
            <button
              onClick={handleConfirmAddress}
              disabled={!selectedAddressId}
              className="flex-2 py-3.5 rounded-xl font-black text-white! text-[14px] disabled:opacity-40"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              ادامه
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && cart && (
        <div className="space-y-4">
          <div
            className="rounded-2xl overflow-hidden border"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ backgroundColor: "var(--color-emerald-light)" }}
            >
              <CreditCard
                className="w-4 h-4"
                style={{ color: "var(--color-emerald)" }}
              />
              <span
                className="text-[13px] font-black"
                style={{ color: "var(--color-emerald)" }}
              >
                خلاصه فاکتور و پرداخت
              </span>
            </div>
            {cart.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-4 py-3 border-t bg-white"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="text-[12px] text-gray-600 font-medium">
                  {item.productName} ×{" "}
                  {item.kind === "WEIGHT_RANGE"
                    ? `${item.weightGrams} گرم`
                    : item.quantity.toLocaleString("fa-IR")}
                </span>
                <span className="text-[12px] font-bold text-gray-800">
                  {fmtToman(item.lineTotalToman)} ت
                </span>
              </div>
            ))}
            {appliedDiscount && (
              <>
                <div
                  className="flex items-center justify-between px-4 py-2.5 border-t bg-white"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span className="text-[12px] text-gray-500 font-medium">
                    جمع اقلام
                  </span>
                  <span className="text-[12px] font-bold text-gray-700">
                    {fmtToman(appliedDiscount.subtotalToman)} ت
                  </span>
                </div>
                <div
                  className="flex items-center justify-between px-4 py-2.5 border-t bg-white"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span className="text-[12px] text-emerald-700 font-bold">
                    تخفیف ({appliedDiscount.code})
                  </span>
                  <span className="text-[12px] font-black text-emerald-700">
                    − {fmtToman(appliedDiscount.discountToman)} ت
                  </span>
                </div>
              </>
            )}
            <div
              className="flex items-center justify-between px-4 py-3.5 border-t bg-gray-50"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-[13px] font-bold text-gray-700">
                مبلغ قابل پرداخت
              </span>
              <span className="text-[17px] font-black text-gray-900">
                {fmtToman(payableToman)} تومان
              </span>
            </div>
          </div>

          {/* ── کد تخفیف ── */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h3 className="flex items-center gap-1.5 text-[13px] font-black text-gray-800">
              <TicketPercent className="w-4 h-4" /> کد تخفیف
            </h3>
            {appliedDiscount ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="min-w-0">
                  <p
                    className="text-[13px] font-black text-emerald-700"
                    dir="ltr"
                  >
                    {appliedDiscount.code}
                  </p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">
                    {fmtToman(appliedDiscount.discountToman)} تومان تخفیف اعمال
                    شد
                    {appliedDiscount.description
                      ? ` — ${appliedDiscount.description}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveDiscount}
                  disabled={checkoutLoading || payLoading}
                  className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100 shrink-0"
                  aria-label="حذف کد تخفیف"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  placeholder="مثلاً ARKAN-123456"
                  value={discountInput}
                  onChange={(e) => {
                    setDiscountInput(e.target.value.toUpperCase());
                    if (discountError) setDiscountError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyDiscount()}
                  maxLength={40}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-emerald-500 text-sm font-bold tracking-wide"
                />
                <button
                  type="button"
                  onClick={handleApplyDiscount}
                  disabled={discountLoading || !discountInput.trim()}
                  className="px-4 py-2.5 rounded-xl text-[13px] font-black text-white disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  {discountLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "اعمال"
                  )}
                </button>
              </div>
            )}
            {discountError && (
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {discountError}
              </p>
            )}
          </div>

          <div
            className="rounded-2xl p-4 space-y-3"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h3 className="flex items-center gap-1.5 text-[13px] font-black text-gray-800">
              <Gift className="w-4 h-4" /> گیرنده هر کالا
            </h3>
            {cart.items.map((item) => {
              const r = recipients[item.id] ?? { type: "SELF" as const, phone: "" };
              return (
                <div key={item.id} className="space-y-2">
                  <p className="text-[12px] text-gray-600 font-bold truncate">
                    {item.productName}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRecipients((prev) => ({
                          ...prev,
                          [item.id]: { type: "SELF", phone: "" },
                        }))
                      }
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold border-2 ${
                        r.type === "SELF"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <User className="w-3.5 h-3.5" /> برای خودم
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRecipients((prev) => ({
                          ...prev,
                          [item.id]: { type: "OTHER", phone: prev[item.id]?.phone ?? "" },
                        }))
                      }
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold border-2 ${
                        r.type === "OTHER"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <Gift className="w-3.5 h-3.5" /> برای فرد دیگر
                    </button>
                  </div>
                  {r.type === "OTHER" && (
                    <input
                      type="tel"
                      dir="ltr"
                      placeholder="شماره موبایل گیرنده (مثال: 09123456789)"
                      value={r.phone}
                      onChange={(e) =>
                        setRecipients((prev) => ({
                          ...prev,
                          [item.id]: {
                            type: "OTHER",
                            phone: e.target.value.replace(/\D/g, ""),
                          },
                        }))
                      }
                      maxLength={11}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
                    />
                  )}
                </div>
              );
            })}
            <p className="text-[10px] text-gray-400 leading-relaxed">
              برای شمش‌های طلا، مالکیت پس از تخصیص کد هولوگرام توسط اپراتور و
              تأیید هویت گیرنده نهایی می‌شود.
            </p>
          </div>

          {wallet && (
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-[12px] font-bold ${
                wallet.availableRial / 10 < payableToman
                  ? "bg-red-50 text-red-600 border border-red-100"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              <span>موجودی کیف پول</span>
              <span>{fmtToman(wallet.availableRial / 10)} تومان</span>
            </div>
          )}

          <div className="space-y-3">
            {gateways.length > 0 && !isFree && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {(["WALLET", "GATEWAY", "SPLIT"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPaymentMode(m)}
                      className={`py-2.5 rounded-xl text-[12px] font-bold border-2 ${
                        paymentMode === m
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      {m === "WALLET"
                        ? "کیف پول"
                        : m === "GATEWAY"
                          ? "درگاه پرداخت"
                          : "ترکیبی"}
                    </button>
                  ))}
                </div>

                {paymentMode !== "WALLET" && (
                  <select
                    value={selectedGateway}
                    onChange={(e) =>
                      setSelectedGateway(
                        e.target.value as "ZARINPAL" | "BEHPARDAKHT",
                      )
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
                  >
                    <option value="">انتخاب درگاه...</option>
                    {gateways.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                )}

                {paymentMode === "SPLIT" && (
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="مبلغ از کیف‌پول (تومان)"
                    value={walletPortionToman}
                    onChange={(e) =>
                      setWalletPortionToman(
                        e.target.value.replace(/[^0-9]/g, ""),
                      )
                    }
                    dir="ltr"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-left text-[15px] font-bold"
                  />
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("address")}
                disabled={checkoutLoading || payLoading}
                className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                بازگشت
              </button>
              <button
                onClick={handlePlaceOrder}
                disabled={
                  checkoutLoading ||
                  payLoading ||
                  (gateways.length > 0 &&
                    !isFree &&
                    paymentMode !== "WALLET" &&
                    !selectedGateway)
                }
                className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {checkoutLoading || payLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    ثبت سفارش و پرداخت
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "done" && order && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-[18px] font-black text-gray-900 mb-2">
            سفارش با موفقیت ثبت و پرداخت شد
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            سفارش شما در حال آماده‌سازی است و به‌زودی ارسال خواهد شد.
          </p>
          {Number(order.discountToman) > 0 && (
            <p className="-mt-3 mb-6 text-[12px] font-bold text-emerald-700">
              با کد تخفیف {order.discountCode}،{" "}
              {fmtToman(order.discountToman)} تومان صرفه‌جویی کردید
            </p>
          )}
          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/shop"
              className="py-3.5 rounded-xl font-black text-white! text-[14px]"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              بازگشت به فروشگاه
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}


export default function ShopCartPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
        </div>
      }
    >
      <ShopCartPageInner />
    </Suspense>
  );
}
