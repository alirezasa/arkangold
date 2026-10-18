"use client";
// فرم افزودن آدرس جدید (inline) — مشترک بین صفحات تحویل فیزیکی
import { useState } from "react";
import axios from "axios";
import { AlertCircle, Loader2 } from "lucide-react";
import type { AddressItem } from "@/app/hooks/usePhysicalDelivery";
import { digitsOnly } from "@/app/utils/digits";

// ─────────────────────────────────────────────
// فرم افزودن آدرس جدید (inline)
// ─────────────────────────────────────────────
export default function AddAddressForm({
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
          onChange={(e) =>
            setForm((f) => ({ ...f, receiverName: e.target.value }))
          }
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
        onChange={(e) =>
          setForm((f) => ({ ...f, fullAddress: e.target.value }))
        }
        className="w-full px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white resize-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="tel"
          dir="ltr"
          placeholder="کد پستی"
          maxLength={10}
          value={form.postalCode}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              postalCode: digitsOnly(e.target.value),
            }))
          }
          className="px-3 py-2.5 rounded-xl text-[13px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white text-left"
        />
        <input
          type="tel"
          dir="ltr"
          placeholder="شماره تماس گیرنده"
          maxLength={11}
          value={form.receiverPhone}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              receiverPhone: digitsOnly(e.target.value),
            }))
          }
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