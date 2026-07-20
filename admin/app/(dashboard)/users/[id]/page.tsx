"use client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, ShieldOff, ShieldCheck } from "lucide-react";

// تعریف اینترفیس‌ها برای تایپ‌سیف کردن پروژه
interface BankAccount {
  id: string;
  bankName: string;
  cardNumber: string;
  isVerified: boolean;
  isDefault: boolean;
}

interface UserIdentity {
  firstName: string;
  lastName: string;
}

interface UserWallet {
  rialBalance: string | number;
  goldBalanceGrams: string | number;
}

interface UserDetail {
  id: string;
  phone: string;
  status: "ACTIVE" | "BANNED" | "INACTIVE";
  identity: UserIdentity | null;
  wallet: UserWallet | null;
  bankAccounts: BankAccount[];
}

const fetcher = (url: string) => axios.get<UserDetail>(url).then((r) => r.data);

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();

  // استفاده از Generics برای مشخص کردن نوع خروجی SWR
  const { data, mutate, isLoading } = useSWR<UserDetail>(
    id ? `/api/admin/users/${id}` : null,
    fetcher,
  );

  const [processing, setProcessing] = useState(false);

  const toggleBan = async () => {
    if (!data) return;
    const newStatus = data.status === "BANNED" ? "ACTIVE" : "BANNED";
    if (
      !confirm(
        `آیا مطمئنید می‌خواهید این کاربر را ${newStatus === "BANNED" ? "مسدود" : "رفع مسدودیت"} کنید؟`,
      )
    )
      return;
    setProcessing(true);
    try {
      await axios.post(`/api/admin/users/${id}/status`, { status: newStatus });
      await mutate();
    } catch (error) {
      console.error("خطا در تغییر وضعیت:", error);
    } finally {
      setProcessing(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-black text-gray-900" dir="ltr">
            {data.phone}
          </h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {data.identity
              ? `${data.identity.firstName} ${data.identity.lastName}`
              : "بدون احراز هویت"}
          </p>
        </div>
        <button
          onClick={toggleBan}
          disabled={processing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{
            backgroundColor: data.status === "BANNED" ? "#16a34a" : "#dc2626",
          }}
        >
          {data.status === "BANNED" ? (
            <ShieldCheck className="w-4 h-4" />
          ) : (
            <ShieldOff className="w-4 h-4" />
          )}
          {data.status === "BANNED" ? "رفع مسدودیت" : "مسدودسازی"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="text-[11px] text-gray-400 mb-1">موجودی ریالی</p>
          <p className="text-[16px] font-black">
            {(Number(data.wallet?.rialBalance ?? 0) / 10).toLocaleString(
              "fa-IR",
            )}{" "}
            ت
          </p>
        </div>
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="text-[11px] text-gray-400 mb-1">موجودی طلا</p>
          <p className="text-[16px] font-black">
            {Number(data.wallet?.goldBalanceGrams ?? 0).toFixed(4)} گ
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h2 className="text-[13px] font-black text-gray-700 mb-3">
          حساب‌های بانکی
        </h2>
        {data.bankAccounts.length === 0 ? (
          <p className="text-[12px] text-gray-400">بدون حساب بانکی ثبت‌شده</p>
        ) : (
          <div className="space-y-2">
            {/* رفع خطا: استفاده از تایپ BankAccount به جای any */}
            {data.bankAccounts.map((b: BankAccount) => (
              <div
                key={b.id}
                className="flex items-center justify-between text-[12px] py-2 border-b border-gray-50 last:border-0"
              >
                <span>{b.bankName}</span>
                <span dir="ltr" className="font-medium text-gray-600">
                  {b.cardNumber}
                </span>
                <span
                  className="badge"
                  style={{
                    background: b.isVerified ? "#dcfce7" : "#fef3c7",
                    color: b.isVerified ? "#16a34a" : "#b45309",
                  }}
                >
                  {b.isVerified ? "تایید شده" : "در انتظار"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
