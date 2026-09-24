"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  ShieldCheck,
  Clock,
  Coins,
  Wallet,
  Loader2,
  AlertCircle,
  Inbox,
  ChevronLeft,
  Send,
  MessageCircle,
  Link2,
} from "lucide-react";
import {
  useMyReferrals,
  buildInviteLink,
  type MyReferralsResponse,
  type ReferralInvitee,
} from "@/app/hooks/useReferrals";

const subscribeNoop = () => () => {};
const readOrigin = () => window.location.origin;
const serverOrigin = () => "";
const readCanShare = () => typeof navigator.share === "function";
const serverCanShare = () => false;

const faNum = (n: number | string) =>
  Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 1 });

/** ریال → متن تومانی */
const rialToToman = (rial: string | number) => faNum(Number(rial) / 10);

/** گرم → متن میلی‌گرمی */
const gramsToMg = (grams: string | number) => faNum(Number(grams) * 1000);

function rewardText(settings: MyReferralsResponse["settings"]) {
  const parts: string[] = [];
  if (Number(settings.rewardRial) > 0) {
    parts.push(`${rialToToman(settings.rewardRial)} تومان`);
  }
  if (Number(settings.rewardMg) > 0) {
    parts.push(`${faNum(settings.rewardMg)} میلی‌گرم طلا`);
  }
  return parts.join(" + ");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // مرورگر اجازه دسترسی به کلیپ‌بورد نداد
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!value}
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600 shadow-sm disabled:opacity-50"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "کپی شد" : label}
    </button>
  );
}

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
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5" style={{ color }}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
      </div>
      <p className="text-[16px] font-black text-gray-800">
        {value}
        {unit && (
          <span className="mr-1 text-[10px] font-normal text-gray-400">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function InviteeRow({ item, first }: { item: ReferralInvitee; first: boolean }) {
  const rial = Number(item.rewardRial);
  const grams = Number(item.rewardGrams);
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: first ? undefined : "1px solid var(--color-border)" }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--color-gold-50)" }}
      >
        <Users className="h-5 w-5" style={{ color: "var(--color-gold-500)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-gray-800">
          {item.name ?? "کاربر جدید"}
          <span className="mr-2 text-[11px] font-medium text-gray-400" dir="ltr">
            {item.phone}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-gray-400">
            عضویت {new Date(item.joinedAt).toLocaleDateString("fa-IR")}
          </span>
          {item.identityVerified ? (
            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700">
              احراز هویت شده
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              در انتظار احراز هویت
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-left">
        {item.rewarded ? (
          <>
            {rial > 0 && (
              <p className="text-[12px] font-black text-green-600">
                +{rialToToman(rial)} ت
              </p>
            )}
            {grams > 0 && (
              <p className="text-[12px] font-black text-green-600">
                +{gramsToMg(grams)} mg
              </p>
            )}
            {rial === 0 && grams === 0 && (
              <p className="text-[11px] font-bold text-green-600">پرداخت شد</p>
            )}
          </>
        ) : (
          <p className="text-[11px] font-bold text-gray-400">بدون پاداش</p>
        )}
      </div>
    </div>
  );
}

export default function ReferralPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useMyReferrals(page);
  const origin = useSyncExternalStore(subscribeNoop, readOrigin, serverOrigin);

  const code = data?.referralCode ?? "";
  const link = code && origin ? buildInviteLink(origin, code) : "";
  const reward = data ? rewardText(data.settings) : "";
  const rewardActive = !!data?.settings.enabled && !!reward;
  const shareText = `با لینک دعوت من در آرکان گلد ثبت‌نام کن و به‌راحتی طلای آب‌شده خرید و فروش کن. کد دعوت: ${code}`;

  const canNativeShare = useSyncExternalStore(
    subscribeNoop,
    readCanShare,
    serverCanShare,
  );

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "دعوت به آرکان گلد", text: shareText, url: link });
    } catch {
      // کاربر اشتراک‌گذاری را لغو کرد
    }
  };

  const encoded = encodeURIComponent(`${shareText}\n${link}`);
  const shareTargets = [
    {
      label: "تلگرام",
      icon: Send,
      href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`,
    },
    {
      label: "واتس‌اپ",
      icon: MessageCircle,
      href: `https://wa.me/?text=${encoded}`,
    },
    { label: "پیامک", icon: MessageCircle, href: `sms:?&body=${encoded}` },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--color-gold-50)" }}
        >
          <Gift className="h-5 w-5" style={{ color: "var(--color-gold-500)" }} />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">دعوت از دوستان</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            لینک دعوت خود را به اشتراک بگذارید و پاداش بگیرید
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] font-bold text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : (
        data && (
          <>
            {/* کارت پاداش و لینک دعوت */}
            <section
              className="space-y-4 rounded-2xl p-5 text-white"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              <div>
                <p className="text-[12px] font-bold text-white/70">
                  پاداش هر دعوت
                </p>
                {rewardActive ? (
                  <>
                    <p
                      className="mt-1 text-[20px] font-black"
                      style={{ color: "var(--color-gold-500)" }}
                    >
                      {reward}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/70">
                      {data.settings.trigger === "SIGNUP"
                        ? "به محض ثبت‌نام دوستتان با لینک یا کد دعوت شما، پاداش به کیف پولتان واریز می‌شود."
                        : "پس از ثبت‌نام دوستتان با لینک یا کد دعوت شما و تکمیل احراز هویت او، پاداش به کیف پولتان واریز می‌شود."}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] font-bold text-white/90">
                    در حال حاضر طرح پاداش فعالی وجود ندارد، اما دعوت‌های شما
                    ثبت و شمارش می‌شوند.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-white/70">
                  <Link2 className="h-3.5 w-3.5" />
                  لینک دعوت شما
                </p>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2.5">
                  <span
                    className="truncate font-mono text-[12px] font-bold"
                    dir="ltr"
                  >
                    {link || "…"}
                  </span>
                  <CopyButton value={link} label="کپی لینک" />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2.5">
                  <span className="text-[11px] font-bold text-white/70">
                    کد دعوت
                  </span>
                  <span
                    className="font-mono text-[15px] font-black tracking-widest"
                    style={{ color: "var(--color-gold-500)" }}
                    dir="ltr"
                  >
                    {code}
                  </span>
                  <CopyButton value={code} label="کپی کد" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={nativeShare}
                    disabled={!link}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-black text-gray-900 disabled:opacity-60"
                    style={{ backgroundColor: "var(--color-gold-500)" }}
                  >
                    <Share2 className="h-4 w-4" />
                    اشتراک‌گذاری
                  </button>
                )}
                {shareTargets.map((t) => (
                  <a
                    key={t.label}
                    href={link ? t.href : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-[12px] font-bold text-white hover:bg-white/20"
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </a>
                ))}
              </div>
            </section>

            {/* آمار */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Users}
                label="تعداد دعوت‌ها"
                value={faNum(data.stats.totalInvites)}
                unit="نفر"
                color="#2563eb"
              />
              <StatCard
                icon={ShieldCheck}
                label="احراز هویت شده"
                value={faNum(data.stats.verifiedInvites)}
                unit="نفر"
                color="#16a34a"
              />
              <StatCard
                icon={Wallet}
                label="پاداش ریالی دریافتی"
                value={rialToToman(data.stats.totalRewardRial)}
                unit="تومان"
                color="#0f766e"
              />
              <StatCard
                icon={Coins}
                label="پاداش طلایی دریافتی"
                value={gramsToMg(data.stats.totalRewardGrams)}
                unit="میلی‌گرم"
                color="#c8952e"
              />
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-[12px] font-bold text-amber-800">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                دعوت‌های در انتظار پاداش: {faNum(data.stats.pendingInvites)}
              </span>
              <Link
                href="/dashboard/transactions"
                className="flex items-center gap-0.5 text-[11px] text-amber-700 hover:underline"
              >
                تراکنش‌ها
                <ChevronLeft className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* لیست دوستان دعوت‌شده */}
            <section
              className="overflow-hidden rounded-2xl"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h2
                className="flex items-center gap-2 px-4 py-3 text-[14px] font-black text-gray-800"
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <Users className="h-4 w-4 text-gold-500" />
                دوستان دعوت‌شده
                <span className="text-[11px] font-bold text-gray-400">
                  ({faNum(data.total)})
                </span>
              </h2>
              {data.invitees.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                  <Inbox className="h-10 w-10 text-gray-300" />
                  <p className="text-[13px] font-bold text-gray-400">
                    هنوز کسی با لینک شما ثبت‌نام نکرده است
                  </p>
                </div>
              ) : (
                data.invitees.map((item, idx) => (
                  <InviteeRow key={item.id} item={item} first={idx === 0} />
                ))
              )}
            </section>

            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold disabled:opacity-40"
                >
                  قبلی
                </button>
                <span className="text-[12px] font-bold text-gray-500">
                  صفحه {faNum(page)} از {faNum(data.totalPages)}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(data.totalPages, p + 1))
                  }
                  disabled={page >= data.totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold disabled:opacity-40"
                >
                  بعدی
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
