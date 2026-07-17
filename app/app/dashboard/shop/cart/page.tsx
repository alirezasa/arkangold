"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import {
  useCart,
  useUpdateCartItem,
  useCheckout,
  usePayShopOrder,
  CartItemDto,
  ShopOrderDto,
} from "@/app/hooks/useShop";
import { useAddresses } from "@/app/hooks/usePhysicalDelivery";
import { useWallet } from "@/app/hooks/useWallet";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

type Step = "cart" | "address" | "confirm" | "done";

function CartRow({
  item,
  onChange,
  onRemove,
}: {
  item: CartItemDto;
  onChange: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-4 border-b border-gray-100 last:border-0">
      <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center text-rose-300 shrink-0">
        <ShoppingBag className="w-6 h-6" />
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
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onChange(item.id, Math.max(1, item.quantity - 1))}
          className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-6 text-center text-[13px] font-bold">
          {item.quantity.toLocaleString("fa-IR")}
        </span>
        <button
          onClick={() =>
            onChange(item.id, Math.min(item.stockQuantity, item.quantity + 1))
          }
          className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
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
  );
}

export default function ShopCartPage() {
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
  const { loading: payLoading, error: payError, pay } = usePayShopOrder();

  const [step, setStep] = useState<Step>("cart");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [order, setOrder] = useState<ShopOrderDto | null>(null);

  const handleQtyChange = async (itemId: string, qty: number) => {
    await update(itemId, qty);
    refresh();
  };

  const handleRemove = async (itemId: string) => {
    await remove(itemId);
    refresh();
  };

  const handleGoToAddress = () => {
    if (!cart || cart.items.length === 0) return;
    setCheckoutError(null);
    setStep("address");
  };

  const handleConfirmAddress = () => {
    if (!selectedAddressId) return setCheckoutError("یک آدرس را انتخاب کنید");
    setCheckoutError(null);
    setStep("confirm");
  };

  const handlePlaceOrder = async () => {
    const res = await checkout(selectedAddressId);
    if (res) {
      setOrder(res);
      const payRes = await pay(res.id);
      if (payRes) {
        setStep("done");
        refresh();
      }
    }
  };

  const error = checkoutError || payError;

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
                    onChange={handleQtyChange}
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

              <button
                onClick={handleGoToAddress}
                disabled={cart.items.some((i) => !i.available)}
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
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
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
                  {item.productName} × {item.quantity.toLocaleString("fa-IR")}
                </span>
                <span className="text-[12px] font-bold text-gray-800">
                  {fmtToman(item.lineTotalToman)} ت
                </span>
              </div>
            ))}
            <div
              className="flex items-center justify-between px-4 py-3.5 border-t bg-gray-50"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-[13px] font-bold text-gray-700">
                مبلغ قابل پرداخت
              </span>
              <span className="text-[17px] font-black text-gray-900">
                {fmtToman(cart.totalToman)} تومان
              </span>
            </div>
          </div>

          {wallet && (
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-[12px] font-bold ${
                wallet.availableRial / 10 < cart.totalToman
                  ? "bg-red-50 text-red-600 border border-red-100"
                  : "bg-gray-50 text-gray-600"
              }`}
            >
              <span>موجودی کیف پول</span>
              <span>{fmtToman(wallet.availableRial / 10)} تومان</span>
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
              disabled={checkoutLoading || payLoading}
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {checkoutLoading || payLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "پرداخت از کیف پول"
              )}
            </button>
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
          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/shop"
              className="py-3.5 rounded-xl font-black text-white text-[14px]"
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
