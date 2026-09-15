// admin/app/(dashboard)/tickets/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, Tags, Search, Headset, AlertTriangle, UserX, type LucideIcon } from "lucide-react";
import { STATUS_META, PRIORITY_META } from "./ticket-meta";

const STAT_TILES: { key: keyof DashboardSummary; label: string; color: string; icon: LucideIcon }[] = [
  { key: "total", label: "کل", color: "#330509", icon: Headset },
  { key: "open", label: "باز", color: STATUS_META.OPEN.color, icon: STATUS_META.OPEN.icon },
  { key: "inProgress", label: "در حال بررسی", color: STATUS_META.IN_PROGRESS.color, icon: STATUS_META.IN_PROGRESS.icon },
  { key: "waitingForUser", label: "منتظر کاربر", color: STATUS_META.WAITING_FOR_USER.color, icon: STATUS_META.WAITING_FOR_USER.icon },
  { key: "resolved", label: "حل شده", color: STATUS_META.RESOLVED.color, icon: STATUS_META.RESOLVED.icon },
  { key: "closed", label: "بسته", color: STATUS_META.CLOSED.color, icon: STATUS_META.CLOSED.icon },
  { key: "urgent", label: "فوری", color: "#dc2626", icon: AlertTriangle },
  { key: "unassigned", label: "بدون کارشناس", color: "#c5a059", icon: UserX },
];

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
  const [searchInput, setSearchInput] = useState("");
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

  const STATUS_FILTERS = [
    { key: "", label: "همه" },
    ...Object.entries(STATUS_META).map(([key, m]) => ({ key, label: m.label })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-black text-gray-900">تیکت‌ها</h1>
        <Link
          href="/tickets/categories"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold"
          style={{
            backgroundColor: "var(--color-surface)",
            color: "#6b7280",
            border: "1px solid var(--color-border)",
          }}
        >
          <Tags className="w-3.5 h-3.5" />
          دسته‌بندی‌ها
        </Link>
      </div>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.total.toLocaleString("fa-IR")} تیکت` : "..."}
      </p>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
          {STAT_TILES.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.key}
                className="rounded-xl p-3 text-center"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderTop: `3px solid ${t.color}`,
                }}
              >
                <Icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: t.color }} />
                <p className="text-lg font-black text-gray-900">
                  {summary[t.key].toLocaleString("fa-IR")}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{t.label}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="relative mb-3">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="جستجو با شماره تیکت یا موضوع..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setSearch(searchInput);
              setPage(1);
            }
          }}
          className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className="shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap"
              style={
                status === f.key
                  ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                  : {
                      backgroundColor: "var(--color-surface)",
                      color: "#6b7280",
                      border: "1px solid var(--color-border)",
                    }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={priority}
          onChange={(e) => {
            setPriority(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-bold outline-none focus:border-gold-500"
          style={{ backgroundColor: "var(--color-surface)" }}
        >
          <option value="">همه اولویت‌ها</option>
          {Object.entries(PRIORITY_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── نسخه دسکتاپ: جدول ── */}
      <div
        className="hidden sm:block rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>شماره تیکت</th>
              <th>موضوع</th>
              <th>کاربر</th>
              <th>دسته‌بندی</th>
              <th>اولویت</th>
              <th>وضعیت</th>
              <th>کارشناس</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.items?.length ? (
              <tr>
                <td colSpan={7} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Headset className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">تیکتی یافت نشد</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.items.map((t) => {
                const statusMeta = STATUS_META[t.status] ?? STATUS_META.OPEN;
                const priorityMeta = PRIORITY_META[t.priority] ?? PRIORITY_META.NORMAL;
                const StatusIcon = statusMeta.icon;
                return (
                  <tr
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/tickets/${t.id}`)}
                  >
                    <td dir="ltr" className="text-left">
                      {t.ticketNumber}
                    </td>
                    <td className="font-bold">{t.subject}</td>
                    <td dir="ltr" className="text-left">
                      {t.user?.phone}
                    </td>
                    <td className="text-gray-500">{t.category?.name}</td>
                    <td>
                      <span className="text-[12px] font-bold" style={{ color: priorityMeta.color }}>
                        {priorityMeta.label}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: statusMeta.bg, color: statusMeta.color }}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="text-gray-500">{t.assignedAdmin?.fullName ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── نسخه موبایل: کارت‌ها ── */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : !data?.items?.length ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Headset className="w-8 h-8 text-gray-200" />
            <p className="text-[12px] text-gray-400">تیکتی یافت نشد</p>
          </div>
        ) : (
          data.items.map((t) => {
            const statusMeta = STATUS_META[t.status] ?? STATUS_META.OPEN;
            const priorityMeta = PRIORITY_META[t.priority] ?? PRIORITY_META.NORMAL;
            const StatusIcon = statusMeta.icon;
            return (
              <div
                key={t.id}
                onClick={() => router.push(`/tickets/${t.id}`)}
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span dir="ltr" className="text-[12px] text-gray-400">
                    {t.ticketNumber}
                  </span>
                  <span
                    className="badge"
                    style={{ background: statusMeta.bg, color: statusMeta.color }}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {statusMeta.label}
                  </span>
                </div>
                <p className="text-[14px] font-black text-gray-900 mb-1.5">{t.subject}</p>
                <div className="flex items-center justify-between text-[12px] text-gray-500">
                  <span dir="ltr">{t.user?.phone}</span>
                  <span style={{ color: priorityMeta.color }} className="font-bold">
                    {priorityMeta.label}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 mt-1.5">
                  {t.category?.name} · {t.assignedAdmin?.fullName ?? "بدون کارشناس"}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isLoading && data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}
