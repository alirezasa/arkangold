"use client";
// فرم افزودن/ویرایش آدرس — مشترک بین دفترچه‌ی آدرس، سبد خرید و تحویل فیزیکی.
// استان از فهرست استاندارد انتخاب می‌شود تا روش‌ها و هزینه‌ی ارسال درست محاسبه شوند.
import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { AddressItem } from "@/app/hooks/usePhysicalDelivery";
import { type AddressInput, useAddressActions, useProvinces } from "@/app/hooks/useShipping";
import { digitsOnly } from "@/app/utils/digits";

const inputCls =
  "w-full px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white";
const TITLE_PRESETS = ["منزل", "محل کار", "والدین"];

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="block text-[11px] font-bold text-gray-500 mb-1">
      {children}
      {required && <span className="text-red-500 mr-0.5">*</span>}
    </span>
  );
}

export default function AddressForm({
  address,
  onSuccess,
  onCancel,
  submitLabel,
}: {
  /** آدرس موجود برای ویرایش؛ خالی = آدرس جدید */
  address?: AddressItem | null;
  onSuccess: (address: AddressItem) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { provinces, loading: provincesLoading } = useProvinces();
  const { busy, error, setError, save } = useAddressActions();
  const [form, setForm] = useState<AddressInput>({
    title: address?.title ?? "",
    provinceCode: address?.provinceCode ?? "",
    city: address?.city ?? "",
    postalCode: address?.postalCode ?? "",
    fullAddress: address?.fullAddress ?? "",
    plaque: address?.plaque ?? "",
    unit: address?.unit ?? "",
    receiverName: address?.receiverName ?? "",
    receiverPhone: address?.receiverPhone ?? "",
    isDefault: address?.isDefault ?? false,
  });
  const set = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (error) setError(null);
  };
  const province = provinces.find((p) => p.code === form.provinceCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.provinceCode) return setError("استان را انتخاب کنید");
    if (form.city.trim().length < 2) return setError("شهر را وارد کنید");
    if (form.fullAddress.trim().length < 10) return setError("نشانی کامل را حداقل ۱۰ کاراکتر وارد کنید");
    if (form.postalCode && !/^\d{10}$/.test(form.postalCode)) return setError("کد پستی باید ۱۰ رقم باشد");
    if (form.receiverName.trim().length < 3) return setError("نام و نام خانوادگی تحویل‌گیرنده را وارد کنید");
    if (!/^09\d{9}$/.test(form.receiverPhone)) return setError("شماره موبایل تحویل‌گیرنده باید ۱۱ رقم و با ۰۹ شروع شود");
    const saved = await save(form, address?.id);
    if (saved) onSuccess(saved);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-[12px] font-bold text-red-600 bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div>
        <Label>عنوان آدرس</Label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="مثلاً منزل"
            maxLength={40}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            className={inputCls}
          />
          {TITLE_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("title", t)}
              className={`shrink-0 px-2.5 rounded-xl text-[11px] font-bold border ${
                form.title === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-500 bg-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label>
          <Label required>استان</Label>
          <select
            value={form.provinceCode}
            onChange={(e) => {
              // با تغییر استان، شهر مرکز استان پیشنهاد می‌شود
              const p = provinces.find((x) => x.code === e.target.value);
              setForm((f) => ({ ...f, provinceCode: e.target.value, city: p?.capital ?? "" }));
              if (error) setError(null);
            }}
            className={inputCls}
            disabled={provincesLoading}
          >
            <option value="">{provincesLoading ? "در حال بارگذاری..." : "انتخاب استان"}</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label required>شهر</Label>
          <input
            type="text"
            list="address-form-cities"
            placeholder={province ? `مثلاً ${province.capital}` : "شهر"}
            maxLength={60}
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            className={inputCls}
          />
          <datalist id="address-form-cities">
            {province?.cities.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
      </div>

      <label className="block">
        <Label required>نشانی کامل پستی</Label>
        <textarea
          rows={3}
          placeholder="خیابان، کوچه، ساختمان و نشانه‌های دقیق"
          maxLength={500}
          value={form.fullAddress}
          onChange={(e) => set("fullAddress", e.target.value)}
          className={`${inputCls} resize-none`}
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label>
          <Label>پلاک</Label>
          <input type="text" maxLength={20} value={form.plaque} onChange={(e) => set("plaque", e.target.value)} className={inputCls} />
        </label>
        <label>
          <Label>واحد</Label>
          <input type="text" maxLength={20} value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls} />
        </label>
        <label>
          <Label>کد پستی</Label>
          <input
            type="tel"
            dir="ltr"
            inputMode="numeric"
            maxLength={10}
            placeholder="۱۰ رقم"
            value={form.postalCode}
            onChange={(e) => set("postalCode", digitsOnly(e.target.value))}
            className={`${inputCls} text-left`}
          />
        </label>
      </div>
      {!form.postalCode && (
        <p className="text-[10px] text-amber-600 -mt-1">ارسال پستی بدون کد پستی ۱۰ رقمی امکان‌پذیر نیست.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label>
          <Label required>نام تحویل‌گیرنده</Label>
          <input
            type="text"
            maxLength={80}
            value={form.receiverName}
            onChange={(e) => set("receiverName", e.target.value)}
            className={inputCls}
          />
        </label>
        <label>
          <Label required>موبایل تحویل‌گیرنده</Label>
          <input
            type="tel"
            dir="ltr"
            inputMode="numeric"
            placeholder="09xxxxxxxxx"
            maxLength={11}
            value={form.receiverPhone}
            onChange={(e) => set("receiverPhone", digitsOnly(e.target.value))}
            className={`${inputCls} text-left`}
          />
        </label>
      </div>

      {!address?.isDefault && (
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
          <input type="checkbox" checked={!!form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} />
          آدرس پیش‌فرض من باشد
        </label>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
          >
            انصراف
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex-2 py-2.5 rounded-xl font-bold text-white text-[13px] flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (submitLabel ?? (address ? "ذخیره تغییرات" : "ثبت آدرس"))}
        </button>
      </div>
    </form>
  );
}
