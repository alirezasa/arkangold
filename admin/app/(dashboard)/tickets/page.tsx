// admin/app/(dashboard)/tickets/page.tsx
"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2 } from "lucide-react";

const STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  WAITING_FOR_USER: "منتظر کاربر",
  RESOLVED: "حل شده",
  CLOSED: "بسته",
  REOPENED: "بازگشایی‌شده",
};

interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  category: { name: string };
  user: { phone: string };
  assignedAdmin: { name: string } | null;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function AdminTicketsListPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const qs = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  }).toString();

  const { data, isLoading } = useSWR<{ items: TicketRow[]; total: number }>(
    `/api/admin/tickets${qs ? `?${qs}` : ""}`,
    fetcher,
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-black text-gray-900">تیکت‌ها</h1>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو..."
          className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-gray-400 w-64"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none"
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(STATUS_FA).map(([k, v]) => (
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
                <td className="py-3">{STATUS_FA[t.status] ?? t.status}</td>
                <td className="py-3">{t.assignedAdmin?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isLoading && !data?.items?.length && (
        <p className="text-center text-gray-400 text-[13px] py-16">تیکتی یافت نشد</p>
      )}
    </div>
  );
}
