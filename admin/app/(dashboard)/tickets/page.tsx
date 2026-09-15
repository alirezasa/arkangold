// admin/app/(dashboard)/tickets/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, Tags } from "lucide-react";

const STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  WAITING_FOR_USER: "منتظر کاربر",
  RESOLVED: "حل شده",
  CLOSED: "بسته",
  REOPENED: "بازگشایی‌شده",
};

const PRIORITY_FA: Record<string, string> = {
  LOW: "کم",
  NORMAL: "عادی",
  HIGH: "بالا",
  URGENT: "فوری",
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#6b7280",
  NORMAL: "#2563eb",
  HIGH: "#d97706",
  URGENT: "#dc2626",
};

const PAGE_SIZE = 20;

interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  category: { name: string };
  user: { phone: string };
  assignedAdmin: { fullName: string } | null;
}

interface DashboardSummary {
  total: number;
  open: number;
  inProgress: number;
  waitingForUser: number;
  resolved: number;
  closed: number;
  urgent: number;
  unassigned: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function AdminTicketsListPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(search ? { search } : {}),
    page: String(page),
    limit: String(PAGE_SIZE),
  }).toString();

  const { data, isLoading } = useSWR<{ items: TicketRow[]; total: number }>(
    `/api/admin/tickets?${qs}`,
    fetcher,
  );
  const { data: summary } = useSWR<DashboardSummary>(
    "/api/admin/tickets/dashboard",
    fetcher,
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const resetToFirstPage = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-black text-gray-900">تیکت‌ها</h1>
        <Link
          href="/tickets/categories"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50"
        >
          <Tags className="w-4 h-4" />
          دسته‌بندی‌ها
        </Link>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-5">
          {[
            { label: "کل", value: summary.total },
            { label: "باز", value: summary.open },
            { label: "در حال بررسی", value: summary.inProgress },
            { label: "منتظر کاربر", value: summary.waitingForUser },
            { label: "حل شده", value: summary.resolved },
            { label: "بسته", value: summary.closed },
            { label: "فوری", value: summary.urgent },
            { label: "بدون کارشناس", value: summary.unassigned },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-gray-100 px-3 py-2.5 text-center"
            >
              <p className="text-base font-black text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => resetToFirstPage(() => setSearch(e.target.value))}
          placeholder="جستجو..."
          className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-gray-400 w-64"
        />
        <select
          value={status}
          onChange={(e) => resetToFirstPage(() => setStatus(e.target.value))}
          className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none"
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(STATUS_FA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => resetToFirstPage(() => setPriority(e.target.value))}
          className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none"
        >
          <option value="">همه اولویت‌ها</option>
          {Object.entries(PRIORITY_FA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-right text-gray-400 text-[11px] border-b border-gray-100">
              <th className="py-2 font-bold">شماره تیکت</th>
              <th className="py-2 font-bold">موضوع</th>
              <th className="py-2 font-bold">کاربر</th>
              <th className="py-2 font-bold">دسته‌بندی</th>
              <th className="py-2 font-bold">اولویت</th>
              <th className="py-2 font-bold">وضعیت</th>
              <th className="py-2 font-bold">کارشناس</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((t) => (
              <tr
                key={t.id}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/tickets/${t.id}`)}
              >
                <td className="py-3" dir="ltr">
                  {t.ticketNumber}
                </td>
                <td className="py-3 font-bold">{t.subject}</td>
                <td className="py-3" dir="ltr">
                  {t.user?.phone}
                </td>
                <td className="py-3">{t.category?.name}</td>
                <td className="py-3">
                  <span
                    className="text-[11px] font-bold"
                    style={{ color: PRIORITY_COLOR[t.priority] ?? "#6b7280" }}
                  >
                    {PRIORITY_FA[t.priority] ?? t.priority}
                  </span>
                </td>
                <td className="py-3">{STATUS_FA[t.status] ?? t.status}</td>
                <td className="py-3">{t.assignedAdmin?.fullName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && !data?.items?.length && (
        <p className="text-center text-gray-400 text-[13px] py-16">تیکتی یافت نشد</p>
      )}

      {!isLoading && data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-gray-200 disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] text-gray-500">
            صفحه {page} از {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold border border-gray-200 disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
