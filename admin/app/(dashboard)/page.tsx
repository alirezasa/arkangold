// admin/app/(dashboard)/page.tsx
"use client";

import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  Wallet,
  Building2,
  Users,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  Clock,
  TrendingUp,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

interface AdminMe {
  username: string;
  fullName: string;
  role: { key: string; name: string };
  permissions: string[];
  lastLoginAt: string | null;
}

// ── کارت‌های آماری: هر کدام فقط اگر ادمین دسترسی مرتبط را داشته باشد نمایش داده می‌شود ──
function StatCard({
  title,
  href,
  icon: Icon,
  value,
  loading,
  color,
}: {
  title: string;
  href: string;
  icon: React.ElementType;
  value: number | string;
  loading: boolean;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl p-5 flex items-center justify-between transition-all hover:shadow-md"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div>
        <p className="text-[12px] font-bold text-gray-500 mb-2">{title}</p>
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        ) : (
          <p className="text-[24px] font-black text-gray-900">
            {typeof value === "number" ? value.toLocaleString("fa-IR") : value}
          </p>
        )}
      </div>
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15`, color }}
      >
        <Icon className="w-5 h-5" />
      </div>
    </Link>
  );
}

function QuickLink({
  title,
  subtitle,
  href,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-4 rounded-2xl transition-colors hover:bg-gray-50"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "var(--color-emerald-light)", color: "var(--color-emerald)" }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-black text-gray-800">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <ArrowLeft className="w-4 h-4 text-gray-300 shrink-0" />
    </Link>
  );
}

export default function DashboardHomePage() {
  const { data: me } = useSWR<AdminMe>("/api/admin-auth/me", fetcher);

  const canViewWithdrawals = me?.permissions.includes("withdrawal.view") ?? false;
  const canViewLegalProfiles = me?.permissions.includes("legal_profile.view") ?? false;
  const canManageAdmins = me?.permissions.includes("admin.manage") ?? false;

  const { data: withdrawals, isLoading: withdrawalsLoading } = useSWR(
    canViewWithdrawals ? "/api/admin/withdrawals?status=PENDING&limit=1" : null,
    fetcher,
  );
  const { data: legalProfiles, isLoading: legalLoading } = useSWR(
    canViewLegalProfiles ? "/api/admin/legal-profiles/pending?limit=1" : null,
    fetcher,
  );
  const { data: admins, isLoading: adminsLoading } = useSWR(
    canManageAdmins ? "/api/admin/admins" : null,
    fetcher,
  );

  const todayLabel = new Date().toLocaleDateString("fa-IR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* ── هدر خوش‌آمدگویی ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: "linear-gradient(135deg, var(--color-emerald), #1a0204)" }}
      >
        <div
          className="absolute -top-10 -left-10 w-40 h-40 rounded-full opacity-10 blur-2xl pointer-events-none"
          style={{ background: "var(--color-gold-500)" }}
        />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[12px] text-white/50 font-medium mb-1">{todayLabel}</p>
            <h1 className="text-[20px] font-black text-white">
              خوش آمدید، {me?.fullName ?? "..."}
            </h1>
            {me && (
              <span
                className="inline-block mt-2 px-3 py-1 rounded-full text-[11px] font-bold"
                style={{ backgroundColor: "rgba(197,160,89,.15)", color: "var(--color-gold-500)" }}
              >
                {me.role.name}
              </span>
            )}
          </div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--color-gold-500)" }}
          >
            <TrendingUp className="w-7 h-7" style={{ color: "var(--color-emerald)" }} />
          </div>
        </div>
      </div>

      {/* ── کارت‌های آماری (فقط بر اساس دسترسی) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {canViewWithdrawals && (
          <StatCard
            title="درخواست‌های برداشت در انتظار"
            href="/withdrawals"
            icon={Wallet}
            value={withdrawals?.total ?? 0}
            loading={withdrawalsLoading}
            color="#b45309"
          />
        )}
        {canViewLegalProfiles && (
          <StatCard
            title="پروفایل‌های حقوقی در انتظار تایید"
            href="/legal-profiles"
            icon={Building2}
            value={legalProfiles?.total ?? 0}
            loading={legalLoading}
            color="#2563eb"
          />
        )}
        {canManageAdmins && (
          <StatCard
            title="تعداد کل ادمین‌ها"
            href="/admins"
            icon={Users}
            value={admins?.length ?? 0}
            loading={adminsLoading}
            color="#16a34a"
          />
        )}
      </div>

      {/* ── دسترسی سریع ── */}
      <div>
        <h2 className="text-[14px] font-black text-gray-700 mb-3">دسترسی سریع</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {canViewWithdrawals && (
            <QuickLink
              title="بررسی درخواست‌های برداشت"
              subtitle="تایید یا رد درخواست‌های در انتظار"
              href="/withdrawals"
              icon={Wallet}
            />
          )}
          {canViewLegalProfiles && (
            <QuickLink
              title="پروفایل‌های حقوقی"
              subtitle="بررسی و تایید اطلاعات شرکت‌ها"
              href="/legal-profiles"
              icon={Building2}
            />
          )}
          {canManageAdmins && (
            <QuickLink
              title="مدیریت ادمین‌ها"
              subtitle="ایجاد، ویرایش و تغییر دسترسی‌ها"
              href="/admins"
              icon={Users}
            />
          )}
          {me?.permissions.includes("admin.audit_log.view") && (
            <QuickLink
              title="گزارش فعالیت‌ها"
              subtitle="مشاهده تاریخچه اقدامات ادمین‌ها"
              href="/audit-log"
              icon={ShieldAlert}
            />
          )}
        </div>
      </div>

      {/* ── آخرین ورود ── */}
      {me?.lastLoginAt && (
        <div className="flex items-center gap-2 text-[12px] text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          آخرین ورود شما: {new Date(me.lastLoginAt).toLocaleString("fa-IR")}
        </div>
      )}
    </div>
  );
}