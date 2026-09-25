// admin/app/components/agents/InventoryTable.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Search, ShoppingCart } from "lucide-react";
import { Empty, Pagination, PURITY_FA, Spinner, faDateTime, faNum, fetcher, toman } from "./ui";

export interface InventoryItem {
  id: string;
  code: string;
  weightGrams: string | null;
  purityKarat: string | null;
  factorySerialNumber: string | null;
  mintedAt: string | null;
  agentAllocatedAt: string | null;
  agentPremiumRial: string | null;
  product: { id: string; name: string } | null;
  batch: { batchNumber: string };
}

/** موجودی امانی نماینده — در مدیریت قابل انتخاب برای عودت؛ در پرتال با دکمه‌ی فروش */
export default function InventoryTable({
  endpoint,
  selectable = false,
  selected,
  onSelectedChange,
  sellLink = false,
  refreshKey = 0,
}: {
  endpoint: string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (codes: string[]) => void;
  sellLink?: boolean;
  refreshKey?: number;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const qs = new URLSearchParams({ page: String(page), limit: "50" });
  if (query) qs.set("search", query);
  const { data, isLoading } = useSWR<{ data: InventoryItem[]; totalPages: number; total: number; totalGrams: string }>(
    [`${endpoint}?${qs.toString()}`, refreshKey],
    ([url]: [string, number]) => fetcher(url),
  );

  const sel = new Set(selected ?? []);
  const toggle = (code: string) => {
    const next = new Set(sel);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onSelectedChange?.([...next]);
  };
  const pageCodes = data?.data.map((i) => i.code) ?? [];
  const allOnPage = pageCodes.length > 0 && pageCodes.every((c) => sel.has(c));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <form
          className="relative flex-1 min-w-[200px] max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جست‌وجوی کد هولوگرام یا سریال"
            className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          />
        </form>
        {data && (
          <p className="text-[12px] text-gray-500">
            موجودی: <b className="text-gray-800">{faNum(data.total)} شمش</b> · <b className="text-gray-800">{faNum(data.totalGrams, 4)} گرم</b>
          </p>
        )}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <Empty text="شمش امانی موجود نیست" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px]">
            <thead>
              <tr>
                {selectable && (
                  <th>
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={() => {
                        const next = new Set(sel);
                        if (allOnPage) pageCodes.forEach((c) => next.delete(c));
                        else pageCodes.forEach((c) => next.add(c));
                        onSelectedChange?.([...next]);
                      }}
                      aria-label="انتخاب همه"
                    />
                  </th>
                )}
                <th>کد هولوگرام</th>
                <th>محصول / سریال</th>
                <th>وزن</th>
                <th>عیار</th>
                <th>اجرت (تومان)</th>
                <th>تاریخ تحویل</th>
                {sellLink && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.data.map((i) => (
                <tr key={i.id}>
                  {selectable && (
                    <td>
                      <input type="checkbox" checked={sel.has(i.code)} onChange={() => toggle(i.code)} aria-label={i.code} />
                    </td>
                  )}
                  <td className="font-mono font-bold">{i.code}</td>
                  <td className="text-[12px]">
                    {i.product?.name ?? "شمش طلا"}
                    <p className="text-[10px] text-gray-400" dir="ltr">
                      {i.factorySerialNumber ?? "—"} · {i.batch.batchNumber}
                    </p>
                  </td>
                  <td>{faNum(i.weightGrams, 4)} گرم</td>
                  <td>{i.purityKarat ? PURITY_FA[i.purityKarat] : "—"}</td>
                  <td>{toman(i.agentPremiumRial ?? 0)}</td>
                  <td className="text-[11px] text-gray-500">{faDateTime(i.agentAllocatedAt)}</td>
                  {sellLink && (
                    <td>
                      <Link
                        href={`/agent-portal/sell?code=${i.code}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-black text-white"
                        style={{ backgroundColor: "var(--color-emerald)" }}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" /> فروش
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}
