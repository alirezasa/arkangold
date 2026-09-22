// admin/app/(dashboard)/audit-log/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message || fallback;
  }
  return fallback;
}

const ACTION_LABELS: Record<string, string> = {
  // احراز هویت ادمین
  "admin_auth.login": "ورود ادمین",
  "admin_auth.logout": "خروج ادمین",
  "admin_auth.logout_all": "خروج از همه دستگاه‌ها",
  "admin_auth.change_password": "تغییر رمز عبور",
  "admin_auth.account_locked": "قفل‌شدن حساب (تلاش ناموفق مکرر)",
  "admin_auth.permission_denied": "دسترسی غیرمجاز (رد شده)",
  "admin_auth.session_expired": "انقضای نشست",
  "admin_auth.invalid_token": "توکن نامعتبر",
  // احراز هویت کاربر
  "auth.register": "ثبت‌نام کاربر",
  "auth.login": "ورود کاربر",
  "auth.login_otp": "ورود با کد یک‌بارمصرف",
  "auth.logout": "خروج کاربر",
  "auth.logout_all": "خروج از همه دستگاه‌ها",
  "auth.reset_password": "بازنشانی رمز عبور",
  "auth.session_expired": "انقضای نشست",
  "auth.invalid_token": "توکن نامعتبر",
  // امنیتی/سیستمی
  "security.validation_failed": "ورودی نامعتبر (رد شده)",
  "security.unexpected_error": "خطای پیش‌بینی‌نشده",
  // مدیریت پنل
  "admin.create": "ایجاد ادمین",
  "admin.update": "ویرایش ادمین",
  "admin.reset_password": "بازنشانی رمز ادمین",
  "user.set_status": "تغییر وضعیت کاربر",
  "legal_profile.approve": "تایید پروفایل حقوقی",
  "legal_profile.reject": "رد پروفایل حقوقی",
  "physical_delivery.approve": "تایید تحویل فیزیکی",
  "physical_delivery.ship": "ثبت ارسال تحویل فیزیکی",
  "physical_delivery.deliver": "ثبت تحویل نهایی",
  "physical_delivery.cancel": "لغو تحویل فیزیکی",
  "withdrawal.approve": "تایید برداشت",
  "withdrawal.reject": "رد برداشت",
  "shop_orders.process": "پردازش سفارش فروشگاه",
  "shop_orders.ship": "ارسال سفارش فروشگاه",
  "shop_orders.deliver": "تحویل سفارش فروشگاه",
  "shop_orders.cancel": "لغو سفارش فروشگاه",
  "ticket_categories.create": "ایجاد دسته تیکت",
  "ticket_categories.update": "ویرایش دسته تیکت",
  "ticket_categories.delete": "حذف دسته تیکت",
  "tickets.assign": "ارجاع تیکت",
  "tickets.change_status": "تغییر وضعیت تیکت",
  "tickets.change_priority": "تغییر اولویت تیکت",
  "tickets.add_message": "ثبت پاسخ تیکت",
  "tickets.close": "بستن تیکت",
  "tickets.reopen": "بازگشایی تیکت",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function OutcomeBadge({ success }: { success: boolean }) {
  return success ? (
    <span className="badge" style={{ background: "var(--color-emerald-light)", color: "var(--color-emerald)" }}>
      موفق
    </span>
  ) : (
    <span className="badge" style={{ background: "#fee2e2", color: "#dc2626" }}>
      ناموفق
    </span>
  );
}

interface AdminAuditLogItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  admin: { username: string; fullName: string } | null;
  actorLabel: string | null;
  ip: string | null;
  source: string | null;
  success: boolean;
  createdAt: string;
}

interface UserAuditLogItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userId: string | null;
  userPhone: string | null;
  actorLabel: string | null;
  ip: string | null;
  source: string | null;
  success: boolean;
  createdAt: string;
}

interface Paged<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
      >
        قبلی
      </button>
      <span className="text-[12px] font-bold text-gray-500">
        صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
      >
        بعدی
      </button>
    </div>
  );
}

function ActionFilterInput({
  value,
  onSubmit,
}: {
  value: string;
  onSubmit: (v: string) => void;
}) {
  const [input, setInput] = useState(value);
  return (
    <div className="relative mb-4">
      <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        dir="ltr"
        placeholder="فیلتر بر اساس اکشن (مثلاً login)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit(input)}
        className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500 text-left"
      />
    </div>
  );
}

// ─────────────────────────── تب رویدادهای ادمین ───────────────────────────

function AdminEventsTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");

  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (actionFilter) qs.set("action", actionFilter);

  const { data, isLoading } = useSWR<Paged<AdminAuditLogItem>>(
    `/api/admin/audit-log?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.total.toLocaleString("fa-IR")} رویداد ثبت‌شده` : "..."}
      </p>
      <ActionFilterInput
        value={actionFilter}
        onSubmit={(v) => {
          setActionFilter(v);
          setPage(1);
        }}
      />

      <div
        className="rounded-2xl overflow-hidden overflow-x-auto"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>ادمین</th>
              <th>اکشن</th>
              <th>موجودیت</th>
              <th>منبع</th>
              <th>نتیجه</th>
              <th>IP</th>
              <th>زمان</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <ShieldAlert className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">رویدادی یافت نشد</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((log) => (
                <tr key={log.id}>
                  <td>
                    {log.admin ? (
                      <>
                        <span className="font-bold">{log.admin.fullName}</span>
                        <span dir="ltr" className="block text-[11px] text-gray-400">
                          {log.admin.username}
                        </span>
                      </>
                    ) : (
                      <span dir="ltr" className="text-[11px] text-gray-400">
                        {log.actorLabel ?? "—"}
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: "var(--color-gold-100)", color: "var(--color-gold-900)" }}
                    >
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="text-[11px] text-gray-500" dir="ltr">
                    {log.entityId ? `${log.entityType}: ${log.entityId.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="text-[11px] text-gray-400" dir="ltr">
                    {log.source ?? "—"}
                  </td>
                  <td>
                    <OutcomeBadge success={log.success} />
                  </td>
                  <td dir="ltr" className="text-[11px] text-gray-400">
                    {log.ip || "—"}
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {new Date(log.createdAt).toLocaleString("fa-IR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}

// ─────────────────────────── تب رویدادهای کاربران ───────────────────────────

function UserEventsTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");

  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (actionFilter) qs.set("action", actionFilter);

  const { data, isLoading } = useSWR<Paged<UserAuditLogItem>>(
    `/api/admin/audit-log/users?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.total.toLocaleString("fa-IR")} رویداد ثبت‌شده` : "..."}
      </p>
      <ActionFilterInput
        value={actionFilter}
        onSubmit={(v) => {
          setActionFilter(v);
          setPage(1);
        }}
      />

      <div
        className="rounded-2xl overflow-hidden overflow-x-auto"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>اکشن</th>
              <th>موجودیت</th>
              <th>منبع</th>
              <th>نتیجه</th>
              <th>IP</th>
              <th>زمان</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <ShieldAlert className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">رویدادی یافت نشد</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((log) => (
                <tr key={log.id}>
                  <td dir="ltr" className="text-[12px] text-gray-700 font-bold">
                    {log.userPhone ?? log.actorLabel ?? "—"}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: "var(--color-emerald-light)", color: "var(--color-emerald)" }}
                    >
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="text-[11px] text-gray-500" dir="ltr">
                    {log.entityId ? `${log.entityType}: ${log.entityId.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="text-[11px] text-gray-400" dir="ltr">
                    {log.source ?? "—"}
                  </td>
                  <td>
                    <OutcomeBadge success={log.success} />
                  </td>
                  <td dir="ltr" className="text-[11px] text-gray-400">
                    {log.ip || "—"}
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {new Date(log.createdAt).toLocaleString("fa-IR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}

// ─────────────────────────── تب یکپارچگی رویدادها ───────────────────────────

interface ChainVerificationResult {
  valid: boolean;
  checked: number;
  brokenAtId?: string;
}

const CHAIN_LABELS: Record<"admin" | "user", string> = {
  admin: "رویدادهای ادمین",
  user: "رویدادهای کاربران",
};

function ChainResultCard({ chain, result }: { chain: "admin" | "user"; result: ChainVerificationResult }) {
  return (
    <div
      className="rounded-2xl p-4 flex items-center justify-between"
      style={{
        backgroundColor: "var(--color-surface)",
        border: `1px solid ${result.valid ? "var(--color-border)" : "#dc2626"}`,
      }}
    >
      <div className="flex items-center gap-3">
        {result.valid ? (
          <CheckCircle2 className="w-6 h-6" style={{ color: "var(--color-emerald)" }} />
        ) : (
          <XCircle className="w-6 h-6 text-red-600" />
        )}
        <div>
          <p className="font-black text-[13px] text-gray-900">{CHAIN_LABELS[chain]}</p>
          <p className="text-[11px] text-gray-400">
            {result.checked.toLocaleString("fa-IR")} رکورد بررسی شد
          </p>
        </div>
      </div>
      {result.valid ? (
        <span className="badge" style={{ background: "var(--color-emerald-light)", color: "var(--color-emerald)" }}>
          سالم
        </span>
      ) : (
        <div className="text-left">
          <span className="badge" style={{ background: "#fee2e2", color: "#dc2626" }}>
            دستکاری‌شده
          </span>
          {result.brokenAtId && (
            <p dir="ltr" className="text-[10px] text-gray-400 mt-1">
              شکست در رکورد {result.brokenAtId.slice(0, 8)}…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function IntegrityTab() {
  const { data, isLoading, mutate, isValidating } = useSWR<
    Record<"admin" | "user", ChainVerificationResult>
  >("/api/admin/audit-log/verify", fetcher, { revalidateOnFocus: false });
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setError(null);
    try {
      await mutate();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در بازبینی یکپارچگی"));
    }
  };

  return (
    <div>
      <div
        className="rounded-2xl p-4 mb-4 flex items-start gap-3"
        style={{ backgroundColor: "var(--color-gold-50)", border: "1px solid var(--color-gold-100)" }}
      >
        <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--color-gold-600)" }} />
        <p className="text-[12px] text-gray-600 leading-6">
          رویدادهای امنیتی با زنجیره‌ی hash به یکدیگر متصل‌اند؛ هر تغییر یا حذف دستی یک رکورد قدیمی، زنجیره‌ی
          بعد از آن را نامعتبر می‌کند. این بررسی تمام رکوردها را از ابتدا بازخوانی و hash هرکدام را دوباره
          محاسبه می‌کند.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold mb-4">
          {error}
        </div>
      )}

      <button
        onClick={runCheck}
        disabled={isValidating}
        className="mb-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {isValidating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        بازبینی یکپارچگی
      </button>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ChainResultCard chain="admin" result={data.admin} />
          <ChainResultCard chain="user" result={data.user} />
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────── صفحه اصلی ───────────────────────────

const TABS = [
  { key: "admin", label: "رویدادهای ادمین" },
  { key: "user", label: "رویدادهای کاربران" },
  { key: "integrity", label: "یکپارچگی رویدادها" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AuditLogPage() {
  const [tab, setTab] = useState<TabKey>("admin");

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">گزارش فعالیت‌ها</h1>
      <p className="text-[12px] text-gray-400 mb-4">
        رویدادنگاری امنیتی — ورود/خروج، تغییرات حساس، تلاش‌های ناموفق و یکپارچگی رویدادها
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap"
            style={
              tab === t.key
                ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                : { backgroundColor: "var(--color-surface)", color: "#6b7280", border: "1px solid var(--color-border)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "admin" && <AdminEventsTab />}
      {tab === "user" && <UserEventsTab />}
      {tab === "integrity" && <IntegrityTab />}
    </div>
  );
}
