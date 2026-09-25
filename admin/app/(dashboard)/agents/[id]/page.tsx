// admin/app/(dashboard)/agents/[id]/page.tsx
"use client";
import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  ArrowRight,
  Boxes,
  HandCoins,
  Coins,
  Scale,
  Pencil,
  Power,
  PackagePlus,
  Undo2,
  UserPlus,
  KeyRound,
  Store,
  Phone,
  MapPin,
  FileSignature,
  Wallet,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import {
  AGENT_STATUS,
  Alert,
  Badge,
  Empty,
  Kpi,
  Spinner,
  cardStyle,
  commissionLabel,
  faDate,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
} from "@/app/components/agents/ui";
import AgentFormModal, { type AgentFormValue } from "@/app/components/agents/AgentFormModal";
import InventoryTable from "@/app/components/agents/InventoryTable";
import SalesTable from "@/app/components/agents/SalesTable";
import SettlementsTable from "@/app/components/agents/SettlementsTable";
import { JournalsView, MovementsView, StatementView } from "@/app/components/agents/LedgerViews";
import {
  AccountModal,
  AdjustmentModal,
  AllocateModal,
  ResetPasswordModal,
  ReturnModal,
  SettlementModal,
  StatusModal,
} from "@/app/components/agents/AgentActionModals";

interface AgentDetail {
  agent: AgentFormValue & {
    id: string;
    code: string;
    status: string;
    balanceRial: string;
    createdAt: string;
  };
  stock: { count: number; grams: string };
  balanceRial: string;
  creditLimitRial: string | null;
  availableCreditRial: string | null;
  sales: { count: number; totalRial: string; commissionRial: string; netPayableRial: string; grams: string };
  salesThisMonth: { count: number; totalRial: string; commissionRial: string; grams: string };
  settlements: { approvedCount: number; approvedRial: string; pendingCount: number; pendingRial: string };
  accounts: {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    lockedUntil: string | null;
    createdAt: string;
  }[];
  createdBy: string | null;
}

type Tab = "inventory" | "sales" | "settlements" | "statement" | "movements" | "journals" | "accounts" | "info";

type ModalState =
  | null
  | "edit"
  | "status"
  | "allocate"
  | "return"
  | "settlement"
  | "adjust"
  | "account"
  | { reset: { id: string; username: string } };

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useAdminMe();
  const perm = (p: string) => me?.permissions.includes(p) ?? false;
  const { data, isLoading, error, mutate } = useSWR<AgentDetail>(`/api/admin/agents/${id}`, fetcher);
  const [tab, setTab] = useState<Tab>("inventory");
  const [modal, setModal] = useState<ModalState>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const done = async (text: string) => {
    setModal(null);
    setMessage({ kind: "success", text });
    setSelectedCodes([]);
    setRefreshKey((k) => k + 1);
    await mutate();
  };

  const toggleAccount = async (accountId: string, isActive: boolean) => {
    try {
      await axios.patch(`/api/admin/agents/${id}/accounts/${accountId}`, { isActive });
      await done(isActive ? "حساب ورود فعال شد" : "حساب ورود غیرفعال و نشست‌هایش باطل شد");
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err, "تغییر وضعیت حساب ممکن نشد") });
    }
  };

  if (isLoading) return <Spinner />;
  if (error || !data)
    return <Alert kind="error" text={getErrorMessage(error, "نماینده یافت نشد یا دسترسی ندارید")} />;

  const a = data.agent;
  const lite = { id: a.id, code: a.code, name: a.name, balanceRial: data.balanceRial };
  const balance = Number(data.balanceRial);

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "inventory", label: `موجودی امانی (${faNum(data.stock.count)})`, show: true },
    { key: "sales", label: "فروش‌ها", show: true },
    {
      key: "settlements",
      label: `تسویه‌ها${data.settlements.pendingCount ? ` (${faNum(data.settlements.pendingCount)} در انتظار)` : ""}`,
      show: true,
    },
    { key: "statement", label: "صورتحساب", show: true },
    { key: "movements", label: "حواله‌ها", show: true },
    { key: "journals", label: "اسناد حسابداری", show: true },
    { key: "accounts", label: `حساب‌های ورود (${faNum(data.accounts.length)})`, show: true },
    { key: "info", label: "اطلاعات و قرارداد", show: true },
  ];

  return (
    <div className="space-y-5">
      <Link href="/agents" className="inline-flex items-center gap-1 text-[12px] font-bold text-gray-500">
        <ArrowRight className="w-4 h-4" /> بازگشت به نمایندگان
      </Link>

      {/* ── هدر ── */}
      <div className="rounded-2xl p-5 flex items-start justify-between gap-4 flex-wrap" style={cardStyle}>
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" }}
          >
            <Store className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-[18px] font-black text-gray-900 flex items-center gap-2 flex-wrap">
              {a.name} <Badge map={AGENT_STATUS} value={a.status} />
            </h1>
            <p className="text-[12px] text-gray-500 mt-1">
              <span dir="ltr">{a.code}</span> · {a.managerName} · <Phone className="inline w-3 h-3" />{" "}
              <span dir="ltr">{a.phone}</span>
              {a.city && (
                <>
                  {" "}
                  · <MapPin className="inline w-3 h-3" /> {a.city}
                </>
              )}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">حق‌العمل: {commissionLabel(a.commissionType, a.commissionValue)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {perm("agent.stock.manage") && a.status === "ACTIVE" && (
            <button type="button" onClick={() => setModal("allocate")} className={primaryBtn} style={primaryBtnStyle}>
              <PackagePlus className="w-4 h-4" /> تحویل شمش
            </button>
          )}
          {perm("agent.settlement.manage") && (
            <button type="button" onClick={() => setModal("settlement")} className={secondaryBtn}>
              <HandCoins className="w-4 h-4" /> ثبت دریافت وجه
            </button>
          )}
          {perm("agent.settlement.manage") && (
            <button type="button" onClick={() => setModal("adjust")} className={secondaryBtn}>
              <Scale className="w-4 h-4" /> اصلاحیه
            </button>
          )}
          {perm("agent.manage") && (
            <>
              <button type="button" onClick={() => setModal("edit")} className={secondaryBtn}>
                <Pencil className="w-4 h-4" /> ویرایش
              </button>
              <button type="button" onClick={() => setModal("status")} className={secondaryBtn}>
                <Power className="w-4 h-4" /> وضعیت
              </button>
            </>
          )}
        </div>
      </div>

      {message && <Alert kind={message.kind} text={message.text} />}

      {/* ── شاخص‌ها ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          title="موجودی امانی"
          icon={Boxes}
          color="#0f766e"
          value={`${faNum(data.stock.count)} شمش`}
          hint={`${faNum(data.stock.grams, 4)} گرم`}
        />
        <Kpi
          title="بدهی فعلی نماینده"
          icon={Wallet}
          color={balance > 0 ? "#b91c1c" : "#15803d"}
          value={`${toman(data.balanceRial)} تومان`}
          hint={
            data.creditLimitRial
              ? `سقف ${toman(data.creditLimitRial)} · باقی‌مانده ${toman(data.availableCreditRial)}`
              : "بدون سقف اعتبار"
          }
        />
        <Kpi
          title="کل فروش قطعی"
          icon={Coins}
          color="#c5a059"
          value={`${toman(data.sales.totalRial)} تومان`}
          hint={`${faNum(data.sales.count)} شمش · ${faNum(data.sales.grams, 4)} گرم · حق‌العمل ${toman(data.sales.commissionRial)}`}
        />
        <Kpi
          title="تسویه‌شده"
          icon={HandCoins}
          value={`${toman(data.settlements.approvedRial)} تومان`}
          hint={
            data.settlements.pendingCount
              ? `${faNum(data.settlements.pendingCount)} در انتظار: ${toman(data.settlements.pendingRial)} تومان`
              : `${faNum(data.settlements.approvedCount)} تسویه`
          }
        />
      </div>

      {/* ── تب‌ها ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap border ${
              tab === t.key ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200"
            }`}
            style={tab === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        {tab === "inventory" && (
          <div className="space-y-3">
            {perm("agent.stock.manage") && (
              <div className="flex gap-2 flex-wrap items-center">
                <button
                  type="button"
                  disabled={!selectedCodes.length}
                  onClick={() => setModal("return")}
                  className={secondaryBtn}
                >
                  <Undo2 className="w-4 h-4" /> عودت {selectedCodes.length ? `${faNum(selectedCodes.length)} شمش انتخاب‌شده` : "شمش‌های انتخاب‌شده"}
                </button>
                <span className="text-[11px] text-gray-400">برای عودت، شمش‌ها را از فهرست انتخاب کنید.</span>
              </div>
            )}
            <InventoryTable
              endpoint={`/api/admin/agents/${id}/inventory`}
              selectable={perm("agent.stock.manage")}
              selected={selectedCodes}
              onSelectedChange={setSelectedCodes}
              refreshKey={refreshKey}
            />
          </div>
        )}
        {tab === "sales" && (
          <SalesTable
            listEndpoint="/api/admin/agents/sales"
            agentId={id}
            detailEndpoint={(sid) => `/api/admin/agents/sales/${sid}`}
            invoiceIssueEndpoint={(sid) => `/api/admin/agents/sales/${sid}/invoice`}
            canVoid={perm("agent.sale.void")}
            invoiceScope="admin"
          />
        )}
        {tab === "settlements" && (
          <SettlementsTable
            listEndpoint="/api/admin/agents/settlements"
            agentId={id}
            canReview={perm("agent.settlement.manage")}
            refreshKey={refreshKey}
            onChanged={() => void mutate()}
          />
        )}
        {tab === "statement" && (
          <StatementView
            key={refreshKey}
            endpoint={`/api/admin/agents/${id}/statement`}
            printHref={`/agent-docs/statement?agentId=${id}`}
          />
        )}
        {tab === "movements" && (
          <MovementsView
            key={refreshKey}
            endpoint={`/api/admin/agents/${id}/movements`}
            voucherHref={(v) => `/agent-docs/voucher/${encodeURIComponent(v)}`}
          />
        )}
        {tab === "journals" && <JournalsView key={refreshKey} endpoint={`/api/admin/agents/${id}/journals`} />}
        {tab === "accounts" && (
          <div className="space-y-3">
            {perm("agent.manage") && a.status !== "TERMINATED" && (
              <button type="button" onClick={() => setModal("account")} className={primaryBtn} style={primaryBtnStyle}>
                <UserPlus className="w-4 h-4" /> حساب ورود جدید
              </button>
            )}
            <p className="text-[11px] text-gray-400">
              نماینده با این حساب‌ها از همان صفحه‌ی ورود پنل وارد می‌شود و فقط پرتال نمایندگی خودش را می‌بیند.
            </p>
            {!data.accounts.length ? (
              <Empty text="هنوز حساب ورودی برای این نماینده ساخته نشده است" />
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <th>کاربر</th>
                      <th>وضعیت</th>
                      <th>آخرین ورود</th>
                      <th>ایجاد</th>
                      {perm("agent.manage") && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((acc) => (
                      <tr key={acc.id}>
                        <td>
                          <p className="font-bold">{acc.fullName}</p>
                          <p className="text-[11px] text-gray-400" dir="ltr">
                            @{acc.username} {acc.phone ? `· ${acc.phone}` : ""}
                          </p>
                        </td>
                        <td>
                          {acc.isActive ? (
                            <span className="badge bg-green-50 text-green-700">فعال</span>
                          ) : (
                            <span className="badge bg-gray-100 text-gray-500">غیرفعال</span>
                          )}
                          {acc.lockedUntil && new Date(acc.lockedUntil) > new Date() && (
                            <span className="badge bg-red-50 text-red-600 mr-1">قفل موقت</span>
                          )}
                        </td>
                        <td className="text-[11px] text-gray-500">
                          {faDateTime(acc.lastLoginAt)}
                          {acc.lastLoginIp && (
                            <p dir="ltr" className="text-right">
                              {acc.lastLoginIp}
                            </p>
                          )}
                        </td>
                        <td className="text-[11px] text-gray-500">{faDate(acc.createdAt)}</td>
                        {perm("agent.manage") && (
                          <td>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => void toggleAccount(acc.id, !acc.isActive)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-700"
                              >
                                {acc.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setModal({ reset: { id: acc.id, username: acc.username } })}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-700"
                              >
                                <KeyRound className="w-3.5 h-3.5" /> رمز جدید
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {tab === "info" && (
          <div className="grid gap-4 sm:grid-cols-2 text-[12px]">
            {[
              ["کد نماینده", <span key="c" dir="ltr">{a.code}</span>],
              ["نام نمایندگی", a.name],
              ["مدیر / مسئول", a.managerName],
              ["کد ملی", a.nationalCode ?? "—"],
              ["موبایل", <span key="p" dir="ltr">{a.phone}</span>],
              ["ایمیل", a.email ?? "—"],
              ["استان / شهر", [a.province, a.city].filter(Boolean).join(" / ") || "—"],
              ["کد پستی", a.postalCode ?? "—"],
              ["نشانی", a.address ?? "—"],
              ["شماره قرارداد", a.contractNumber ?? "—"],
              ["مدت قرارداد", `${faDate(a.contractStartAt)} تا ${faDate(a.contractEndAt)}`],
              ["حق‌العمل", commissionLabel(a.commissionType, a.commissionValue)],
              ["سقف اعتبار", data.creditLimitRial ? `${toman(data.creditLimitRial)} تومان` : "بدون سقف"],
              ["تعریف‌شده توسط", `${data.createdBy ?? "—"} · ${faDate(a.createdAt)}`],
            ].map(([label, value], i) => (
              <div key={i} className="flex justify-between gap-3 py-2 border-b border-gray-50">
                <span className="text-gray-400">{label}</span>
                <span className="font-bold text-gray-800 text-left">{value}</span>
              </div>
            ))}
            {a.notes && (
              <div className="sm:col-span-2 rounded-xl bg-gray-50 p-3 whitespace-pre-line">
                <p className="text-gray-400 mb-1 flex items-center gap-1">
                  <FileSignature className="w-3.5 h-3.5" /> یادداشت‌ها
                </p>
                {a.notes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── مودال‌ها ── */}
      {modal === "edit" && (
        <AgentFormModal
          initial={a}
          onClose={() => setModal(null)}
          onSaved={() => done("اطلاعات نماینده ذخیره شد")}
        />
      )}
      {modal === "status" && <StatusModal agent={lite} current={a.status} onClose={() => setModal(null)} onDone={done} />}
      {modal === "allocate" && <AllocateModal agent={lite} onClose={() => setModal(null)} onDone={done} />}
      {modal === "return" && (
        <ReturnModal agent={lite} codes={selectedCodes} onClose={() => setModal(null)} onDone={done} />
      )}
      {modal === "settlement" && (
        <SettlementModal
          endpoint={`/api/admin/agents/${id}/settlements`}
          title={`ثبت دریافت وجه از «${a.name}»`}
          balanceRial={data.balanceRial}
          intro="وجهی که از نماینده دریافت شده را ثبت کنید. تسویه بلافاصله تأیید، سند «بدهکار موجودی نقد / بستانکار دریافتنی از نمایندگان» صادر و از بدهی نماینده کسر می‌شود."
          submitLabel="ثبت و تأیید تسویه"
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {modal === "adjust" && <AdjustmentModal agent={lite} onClose={() => setModal(null)} onDone={done} />}
      {modal === "account" && <AccountModal agent={lite} onClose={() => setModal(null)} onDone={done} />}
      {modal && typeof modal === "object" && "reset" in modal && (
        <ResetPasswordModal agentId={id} account={modal.reset} onClose={() => setModal(null)} onDone={done} />
      )}
    </div>
  );
}
