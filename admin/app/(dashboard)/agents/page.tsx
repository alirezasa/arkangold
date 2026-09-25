// admin/app/(dashboard)/agents/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Store, Plus, Search, Boxes, HandCoins, Coins, ArrowLeft, Users } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import {
  AGENT_STATUS,
  Alert,
  Badge,
  Empty,
  Kpi,
  Pagination,
  Spinner,
  cardStyle,
  commissionLabel,
  faNum,
  fetcher,
  primaryBtn,
  primaryBtnStyle,
  toman,
} from "@/app/components/agents/ui";
import AgentFormModal from "@/app/components/agents/AgentFormModal";

interface AgentRow {
  id: string;
  code: string;
  name: string;
  managerName: string;
  phone: string;
  city: string | null;
  status: string;
  commissionType: string;
  commissionValue: string;
  creditLimitRial: string | null;
  balanceRial: string;
  accountsCount: number;
  salesCount: number;
  pendingSettlements: number;
  stockCount: number;
  stockGrams: string;
}

interface Overview {
  agents: { active: number; suspended: number; terminated: number };
  stock: { count: number; grams: string };
  receivableRial: string;
  pendingSettlements: { count: number; amountRial: string };
  salesThisMonth: { count: number; totalRial: string; commissionRial: string; grams: string };
}

export default function AgentsPage() {
  const { me } = useAdminMe();
  const canManage = me?.permissions.includes("agent.manage") ?? false;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (query) qs.set("search", query);
  if (status) qs.set("status", status);
  const { data, isLoading, mutate } = useSWR<{ data: AgentRow[]; totalPages: number; total: number }>(
    `/api/admin/agents?${qs.toString()}`,
    fetcher,
  );
  const { data: overview } = useSWR<Overview>("/api/admin/agents/overview", fetcher);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Store className="w-5 h-5" /> نمایندگان فروش
          </h1>
          <p className="text-[12px] text-gray-400 mt-1">
            تعریف نماینده، تحویل امانی شمش، ثبت فروش برای مالک نهایی، تسویه و صورتحساب
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setCreating(true)} className={primaryBtn} style={primaryBtnStyle}>
            <Plus className="w-4 h-4" /> نماینده جدید
          </button>
        )}
      </div>

      {created && <Alert kind="success" text={created} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          title="نمایندگان فعال"
          icon={Users}
          value={overview ? faNum(overview.agents.active) : "…"}
          hint={overview ? `تعلیق: ${faNum(overview.agents.suspended)} · خاتمه: ${faNum(overview.agents.terminated)}` : undefined}
        />
        <Kpi
          title="شمش امانی نزد نمایندگان"
          icon={Boxes}
          color="#0f766e"
          value={overview ? `${faNum(overview.stock.count)} عدد` : "…"}
          hint={overview ? `${faNum(overview.stock.grams)} گرم` : undefined}
        />
        <Kpi
          title="مطالبات از نمایندگان"
          icon={HandCoins}
          color="#b91c1c"
          value={overview ? `${toman(overview.receivableRial)} تومان` : "…"}
          hint={
            overview && overview.pendingSettlements.count > 0
              ? `${faNum(overview.pendingSettlements.count)} تسویه در انتظار (${toman(overview.pendingSettlements.amountRial)} تومان)`
              : "تسویه در انتظاری وجود ندارد"
          }
        />
        <Kpi
          title="فروش این ماه"
          icon={Coins}
          color="#c5a059"
          value={overview ? `${toman(overview.salesThisMonth.totalRial)} تومان` : "…"}
          hint={
            overview
              ? `${faNum(overview.salesThisMonth.count)} شمش · ${faNum(overview.salesThisMonth.grams)} گرم · حق‌العمل ${toman(overview.salesThisMonth.commissionRial)}`
              : undefined
          }
        />
      </div>

      <div className="rounded-2xl p-4 space-y-4" style={cardStyle}>
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جست‌وجو: نام، کد، مدیر، موبایل یا شهر"
              className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="ACTIVE">فعال</option>
            <option value="SUSPENDED">تعلیق</option>
            <option value="TERMINATED">خاتمه همکاری</option>
          </select>
          <button type="submit" className={primaryBtn} style={primaryBtnStyle}>
            <Search className="w-4 h-4" /> جست‌وجو
          </button>
        </form>

        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <Empty text="نماینده‌ای یافت نشد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[900px]">
              <thead>
                <tr>
                  <th>نماینده</th>
                  <th>وضعیت</th>
                  <th>حق‌العمل</th>
                  <th>موجودی امانی</th>
                  <th>فروش قطعی</th>
                  <th>بدهی فعلی (تومان)</th>
                  <th>سقف اعتبار</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/agents/${a.id}`} className="font-black text-gray-900 hover:underline">
                        {a.name}
                      </Link>
                      <p className="text-[11px] text-gray-400">
                        <span dir="ltr">{a.code}</span> · {a.managerName} · {a.city ?? "—"}
                      </p>
                    </td>
                    <td>
                      <Badge map={AGENT_STATUS} value={a.status} />
                      {a.pendingSettlements > 0 && (
                        <p className="text-[10px] text-amber-600 font-bold mt-1">
                          {faNum(a.pendingSettlements)} تسویه در انتظار
                        </p>
                      )}
                    </td>
                    <td className="text-[12px]">{commissionLabel(a.commissionType, a.commissionValue)}</td>
                    <td>
                      <p className="font-bold">{faNum(a.stockCount)} شمش</p>
                      <p className="text-[11px] text-gray-400">{faNum(a.stockGrams)} گرم</p>
                    </td>
                    <td>{faNum(a.salesCount)}</td>
                    <td className={`font-black ${Number(a.balanceRial) > 0 ? "text-red-600" : "text-green-700"}`}>
                      {toman(a.balanceRial)}
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {a.creditLimitRial ? `${toman(a.creditLimitRial)} تومان` : "بدون سقف"}
                    </td>
                    <td>
                      <Link
                        href={`/agents/${a.id}`}
                        className="inline-flex items-center gap-1 text-[12px] font-bold"
                        style={{ color: "var(--color-emerald)" }}
                      >
                        مدیریت <ArrowLeft className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
      </div>

      {creating && (
        <AgentFormModal
          onClose={() => setCreating(false)}
          onSaved={async (agent) => {
            setCreating(false);
            setCreated(`نماینده «${agent.name}» با کد ${agent.code} ایجاد شد. از صفحه‌ی نماینده برای او حساب ورود بسازید.`);
            await mutate();
          }}
        />
      )}
    </div>
  );
}
