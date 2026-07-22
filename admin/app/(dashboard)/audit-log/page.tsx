// admin/app/(dashboard)/audit-log/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Loader2, ShieldAlert, Search } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  admin: { username: string; fullName: string };
  ip: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "withdrawal.approve": "تایید برداشت",
  "withdrawal.reject": "رد برداشت",
  "legal_profile.approve": "تایید پروفایل حقوقی",
  "legal_profile.reject": "رد پروفایل حقوقی",
  "physical_delivery.approve": "تایید تحویل فیزیکی",
  "physical_delivery.ship": "ثبت ارسال تحویل فیزیکی",
  "physical_delivery.deliver": "ثبت تحویل نهایی",
  "physical_delivery.cancel": "لغو تحویل فیزیکی",
  "admin.create": "ایجاد ادمین",
  "admin.update": "ویرایش ادمین",
  "admin.reset_password": "بازنشانی رمز ادمین",
  "user.set_status": "تغییر وضعیت کاربر",
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [actionInput, setActionInput] = useState("");

  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (actionFilter) qs.set("action", actionFilter);

  const { data, isLoading } = useSWR(
    `/api/admin/audit-log?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">گزارش فعالیت‌ها</h1>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.total.toLocaleString("fa-IR")} رویداد ثبت‌شده` : "..."}
      </p>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          dir="ltr"
          placeholder="فیلتر بر اساس اکشن (مثلاً withdrawal)"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (setActionFilter(actionInput), setPage(1))
          }
          className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500 text-left"
        />
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>ادمین</th>
              <th>اکشن</th>
              <th>موجودیت</th>
              <th>IP</th>
              <th>زمان</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <ShieldAlert className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">
                      رویدادی یافت نشد
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((log: AuditLogItem) => (
                <tr key={log.id}>
                  <td>
                    <span className="font-bold">{log.admin.fullName}</span>
                    <span dir="ltr" className="block text-[11px] text-gray-400">
                      {log.admin.username}
                    </span>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: "var(--color-emerald-light)",
                        color: "var(--color-emerald)",
                      }}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="text-[11px] text-gray-500" dir="ltr">
                    {log.entityId
                      ? `${log.entityType}: ${log.entityId.slice(0, 8)}…`
                      : "—"}
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

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {data.totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
