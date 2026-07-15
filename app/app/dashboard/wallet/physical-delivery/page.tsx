"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Package,
  MapPin,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Truck,
  ShieldCheck,
  XCircle,
  X,
  Coins,
  Info,
  Home,
  Building2,
} from "lucide-react";
import axios from "axios";
import {
  useAddresses,
  usePhysicalDeliveryConfig,
  usePhysicalDeliveryRequests,
  useCreatePhysicalDelivery,
  useCancelPhysicalDelivery,
  AddressItem,
  PhysicalDeliveryRequestItem,
} from "@/app/hooks/usePhysicalDelivery";
import { useWallet } from "@/app/hooks/useWallet";

// ── نگاشت وضعیت‌ها ──
const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  PENDING: { label: "در انتظار بررسی", color: "#b45309", bg: "#fef3c7", icon: Clock },
  APPROVED: { label: "تایید شده", color: "#2563eb", bg: "#dbeafe", icon: ShieldCheck },
  SHIPPED: { label: "ارسال شده", color: "#7c3aed", bg: "#ede9fe", icon: Truck },
  DELIVERED: { label: "تحویل داده شده", color: "#16a34a", bg: "#dcfce7", icon: CheckCircle2 },
  CANCELLED: { label: "لغو شده", color: "#dc2626", bg: "#fee2e2", icon: XCircle },
};

const TIMELINE_STEPS = [
  { key: "PENDING", label: "ثبت درخواست", icon: Clock },
  { key: "APPROVED", label: "تایید کارشناسان", icon: ShieldCheck },
  { key: "SHIPPED", label: "ارسال مرسوله", icon: Truck },
  { key: "DELIVERED", label: "تحویل نهایی", icon: CheckCircle2 },
];

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

function fmtGrams(v: string | number) {
  return Number(v).toLocaleString("fa-IR", { maximumFractionDigits: 4 });
}
function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

// ─────────────────────────────────────────────
// فرم افزودن آدرس جدید (inline)
// ─────────────────────────────────────────────
function AddAddressForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (address: AddressItem) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    province: "",
    city: "",
    postalCode: "",
    fullAddress: "",
    receiverName: "",
    receiverPhone: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.fullAddress.trim().length < 10) {
      return setError("آدرس کامل را حداقل ۱۰ کاراکتر وارد کنید");
    }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post("/api/user/addresses", form);
      onSuccess(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message;
        setError(Array.isArray(msg) ? msg[0] : msg || "خطا در ثبت آدرس");
      } else setError("خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-[12px] font-bold text-red-600 bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="عنوان (مثلاً منزل)"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white"
        />
        <input
          type="text"
          placeholder="نام گیرنده"
          value={form.receiverName}
          onChange={(e) => setForm((f) => ({ ...f, receiverName: e.target.value }))}
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="استان"
          value={form.province}
          onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white"
        />
        <input
          type="text"
          placeholder="شهر"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white"
        />
      </div>

      <textarea
        rows={3}
        placeholder="آدرس کامل پستی"
        value={form.fullAddress}
        onChange={(e) => setForm((f) => ({ ...f, fullAddress: e.target.value }))}
        className="w-full px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white resize-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="tel"
          dir="ltr"
          placeholder="کد پستی"
          maxLength={10}
          value={form.postalCode}
          onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value.replace(/\D/g, "") }))}
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white text-left"
        />
        <input
          type="tel"
          dir="ltr"
          placeholder="شماره تماس گیرنده"
          maxLength={11}
          value={form.receiverPhone}
          onChange={(e) => setForm((f) => ({ ...f, receiverPhone: e.target.value.replace(/\D/g, "") }))}
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white text-left"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          انصراف
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-2 py-2.5 rounded-xl font-bold text-white text-[13px] flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "ثبت آدرس"}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────
// مودال ثبت درخواست جدید
// ─────────────────────────────────────────────
type CreateStep = "select-address" | "enter-amount" | "confirm" | "done";

function CreateRequestModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addresses, loading: addressesLoading, refresh: refreshAddresses } = useAddresses();
  const { config } = usePhysicalDeliveryConfig();
  const { wallet } = useWallet();
  const { loading, error, setError, create } = useCreatePhysicalDelivery();

  const [step, setStep] = useState<CreateStep>("select-address");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [amountGrams, setAmountGrams] = useState("");
  const [result, setResult] = useState<{ requestId: string } | null>(null);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
  const grams = parseFloat(amountGrams) || 0;
  const feePerGram = config ? Number(config.feePerGramToman) : 0;
  const totalFeeToman = grams * feePerGram;

  const reset = () => {
    setStep("select-address");
    setShowAddForm(false);
    setSelectedAddressId("");
    setAmountGrams("");
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    onClose();
    setTimeout(reset, 300);
  };

  const handleSelectAddress = () => {
    if (!selectedAddressId) return setError("یک آدرس را انتخاب کنید");
    setError(null);
    setStep("enter-amount");
  };

  const handleSubmitAmount = () => {
    if (!config) return;
    if (!grams || grams <= 0) return setError("مقدار را وارد کنید");
    if (grams < config.minGrams) return setError(`حداقل مقدار درخواست ${config.minGrams} گرم است`);
    if (grams > config.maxGrams) return setError(`حداکثر مقدار درخواست ${config.maxGrams} گرم است`);
    if (wallet && grams > wallet.availableGrams) {
      return setError(
        `موجودی طلای قابل استفاده کافی نیست (موجودی: ${wallet.availableGrams.toFixed(4)} گرم)`,
      );
    }
    setError(null);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    const res = await create({ addressId: selectedAddressId, amountGrams: grams });
    if (res) {
      setResult({ requestId: res.id });
      setStep("done");
      onCreated();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-0 sm:p-4"
      dir="rtl"
      onClick={handleClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "var(--color-emerald-light)" }}
            >
              <Package className="w-5 h-5" style={{ color: "var(--color-emerald)" }} />
            </div>
            <h2 className="text-[15px] font-black text-gray-900">درخواست تحویل فیزیکی طلا</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {step === "select-address" && (
            <div className="space-y-3">
              {showAddForm ? (
                <AddAddressForm
                  onCancel={() => setShowAddForm(false)}
                  onSuccess={(addr) => {
                    refreshAddresses();
                    setSelectedAddressId(addr.id);
                    setShowAddForm(false);
                  }}
                />
              ) : (
                <>
                  <p className="text-[13px] font-bold text-gray-700">آدرس تحویل را انتخاب کنید</p>

                  {addressesLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                    </div>
                  ) : addresses.length === 0 ? (
                    <div className="text-center py-8">
                      <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-[13px] text-gray-400 font-medium">هنوز آدرسی ثبت نکرده‌اید</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {addresses.map((addr) => (
                        <button
                          key={addr.id}
                          onClick={() => {
                            setSelectedAddressId(addr.id);
                            setError(null);
                          }}
                          className={`w-full flex items-start gap-3 p-3.5 rounded-xl border-2 text-right transition-all ${
                            selectedAddressId === addr.id
                              ? "border-emerald-500 bg-emerald-50"
                              : "border-gray-100 bg-gray-50 hover:border-gray-200"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              selectedAddressId === addr.id ? "bg-emerald-100" : "bg-white"
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
                              {addr.title || "آدرس"}{" "}
                              {addr.isDefault && (
                                <span className="text-[10px] font-bold text-amber-600">(پیش‌فرض)</span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                              {[addr.province, addr.city, addr.fullAddress].filter(Boolean).join("، ")}
                            </p>
                          </div>
                          {selectedAddressId === addr.id && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setShowAddForm(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold border-2 border-dashed border-gray-200 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    افزودن آدرس جدید
                  </button>

                  <button
                    onClick={handleSelectAddress}
                    disabled={!selectedAddressId}
                    className="w-full py-3.5 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
                    style={{ backgroundColor: "var(--color-emerald)" }}
                  >
                    ادامه
                  </button>
                </>
              )}
            </div>
          )}

          {step === "enter-amount" && (
            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">
                  مقدار طلای درخواستی (گرم)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    placeholder="0.0000"
                    value={amountGrams}
                    onChange={(e) => {
                      setAmountGrams(e.target.value.replace(/[^0-9.]/g, ""));
                      setError(null);
                    }}
                    className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[20px] font-black text-gray-800 bg-gray-50 transition-all"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-gray-400">
                    گرم
                  </span>
                </div>
                {config && (
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    بازه مجاز: {config.minGrams} تا {config.maxGrams} گرم
                  </p>
                )}
              </div>

              {wallet && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50">
                  <span className="text-[12px] text-gray-500 font-medium">موجودی قابل استفاده</span>
                  <span className="text-[13px] font-black text-gray-800">
                    {wallet.availableGrams.toFixed(4)} گرم
                  </span>
                </div>
              )}

              {config && grams > 0 && (
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: "rgba(197,160,89,.1)" }}
                >
                  <span className="text-[12px] font-bold text-amber-800">کارمزد بسته‌بندی تخمینی</span>
                  <span className="text-[13px] font-black text-amber-900">
                    {fmtToman(totalFeeToman)} تومان
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("select-address")}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  بازگشت
                </button>
                <button
                  onClick={handleSubmitAmount}
                  className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px]"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  ادامه
                </button>
              </div>
            </div>
          )}

          {step === "confirm" && config && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                {[
                  { label: "آدرس تحویل", value: selectedAddress?.title || "—" },
                  {
                    label: "جزئیات آدرس",
                    value: [selectedAddress?.province, selectedAddress?.city, selectedAddress?.fullAddress]
                      .filter(Boolean)
                      .join("، "),
                    small: true,
                  },
                  { label: "مقدار طلا", value: `${fmtGrams(grams)} گرم`, big: true },
                  { label: "کارمزد بسته‌بندی و پلمپ", value: `${fmtToman(totalFeeToman)} تومان` },
                  { label: "زمان تقریبی پردازش", value: config.processingTime },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-start justify-between gap-3 px-4 py-3 border-t first:border-t-0 ${
                      row.big ? "bg-gray-50" : "bg-white"
                    }`}
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span className="text-[12px] text-gray-500 font-medium shrink-0">{row.label}</span>
                    <span
                      className={
                        row.big
                          ? "text-[16px] font-black text-gray-900"
                          : row.small
                            ? "text-[11px] font-medium text-gray-600 text-left leading-relaxed"
                            : "text-[13px] font-bold text-gray-700"
                      }
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 px-1 text-[11px] text-gray-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p>
                  با ثبت درخواست، مقدار طلای انتخابی تا زمان تایید یا لغو توسط کارشناسان رزرو می‌شود و
                  کارمزد فقط در صورت تایید نهایی از کیف پول شما کسر خواهد شد.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("enter-amount")}
                  disabled={loading}
                  className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  بازگشت
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ثبت درخواست"}
                </button>
              </div>
            </div>
          )}

          {step === "done" && result && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--color-emerald-light)" }}
              >
                <CheckCircle2 className="w-9 h-9" style={{ color: "var(--color-emerald)" }} />
              </div>
              <div>
                <h3 className="text-[16px] font-black text-gray-900 mb-1">درخواست ثبت شد</h3>
                <p className="text-[12px] text-gray-500 leading-relaxed">
                  {fmtGrams(grams)} گرم طلا رزرو شد و درخواست شما در انتظار بررسی کارشناسان است.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-full py-3.5 rounded-xl font-black text-white text-[14px]"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                بستن
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// مودال جزئیات + تایم‌لاین وضعیت
// ─────────────────────────────────────────────
function DetailModal({
  request,
  onClose,
  onCancelled,
}: {
  request: PhysicalDeliveryRequestItem;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { loading, cancel } = useCancelPhysicalDelivery();
  const isCancelled = request.status === "CANCELLED";
  const currentStepIndex = TIMELINE_STEPS.findIndex((s) => s.key === request.status);

  const handleCancel = async () => {
    await cancel(request.id);
    onCancelled();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div>
            <h3 className="text-[14px] font-black text-gray-900">جزئیات درخواست</h3>
            <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
              {request.id.slice(0, 8)}…
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <div className="flex items-center justify-between">
            <StatusBadge status={request.status} />
            <span className="text-[16px] font-black text-gray-900">
              {fmtGrams(request.amountGrams)} گرم
            </span>
          </div>

          {!isCancelled ? (
            <div className="flex items-center justify-between px-2">
              {TIMELINE_STEPS.map((step, i) => {
                const Icon = step.icon;
                const done = i <= currentStepIndex;
                return (
                  <div key={step.key} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && (
                      <div
                        className="absolute top-4 right-1/2 w-full h-0.5 -z-10"
                        style={{ backgroundColor: i <= currentStepIndex ? "var(--color-emerald)" : "#e5e7eb" }}
                      />
                    )}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border-2 bg-white"
                      style={{
                        borderColor: done ? "var(--color-emerald)" : "#e5e7eb",
                        color: done ? "var(--color-emerald)" : "#9ca3af",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className="text-[9px] font-bold mt-1.5 text-center leading-tight"
                      style={{ color: done ? "var(--color-emerald)" : "#9ca3af" }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              این درخواست لغو شده است
              {request.adminNotes && (
                <span className="font-medium block mt-1">{request.adminNotes}</span>
              )}
            </div>
          )}

          <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            {[
              { label: "کارمزد", value: `${fmtToman(request.feeToman)} تومان` },
              {
                label: "آدرس",
                value: [request.address?.province, request.address?.city, request.address?.fullAddress]
                  .filter(Boolean)
                  .join("، "),
                small: true,
              },
              ...(request.trackingCode
                ? [{ label: "کد رهگیری مرسوله", value: request.trackingCode, ltr: true }]
                : []),
              {
                label: "تاریخ ثبت",
                value: new Date(request.createdAt).toLocaleDateString("fa-IR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
              },
            ].map((row, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 px-4 py-3 border-t first:border-t-0 bg-white"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="text-[12px] text-gray-500 font-medium shrink-0">{row.label}</span>
                <span
                  className={`text-[12px] font-bold text-gray-700 ${row.small ? "text-left leading-relaxed" : ""}`}
                  dir={row.ltr ? "ltr" : undefined}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {request.status === "PENDING" && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-[13px] text-red-600 border-2 border-red-100 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "لغو درخواست"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// صفحه اصلی
// ─────────────────────────────────────────────
export default function PhysicalDeliveryPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PhysicalDeliveryRequestItem | null>(null);

  const { config } = usePhysicalDeliveryConfig();
  const { requests, loading, refresh } = usePhysicalDeliveryRequests();

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">تحویل فیزیکی طلا</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">دریافت پستی شمش طلا</p>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl p-5 mb-5"
        style={{ background: "linear-gradient(135deg, var(--color-emerald) 0%, #24060a 100%)" }}
      >
        <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full opacity-10 blur-2xl bg-gold-500 pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
            <Package className="w-5 h-5" style={{ color: "var(--color-gold-500)" }} />
          </div>
          <div>
            <p className="text-[13px] font-black text-white">تحویل طلای فیزیکی</p>
            {config && (
              <p className="text-[11px] text-white/60 mt-0.5">
                از {config.minGrams} تا {config.maxGrams} گرم — {config.processingTime}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="relative z-10 w-full py-3 rounded-xl font-black text-[13px] flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          ثبت درخواست جدید
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-black text-gray-700">درخواست‌های من</h2>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Package className="w-10 h-10 text-gray-300" />
            <p className="text-[13px] font-bold text-gray-400">هنوز درخواستی ثبت نکرده‌اید</p>
          </div>
        ) : (
          requests.map((r, idx) => (
            <button
              key={r.id}
              onClick={() => setSelectedRequest(r)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-gray-50"
              style={{ borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: "var(--color-emerald-light)" }}
              >
                <Coins className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-black text-gray-800">{fmtGrams(r.amountGrams)} گرم طلا</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(r.createdAt).toLocaleDateString("fa-IR", { month: "short", day: "numeric" })}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </button>
          ))
        )}
      </div>

      <CreateRequestModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreated={refresh} />

      {selectedRequest && (
        <DetailModal request={selectedRequest} onClose={() => setSelectedRequest(null)} onCancelled={refresh} />
      )}
    </div>
  );
}