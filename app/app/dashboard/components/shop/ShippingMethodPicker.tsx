"use client";
// انتخاب روش ارسال بر اساس آدرس: پیک، پست عادی/پیشتاز، پست خصوصی، تحویل حضوری.
// هزینه‌ها برآورد سرور طبق تعرفه‌ی منطقه‌ی آدرس است؛ مبلغ قطعی هنگام ثبت سفارش دوباره محاسبه می‌شود.
import { AlertCircle, Bike, CheckCircle2, Clock, Gift, Loader2, Mail, Store, Truck } from "lucide-react";
import { etaLabel, type ShippingMethodType, type ShippingOption } from "@/app/hooks/useShipping";

const TYPE_ICON: Record<ShippingMethodType, React.ElementType> = {
  COURIER: Bike,
  POST: Mail,
  EXPRESS: Truck,
  PICKUP: Store,
};

const fmt = (v: string | number) => Math.round(Number(v)).toLocaleString("fa-IR");

/** مبلغ ارسالی که با انتخاب فعلی به سفارش افزوده می‌شود (تومان) */
export function shippingChargeToman(option: ShippingOption | null | undefined, payOnDelivery: boolean) {
  if (!option || option.free) return 0;
  if (option.feePayment === "ON_DELIVERY") return 0;
  if (option.feePayment === "CUSTOMER_CHOICE" && payOnDelivery) return 0;
  return Number(option.prepaidChargeToman);
}

/** آیا هزینه‌ی ارسال هنگام تحویل (پس‌کرایه) پرداخت می‌شود؟ */
export function isPayOnDelivery(option: ShippingOption | null | undefined, payOnDelivery: boolean) {
  if (!option || option.free || Number(option.feeToman) <= 0) return false;
  return option.feePayment === "ON_DELIVERY" || (option.feePayment === "CUSTOMER_CHOICE" && payOnDelivery);
}

export default function ShippingMethodPicker({
  options,
  loading,
  error,
  selectedId,
  onSelect,
  payOnDelivery,
  onPayOnDeliveryChange,
}: {
  options: ShippingOption[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (methodId: string) => void;
  payOnDelivery: boolean;
  onPayOnDeliveryChange: (v: boolean) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> محاسبه‌ی روش‌ها و هزینه‌ی ارسال...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl text-[12px] font-bold text-red-600 bg-red-50 border border-red-100">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl text-[12px] font-bold text-amber-700 bg-amber-50 border border-amber-100">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        برای این آدرس روش ارسالی تعریف نشده است. آدرس دیگری انتخاب کنید یا با پشتیبانی تماس بگیرید.
      </div>
    );
  }

  return (
    <div className="space-y-2" role="radiogroup" aria-label="روش ارسال">
      {options.map((o) => {
        const Icon = TYPE_ICON[o.type] ?? Truck;
        const selected = selectedId === o.methodId;
        const eta = etaLabel(o.etaMinDays, o.etaMaxDays);
        const fee = Number(o.feeToman);
        let priceLabel: string;
        if (fee <= 0) priceLabel = "رایگان";
        else if (o.free) priceLabel = "رایگان";
        else if (o.feePayment === "ON_DELIVERY") priceLabel = "پس‌کرایه";
        else priceLabel = `${fmt(fee)} ت`;

        return (
          <div key={o.methodId}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!o.available}
              onClick={() => onSelect(o.methodId)}
              className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-right transition-all disabled:opacity-55 disabled:cursor-not-allowed ${
                selected ? "border-emerald-500 bg-emerald-50" : "border-gray-100 bg-gray-50 hover:border-gray-200"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-emerald-100" : "bg-white"}`}>
                <Icon className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-black text-gray-800">{o.name}</p>
                  <span className={`text-[12px] font-black shrink-0 ${o.free || fee <= 0 ? "text-emerald-600" : "text-gray-800"}`}>
                    {priceLabel}
                  </span>
                </div>
                {(o.carrierName || eta) && (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
                    {o.carrierName && <span>{o.carrierName}</span>}
                    {eta && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {eta}
                      </span>
                    )}
                  </p>
                )}
                {o.description && <p className="text-[11px] text-gray-400 mt-0.5">{o.description}</p>}
                {o.type === "PICKUP" && o.pickupAddress && (
                  <p className="text-[11px] text-gray-600 mt-1">
                    نشانی دفتر: {o.pickupAddress}
                    {o.pickupHours ? ` — ${o.pickupHours}` : ""}
                  </p>
                )}
                {o.free && fee > 0 && (
                  <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-1">
                    <Gift className="w-3 h-3" /> ارسال رایگان (هدیه‌ی خرید؛ {fmt(fee)} تومان صرفه‌جویی)
                  </p>
                )}
                {!o.free && o.feePayment === "ON_DELIVERY" && fee > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    هزینه‌ی ارسال (حدود {fmt(fee)} تومان) هنگام تحویل به مأمور پست/حمل پرداخت می‌شود.
                  </p>
                )}
                {!o.available && o.unavailableReason && (
                  <p className="text-[11px] font-bold text-red-600 mt-1">{o.unavailableReason}</p>
                )}
              </div>
              {selected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />}
            </button>

            {selected && o.feePayment === "CUSTOMER_CHOICE" && !o.free && fee > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {[
                  { v: false, label: "پرداخت همراه سفارش", hint: `${fmt(fee)} تومان` },
                  { v: true, label: "پس‌کرایه", hint: "پرداخت هنگام تحویل" },
                ].map((c) => (
                  <button
                    key={String(c.v)}
                    type="button"
                    onClick={() => onPayOnDeliveryChange(c.v)}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold border-2 ${
                      payOnDelivery === c.v ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 bg-white"
                    }`}
                  >
                    {c.label}
                    <span className="block text-[10px] font-medium opacity-80">{c.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {options.some((o) => !o.free && o.freeAboveToman && Number(o.feeToman) > 0) && (
        <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Gift className="w-3.5 h-3.5 shrink-0" />
          {options
            .filter((o) => !o.free && o.freeAboveToman && Number(o.feeToman) > 0)
            .map((o) => `${o.name} برای خرید بالای ${fmt(o.freeAboveToman!)} تومان رایگان است`)
            .join("؛ ")}
        </p>
      )}
    </div>
  );
}
