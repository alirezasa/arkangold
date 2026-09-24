"use client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import Link from "next/link";
import {
  Loader2,
  ShieldOff,
  ShieldCheck,
  ShieldAlert,
  Gift,
  UserPlus,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";

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

interface ReferralStats {
  totalInvites: number;
  verifiedInvites: number;
  rewardedInvites: number;
  pendingInvites: number;
  totalRewardRial: string;
  totalRewardGrams: string;
}

interface ReferredBy {
  referralId: string;
  userId: string;
  phone: string;
  fullName: string | null;
  rewarded: boolean;
  createdAt: string;
}

interface UserDetail {
  id: string;
  phone: string;
  status: "ACTIVE" | "BANNED" | "INACTIVE";
  referralCode: string;
  identity: UserIdentity | null;
  wallet: UserWallet | null;
  bankAccounts: BankAccount[];
  referralStats: ReferralStats;
  referredBy: ReferredBy | null;
}

interface InviteeItem {
  id: string;
  createdAt: string;
  rewarded: boolean;
  rewardRial: string;
  rewardGrams: string;
  referred: {
    id: string;
    phone: string;
    fullName: string | null;
    identityStatus: string | null;
  };
}

const fetcher = (url: string) => axios.get<UserDetail>(url).then((r) => r.data);
const inviteesFetcher = (url: string) =>
  axios.get<{ data: InviteeItem[]; total: number }>(url).then((r) => r.data);

const faNum = (n: number | string) =>
  Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 1 });

// ── بخش دعوت از دوستان: کد دعوت، معرف کاربر، آمار و لیست دعوت‌شده‌ها ──
function ReferralSection({ user }: { user: UserDetail }) {
  const { me } = useAdminMe();
  const canViewReferrals = me?.permissions.includes("referral.view") ?? false;
  const { data: invitees, isLoading } = useSWR(
    canViewReferrals && user.referralStats.totalInvites > 0
      ? `/api/admin/referrals?referrerId=${user.id}&limit=50`
      : null,
    inviteesFetcher,
  );
  const s = user.referralStats;

  return (
    <div
      className="rounded-2xl p-5 mb-5"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-black text-gray-700 flex items-center gap-2">
          <Gift className="w-4 h-4 text-gold-500" />
          دعوت از دوستان
        </h2>
        <span
          className="font-mono text-[13px] font-black tracking-widest"
          style={{ color: "var(--color-emerald)" }}
          dir="ltr"
          title="کد دعوت کاربر"
        >
          {user.referralCode}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {[
          { label: "تعداد دعوت", value: `${faNum(s.totalInvites)} نفر` },
          { label: "احراز هویت شده", value: `${faNum(s.verifiedInvites)} نفر` },
          {
            label: "پاداش ریالی",
            value: `${faNum(Number(s.totalRewardRial) / 10)} ت`,
          },
          {
            label: "پاداش طلایی",
            value: `${faNum(Number(s.totalRewardGrams) * 1000)} mg`,
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-gray-50 p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">{c.label}</p>
            <p className="text-[13px] font-black text-gray-800">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-3">
        <UserPlus className="w-4 h-4 text-gray-400" />
        {user.referredBy ? (
          <span>
            این کاربر با دعوت{" "}
            <Link
              href={`/users/${user.referredBy.userId}`}
              className="font-bold hover:underline"
              style={{ color: "var(--color-emerald)" }}
            >
              {user.referredBy.fullName ?? (
                <span dir="ltr">{user.referredBy.phone}</span>
              )}
            </Link>{" "}
            ثبت‌نام کرده است
            {user.referredBy.rewarded ? " (پاداش معرف پرداخت شده)" : ""}
          </span>
        ) : (
          <span>این کاربر بدون کد دعوت ثبت‌نام کرده است</span>
        )}
      </div>

      {s.totalInvites > 0 &&
        (!canViewReferrals ? (
          <p className="text-[11px] text-gray-400">
            برای مشاهده لیست دوستان دعوت‌شده، دسترسی «مشاهده معرفی‌ها» لازم است.
          </p>
        ) : isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        ) : (
          <div className="space-y-1">
            {invitees?.data.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 text-[12px] py-2 border-b border-gray-50 last:border-0"
              >
                <Link
                  href={`/users/${r.referred.id}`}
                  className="font-bold hover:underline"
                  style={{ color: "var(--color-emerald)" }}
                  dir="ltr"
                >
                  {r.referred.phone}
                </Link>
                <span className="text-gray-500 truncate">
                  {r.referred.fullName ?? "—"}
                </span>
                {r.referred.identityStatus === "VERIFIED" ? (
                  <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span className="text-gray-400 shrink-0">
                  {new Date(r.createdAt).toLocaleDateString("fa-IR")}
                </span>
                <span
                  className="badge shrink-0"
                  style={{
                    background: r.rewarded ? "#dcfce7" : "#fef3c7",
                    color: r.rewarded ? "#16a34a" : "#b45309",
                  }}
                >
                  {r.rewarded
                    ? [
                        Number(r.rewardRial) > 0
                          ? `${faNum(Number(r.rewardRial) / 10)} ت`
                          : null,
                        Number(r.rewardGrams) > 0
                          ? `${faNum(Number(r.rewardGrams) * 1000)} mg`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" + ") || "پرداخت شد"
                    : "بدون پاداش"}
                </span>
              </div>
            ))}
            {invitees && invitees.total > invitees.data.length && (
              <Link
                href="/referrals"
                className="block pt-2 text-[11px] font-bold text-gold-500 hover:underline"
              >
                مشاهده همه در صفحه دعوت از دوستان
              </Link>
            )}
          </div>
        ))}
    </div>
  );
}

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

      <ReferralSection user={data} />

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
