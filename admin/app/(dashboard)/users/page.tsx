// admin/app/(dashboard)/users/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  Search,
  Loader2,
  Users as UsersIcon,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

interface UserItem {
  id: string;
  phone: string;
  type: "REAL" | "LEGAL";
  status: string;
  fullName: string | null;
  identityStatus: string | null;
  rialBalance: string;
  goldBalanceGrams: string;
  createdAt: string;
}

const STATUS_STYLE: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  ACTIVE: { bg: "#dcfce7", color: "#16a34a", label: "فعال" },
  PENDING_ACTIVATION: {
    bg: "#fef3c7",
    color: "#b45309",
    label: "در انتظار فعال‌سازی",
  },
  BANNED: { bg: "#fee2e2", color: "#dc2626", label: "مسدود" },
  INACTIVE: { bg: "#f3f4f6", color: "#6b7280", label: "غیرفعال" },
};

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) qs.set("search", search);

  const { data, isLoading } = useSWR(
    `/api/admin/users?${qs.toString()}`,
    fetcher,
  );

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">کاربران</h1>
      <p className="text-[12px] text-gray-400 mb-5">
        {data ? `${data.total.toLocaleString("fa-IR")} کاربر` : "..."}
      </p>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="جستجو با شماره موبایل یا نام..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (setSearch(searchInput), setPage(1))
          }
          className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500"
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
              <th>موبایل</th>
              <th>نام</th>
              <th>نوع</th>
              <th>احراز هویت</th>
              <th>موجودی طلا</th>
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
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <UsersIcon className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400 font-medium">
                      کاربری یافت نشد
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((u: UserItem) => {
                const s = STATUS_STYLE[u.status] ?? STATUS_STYLE.INACTIVE;
                return (
                  <tr key={u.id}>
                    <td dir="ltr" className="text-left">
                      <Link
                        href={`/users/${u.id}`}
                        className="font-bold hover:underline"
                        style={{ color: "var(--color-emerald)" }}
                      >
                        {u.phone}
                      </Link>
                    </td>
                    <td>{u.fullName || "—"}</td>
                    <td>{u.type === "LEGAL" ? "حقوقی" : "حقیقی"}</td>
                    <td>
                      {u.identityStatus === "VERIFIED" ? (
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                      )}
                    </td>
                    <td>{Number(u.goldBalanceGrams).toFixed(3)} گ</td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })
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
