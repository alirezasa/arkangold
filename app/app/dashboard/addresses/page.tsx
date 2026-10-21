"use client";
// دفترچه‌ی آدرس کاربر: افزودن، ویرایش، حذف و انتخاب آدرس پیش‌فرض.
// هنگام ثبت سفارش همین آدرس‌ها نمایش داده می‌شوند و روش‌ها و هزینه‌ی ارسال بر اساس استان و شهر آن‌ها تعیین می‌شود.
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Home,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  User,
} from "lucide-react";
import { useAddresses, type AddressItem } from "@/app/hooks/usePhysicalDelivery";
import { formatAddressLine, useAddressActions } from "@/app/hooks/useShipping";
import AddressForm from "@/app/dashboard/components/address/AddressForm";

const MAX_ADDRESSES = 10;

function AddressCard({
  address,
  onEdit,
  onChanged,
}: {
  address: AddressItem;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { busy, error, remove, setDefault } = useAddressActions();

  const handleDelete = async () => {
    if (!window.confirm(`آدرس «${address.title || "بدون عنوان"}» حذف شود؟ سفارش‌های قبلی تغییری نمی‌کنند.`)) return;
    if (await remove(address.id)) onChanged();
  };
  const handleDefault = async () => {
    if (await setDefault(address.id)) onChanged();
  };

  const Icon = address.title?.includes("کار") ? Building2 : Home;
  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        backgroundColor: "var(--color-surface)",
        border: address.isDefault ? "2px solid var(--color-emerald)" : "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gray-50">
          <Icon className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-black text-gray-800">{address.title || "آدرس"}</p>
            {address.isDefault && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> پیش‌فرض
              </span>
            )}
          </div>
          <p className="text-[12px] text-gray-600 mt-1 leading-relaxed">{formatAddressLine(address)}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-500">
            {address.postalCode && (
              <span>
                کد پستی: <span dir="ltr">{address.postalCode}</span>
              </span>
            )}
            {address.receiverName && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {address.receiverName}
              </span>
            )}
            {address.receiverPhone && (
              <span className="flex items-center gap-1" dir="ltr">
                <Phone className="w-3 h-3" /> {address.receiverPhone}
              </span>
            )}
          </div>
        </div>
      </div>

      {address.incomplete && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          برای محاسبه‌ی دقیق هزینه‌ی ارسال، استان، شهر و کد پستی این آدرس را تکمیل کنید.
        </div>
      )}
      {error && <p className="text-[11px] font-bold text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
        >
          <Pencil className="w-3.5 h-3.5" /> ویرایش
        </button>
        {!address.isDefault && (
          <button
            type="button"
            onClick={handleDefault}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <Star className="w-3.5 h-3.5" /> پیش‌فرض شود
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="mr-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border border-red-100 text-red-600 bg-white hover:bg-red-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} حذف
        </button>
      </div>
    </div>
  );
}

export default function AddressesPage() {
  const { addresses, loading, refresh } = useAddresses();
  const [editing, setEditing] = useState<AddressItem | "new" | null>(null);

  const done = () => {
    setEditing(null);
    void refresh();
  };

  return (
    <div className="max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/settings"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[17px] font-black text-gray-900">آدرس‌های من</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            آدرس‌های تحویل سفارش؛ روش و هزینه‌ی ارسال بر اساس استان و شهر هر آدرس محاسبه می‌شود
          </p>
        </div>
      </div>

      {editing ? (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <h2 className="flex items-center gap-2 text-[14px] font-black text-gray-800">
            <MapPin className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
            {editing === "new" ? "آدرس جدید" : `ویرایش «${editing.title || "آدرس"}»`}
          </h2>
          <AddressForm
            key={editing === "new" ? "new" : editing.id}
            address={editing === "new" ? null : editing}
            onSuccess={done}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-gray-300" />
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-2xl border-2 border-dashed border-gray-200">
              <MapPin className="w-10 h-10 text-gray-300" />
              <p className="text-[13px] font-bold text-gray-400">هنوز آدرسی ثبت نکرده‌اید</p>
            </div>
          ) : (
            addresses.map((a) => (
              <AddressCard key={a.id} address={a} onEdit={() => setEditing(a)} onChanged={() => void refresh()} />
            ))
          )}
          {addresses.length < MAX_ADDRESSES ? (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-white text-[14px]"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              <Plus className="w-4 h-4" /> افزودن آدرس جدید
            </button>
          ) : (
            <p className="text-center text-[11px] text-gray-400">
              حداکثر {MAX_ADDRESSES.toLocaleString("fa-IR")} آدرس مجاز است؛ برای افزودن، یکی را حذف کنید.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
