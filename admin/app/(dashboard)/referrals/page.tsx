// admin/app/(dashboard)/referrals/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  Gift,
  Loader2,
  Search,
  Users,
  CheckCircle2,
  Clock,
  Wallet,
  Coins,
  AlertCircle,
  Save,
  ShieldCheck,
  ShieldAlert,
  Trophy,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (data?.message)
      return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

type Trigger = "SIGNUP" | "IDENTITY_VERIFIED";

interface ReferralSettings {
  enabled: boolean;
  trigger: Trigger;
  rewardRial: string;
  rewardMg: string;
}

interface ReferralStats {
  totalReferrals: number;
  rewardedReferrals: number;
  pendingReferrals: number;
  totalRewardRial: string;
  totalRewardGrams: string;
  topReferrers: {
    userId: string;
    phone: string | null;
    fullName: string | null;
    invites: number;
  }[];
}

interface ReferralItem {
  id: string;
  createdAt: string;
  rewarded: boolean;
  rewardedAt: string | null;
  rewardRial: string;
  rewardGrams: string;
  referrer: {
    id: string;
    phone: string;
    referralCode: string;
    fullName: string | null;
  };
  referred: {
    id: string;
    phone: string;
    status: string;
    fullName: string | null;
    identityStatus: string | null;
  };
}

interface ReferralsResponse {
  data: ReferralItem[];
  total: number;
  totalPages: number;
  page: number;
}

const faNum = (n: number | string) =>
  Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 1 });

const cardStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
};

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={cardStyle}>
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color }}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
      </div>
      <p className="text-[16px] font-black text-gray-800">
        {value}
        {unit && (
          <span className="text-[10px] font-normal text-gray-400 mr-1">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════
// ── فرم تنظیمات پاداش ──
// ══════════════════════════════════════════
function SettingsCard({
  settings,
  canManage,
  onSaved,
}: {
  settings: ReferralSettings;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [trigger, setTrigger] = useState<Trigger>(settings.trigger);
  const [rewardToman, setRewardToman] = useState(
    String(Number(settings.rewardRial) / 10),
  );
  const [rewardMg, setRewardMg] = useState(settings.rewardMg);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const toman = Number(rewardToman || 0);
  const mg = Number(rewardMg || 0);
  const invalid =
    !Number.isFinite(toman) ||
    toman < 0 ||
    !Number.isInteger(toman) ||
    !Number.isFinite(mg) ||
    mg < 0;

  const preview = [
    toman > 0 ? `${faNum(toman)} تومان به کیف پول ریالی` : null,
    mg > 0 ? `${faNum(mg)} میلی‌گرم طلا به کیف پول طلا` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    setMessage(null);
    try {
      await axios.put("/api/admin/referrals/settings", {
        enabled,
        trigger,
        rewardRial: toman * 10,
        rewardMg: Math.round(mg * 10) / 10,
      });
      setMessage({ ok: true, text: "تنظیمات پاداش دعوت ذخیره شد" });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: getErrorMessage(err, "خطا در ذخیره") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl p-5 mb-5" style={cardStyle}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-black text-gray-800 flex items-center gap-2">
          <Gift className="w-4 h-4 text-gold-500" />
          تنظیمات پاداش دعوت از دوست
        </h2>
        <button
          type="button"
          disabled={!canManage}
          onClick={() => setEnabled((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold disabled:cursor-not-allowed"
          style={{
            background: enabled ? "#dcfce7" : "#f3f4f6",
            color: enabled ? "#16a34a" : "#6b7280",
          }}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {enabled ? "پاداش فعال" : "پاداش غیرفعال"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] font-bold text-gray-600">
            پاداش ریالی هر دعوت (تومان)
          </span>
          <input
            type="number"
            min={0}
            step={1000}
            disabled={!canManage}
            value={rewardToman}
            onChange={(e) => setRewardToman(e.target.value)}
            className="mt-1.5 w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-[13px] font-bold outline-none focus:border-gold-500 disabled:bg-gray-50"
            dir="ltr"
          />
          <span className="text-[10px] text-gray-400">
            به کیف پول ریالی معرف واریز می‌شود — صفر یعنی بدون پاداش ریالی
          </span>
        </label>
        <label className="block">
          <span className="text-[12px] font-bold text-gray-600">
            پاداش طلایی هر دعوت (میلی‌گرم)
          </span>
          <input
            type="number"
            min={0}
            step={0.1}
            disabled={!canManage}
            value={rewardMg}
            onChange={(e) => setRewardMg(e.target.value)}
            className="mt-1.5 w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-[13px] font-bold outline-none focus:border-gold-500 disabled:bg-gray-50"
            dir="ltr"
          />
          <span className="text-[10px] text-gray-400">
            به کیف پول طلای معرف واریز می‌شود — صفر یعنی بدون پاداش طلایی
          </span>
        </label>
      </div>

      <div className="mt-4">
        <span className="text-[12px] font-bold text-gray-600">
          زمان پرداخت پاداش به معرف
        </span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(
            [
              ["IDENTITY_VERIFIED", "پس از احراز هویت دوست دعوت‌شده (پیشنهادی)"],
              ["SIGNUP", "بلافاصله پس از ثبت‌نام دوست دعوت‌شده"],
            ] as [Trigger, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={!canManage}
              onClick={() => setTrigger(key)}
              className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors disabled:cursor-not-allowed ${
                trigger === key
                  ? "text-white border-transparent"
                  : "text-gray-600 border-gray-200 bg-white"
              }`}
              style={
                trigger === key
                  ? { backgroundColor: "var(--color-emerald)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 rounded-xl bg-gray-50 p-3 text-[12px] text-gray-600 leading-relaxed">
        {enabled && preview
          ? `به ازای هر دعوت موفق: ${preview}`
          : "در حال حاضر پاداشی پرداخت نمی‌شود؛ دعوت‌ها فقط ثبت و شمارش می‌شوند."}
      </p>

      {message && (
        <p
          className={`mt-3 text-[12px] font-bold flex items-center gap-1.5 ${
            message.ok ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.ok ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {message.text}
        </p>
      )}

      {canManage && (
        <button
          type="button"
          onClick={save}
          disabled={saving || invalid}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          ذخیره تنظیمات
        </button>
      )}
    </div>
  );
}

function RewardCell({ item }: { item: ReferralItem }) {
  const rial = Number(item.rewardRial);
  const grams = Number(item.rewardGrams);
  if (!item.rewarded) return <span className="text-gray-400">—</span>;
  return (
    <div className="text-[12px] font-bold text-green-700 space-y-0.5">
      {rial > 0 && <p>{faNum(rial / 10)} ت</p>}
      {grams > 0 && <p>{faNum(grams * 1000)} mg</p>}
      {rial === 0 && grams === 0 && <p>پرداخت شد</p>}
    </div>
  );
}

export default function ReferralsPage() {
  const { me } = useAdminMe();
  const canManage = me?.permissions.includes("referral.manage") ?? false;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<"" | "REWARDED" | "PENDING">("");
  const [granting, setGranting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) qs.set("search", search);
  if (status) qs.set("status", status);

  const { data: settings, mutate: mutateSettings } = useSWR<ReferralSettings>(
    "/api/admin/referrals/settings",
    fetcher,
  );
  const { data: stats, mutate: mutateStats } = useSWR<ReferralStats>(
    "/api/admin/referrals/stats",
    fetcher,
  );
  const {
    data: list,
    isLoading,
    mutate: mutateList,
  } = useSWR<ReferralsResponse>(`/api/admin/referrals?${qs.toString()}`, fetcher);

  const grant = async (item: ReferralItem) => {
    if (
      !confirm(
        `پاداش دعوت کاربر ${item.referred.phone} با مقادیر فعلی تنظیمات به کیف پول ${item.referrer.phone} واریز شود؟`,
      )
    )
      return;
    setGranting(item.id);
    setActionError(null);
    try {
      await axios.post(`/api/admin/referrals/${item.id}/grant`);
      await Promise.all([mutateList(), mutateStats()]);
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در پرداخت پاداش"));
    } finally {
      setGranting(null);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">دعوت از دوستان</h1>
      <p className="text-[12px] text-gray-400 mb-5">
        تنظیم پاداش دعوت، آمار دعوت‌ها و پاداش‌های پرداخت‌شده به معرف‌ها
      </p>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard
            icon={Users}
            label="کل دعوت‌ها"
            value={faNum(stats.totalReferrals)}
            color="#2563eb"
          />
          <StatCard
            icon={CheckCircle2}
            label="پاداش پرداخت‌شده"
            value={faNum(stats.rewardedReferrals)}
            color="#16a34a"
          />
          <StatCard
            icon={Clock}
            label="در انتظار پاداش"
            value={faNum(stats.pendingReferrals)}
            color="#b45309"
          />
          <StatCard
            icon={Wallet}
            label="مجموع پاداش ریالی"
            value={faNum(Number(stats.totalRewardRial) / 10)}
            unit="تومان"
            color="#0f766e"
          />
          <StatCard
            icon={Coins}
            label="مجموع پاداش طلایی"
            value={faNum(Number(stats.totalRewardGrams) * 1000)}
            unit="میلی‌گرم"
            color="#c8952e"
          />
        </div>
      )}

      {settings && (
        <SettingsCard
          key={JSON.stringify(settings)}
          settings={settings}
          canManage={canManage}
          onSaved={() => mutateSettings()}
        />
      )}

      {stats && stats.topReferrers.length > 0 && (
        <div className="rounded-2xl p-5 mb-5" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800 flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-gold-500" />
            برترین معرف‌ها
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.topReferrers.map((t, i) => (
              <Link
                key={t.userId}
                href={`/users/${t.userId}`}
                className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[12px] font-bold text-gray-700 hover:border-gold-500"
              >
                <span className="text-gold-500">{faNum(i + 1)}.</span>
                <span>{t.fullName ?? <span dir="ltr">{t.phone}</span>}</span>
                <span
                  className="badge"
                  style={{ background: "#dbeafe", color: "#2563eb" }}
                >
                  {faNum(t.invites)} دعوت
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* فیلترها */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="جستجو با موبایل معرف / دعوت‌شده یا کد دعوت..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (setSearch(searchInput.trim()), setPage(1))
            }
            className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              ["", "همه"],
              ["REWARDED", "پاداش پرداخت‌شده"],
              ["PENDING", "در انتظار پاداش"],
            ] as ["" | "REWARDED" | "PENDING", string][]
          ).map(([key, label]) => (
            <button
              key={key || "all"}
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
              className={`px-3 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap ${
                status === key ? "text-white" : "text-gray-500 bg-gray-50"
              }`}
              style={
                status === key
                  ? { backgroundColor: "var(--color-emerald)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[12px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {actionError}
        </div>
      )}

      <div className="rounded-2xl overflow-x-auto" style={cardStyle}>
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>معرف (دعوت‌کننده)</th>
              <th>دوست دعوت‌شده</th>
              <th>احراز هویت</th>
              <th>تاریخ ثبت‌نام</th>
              <th>پاداش</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !list?.data?.length ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Gift className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400 font-medium">
                      دعوتی یافت نشد
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              list.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/users/${r.referrer.id}`}
                      className="font-bold hover:underline"
                      style={{ color: "var(--color-emerald)" }}
                      dir="ltr"
                    >
                      {r.referrer.phone}
                    </Link>
                    <p className="text-[11px] text-gray-400">
                      {r.referrer.fullName ?? "—"} ·{" "}
                      <span className="font-mono" dir="ltr">
                        {r.referrer.referralCode}
                      </span>
                    </p>
                  </td>
                  <td>
                    <Link
                      href={`/users/${r.referred.id}`}
                      className="font-bold hover:underline"
                      style={{ color: "var(--color-emerald)" }}
                      dir="ltr"
                    >
                      {r.referred.phone}
                    </Link>
                    <p className="text-[11px] text-gray-400">
                      {r.referred.fullName ?? "—"}
                    </p>
                  </td>
                  <td>
                    {r.referred.identityStatus === "VERIFIED" ? (
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                    )}
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString("fa-IR")}
                  </td>
                  <td>
                    <RewardCell item={r} />
                  </td>
                  <td>
                    {r.rewarded ? (
                      <span
                        className="badge"
                        style={{ background: "#dcfce7", color: "#16a34a" }}
                        title={
                          r.rewardedAt
                            ? new Date(r.rewardedAt).toLocaleString("fa-IR")
                            : undefined
                        }
                      >
                        پرداخت شد
                      </span>
                    ) : canManage ? (
                      <button
                        onClick={() => grant(r)}
                        disabled={granting === r.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white disabled:opacity-60"
                        style={{ backgroundColor: "var(--color-gold-500)" }}
                      >
                        {granting === r.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Gift className="w-3 h-3" />
                        )}
                        پرداخت پاداش
                      </button>
                    ) : (
                      <span
                        className="badge"
                        style={{ background: "#fef3c7", color: "#b45309" }}
                      >
                        در انتظار
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {list && list.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {faNum(page)} از {faNum(list.totalPages)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))}
            disabled={page >= list.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
