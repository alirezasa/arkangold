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
  Fingerprint,
  RefreshCw,
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

type IdentityStatus = "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW";

interface UserIdentity {
  firstName: string | null;
  lastName: string | null;
  nationalCode: string | null;
  birthDate: string | null;
  fatherName: string | null;
  gender: string | null;
  deathStatus: string | null;
  status: IdentityStatus;
  verifiedAt: string | null;
  verifiedByProvider: string | null;
}

interface ReinquireResult {
  matched: boolean;
  reason: string | null;
  previousStatus: IdentityStatus;
  status: IdentityStatus;
  provider: string | null;
  checkedAt: string;
  message: string;
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

const IDENTITY_STATUS_META: Record<
  IdentityStatus,
  { label: string; bg: string; color: string }
> = {
  VERIFIED: { label: "تایید شده", bg: "#dcfce7", color: "#16a34a" },
  PENDING: { label: "در انتظار", bg: "#fef3c7", color: "#b45309" },
  MANUAL_REVIEW: { label: "بررسی دستی", bg: "#fef3c7", color: "#b45309" },
  REJECTED: { label: "رد شده", bg: "#fee2e2", color: "#dc2626" },
};

function apiError(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
  }
  return fallback;
}

// ── بخش احراز هویت: اطلاعات ثبت احوال + استعلام مجدد ──
function IdentitySection({
  user,
  onUpdated,
}: {
  user: UserDetail;
  onUpdated: () => Promise<unknown>;
}) {
  const { me } = useAdminMe();
  const canReinquire =
    me?.permissions.includes("users.identity.reinquire") ?? false;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReinquireResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identity = user.identity;
  const meta = identity ? IDENTITY_STATUS_META[identity.status] : null;
  const canInquire = !!identity?.nationalCode && !!identity?.birthDate;

  const reinquire = async () => {
    if (
      !confirm(
        "اطلاعات هویتی این کاربر دوباره از ثبت احوال استعلام شود؟ (هزینه‌ی وب‌سرویس استعلام محاسبه می‌شود)",
      )
    )
      return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post<ReinquireResult>(
        `/api/admin/users/${user.id}/identity/reinquire`,
      );
      setResult(res.data);
      await onUpdated();
    } catch (err) {
      setError(apiError(err, "خطا در استعلام هویت"));
    } finally {
      setLoading(false);
    }
  };

  const rows: { label: string; value: string | null | undefined; ltr?: boolean }[] =
    identity
      ? [
          {
            label: "نام و نام خانوادگی",
            value: [identity.firstName, identity.lastName].filter(Boolean).join(" "),
          },
          { label: "کد ملی", value: identity.nationalCode, ltr: true },
          {
            label: "تاریخ تولد",
            value: identity.birthDate
              ? new Date(identity.birthDate).toLocaleDateString("fa-IR")
              : null,
          },
          { label: "نام پدر", value: identity.fatherName },
          { label: "جنسیت", value: identity.gender },
          { label: "وضعیت حیات", value: identity.deathStatus },
          {
            label: "تاریخ تایید",
            value: identity.verifiedAt
              ? new Date(identity.verifiedAt).toLocaleString("fa-IR")
              : null,
          },
          { label: "سرویس استعلام", value: identity.verifiedByProvider, ltr: true },
        ]
      : [];

  return (
    <div
      className="rounded-2xl p-5 mb-5"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[13px] font-black text-gray-700 flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-gold-500" />
          احراز هویت
          {meta && (
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          )}
        </h2>
        {canReinquire && (
          <button
            type="button"
            onClick={reinquire}
            disabled={loading || !canInquire}
            title={
              canInquire
                ? "استعلام مجدد از ثبت احوال"
                : "کاربر هنوز کد ملی و تاریخ تولد ثبت نکرده است"
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            استعلام مجدد هویت
          </button>
        )}
      </div>

      {!identity ? (
        <p className="text-[12px] text-gray-400">
          کاربر هنوز اطلاعات هویتی ثبت نکرده است
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-2 text-[12px] py-2 border-b border-gray-50"
            >
              <span className="text-gray-400">{r.label}</span>
              <span
                className="font-bold text-gray-700"
                dir={r.ltr ? "ltr" : undefined}
              >
                {r.value || "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 border border-red-100 p-3 text-[12px] font-bold text-red-600">
          {error}
        </p>
      )}
      {result && (
        <div
          className="mt-3 rounded-xl p-3 text-[12px] font-bold border"
          style={
            result.matched
              ? { background: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" }
              : { background: "#fffbeb", borderColor: "#fde68a", color: "#b45309" }
          }
        >
          <p>{result.message}</p>
          {result.reason && <p className="mt-1 font-medium">دلیل: {result.reason}</p>}
          <p className="mt-1 font-medium text-[11px] opacity-80">
            {new Date(result.checkedAt).toLocaleString("fa-IR")}
            {result.provider ? ` · ${result.provider}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

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
            {[data.identity?.firstName, data.identity?.lastName]
              .filter(Boolean)
              .join(" ") || "بدون احراز هویت"}
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

      <IdentitySection user={data} onUpdated={() => mutate()} />

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
