// admin/app/components/agents/LedgerViews.tsx
//
// صورتحساب نماینده، حواله‌های جابه‌جایی شمش و اسناد دفتر کل — مشترک بین پنل
// مدیریت و پرتال نماینده (به‌جز اسناد دفتر کل که فقط مدیریت می‌بیند).
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Download, Printer } from "lucide-react";
import {
  Badge,
  Empty,
  LEDGER_TYPE_FA,
  MOVEMENT_TYPE,
  Pagination,
  Spinner,
  downloadCsv,
  faDateTime,
  faNum,
  fetcher,
  secondaryBtn,
  toman,
} from "./ui";

// ═══════════════════════════ صورتحساب ═══════════════════════════

interface LedgerRow {
  id: string;
  type: string;
  debitRial: string;
  creditRial: string;
  balanceAfterRial: string;
  description: string;
  referenceNumber: string | null;
  journalEntryId: string | null;
  createdByAdmin: { fullName: string } | null;
  createdAt: string;
}

interface StatementResponse {
  agent: { id: string; code: string; name: string };
  openingBalanceRial: string;
  totalDebitRial: string;
  totalCreditRial: string;
  closingBalanceRial: string;
  currentBalanceRial: string;
  data: LedgerRow[];
  totalPages: number;
  total: number;
}

export function StatementView({
  endpoint,
  printHref,
}: {
  /** /api/admin/agents/:id/statement یا /api/agent-portal/statement */
  endpoint: string;
  /** مسیر نسخه‌ی چاپی (بدون from/to) */
  printHref: string;
}) {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ page: String(page), limit: "50" });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useSWR<StatementResponse>(`${endpoint}?${qs.toString()}`, fetcher);

  const range = new URLSearchParams();
  if (from) range.set("from", from);
  if (to) range.set("to", to);

  const exportCsv = async () => {
    const all = new URLSearchParams(range);
    all.set("limit", "200");
    const rows: LedgerRow[] = [];
    for (let p = 1; p <= 50; p++) {
      all.set("page", String(p));
      const res = await axios.get<StatementResponse>(`${endpoint}?${all.toString()}`);
      rows.push(...res.data.data);
      if (p >= res.data.totalPages) break;
    }
    downloadCsv(
      `agent-statement-${data?.agent.code ?? ""}.csv`,
      ["تاریخ", "نوع", "شماره مرجع", "شرح", "بدهکار (ریال)", "بستانکار (ریال)", "مانده (ریال)"],
      rows.map((r) => [
        new Date(r.createdAt).toLocaleString("fa-IR"),
        LEDGER_TYPE_FA[r.type] ?? r.type,
        r.referenceNumber,
        r.description,
        r.debitRial,
        r.creditRial,
        r.balanceAfterRial,
      ]),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-[11px] font-bold text-gray-500">
          از تاریخ
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
            dir="ltr"
          />
        </label>
        <label className="text-[11px] font-bold text-gray-500">
          تا تاریخ
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
            dir="ltr"
          />
        </label>
        <a
          href={`${printHref}${printHref.includes("?") ? "&" : "?"}${range.toString()}`}
          target="_blank"
          rel="noreferrer"
          className={secondaryBtn}
        >
          <Printer className="w-4 h-4" /> نسخه چاپی
        </a>
        <button type="button" onClick={() => void exportCsv()} className={secondaryBtn}>
          <Download className="w-4 h-4" /> خروجی اکسل
        </button>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-400">مانده ابتدای دوره</p>
              <p className="font-black">{toman(data.openingBalanceRial)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-400">جمع بدهکار (فروش/افزایش)</p>
              <p className="font-black text-red-600">{toman(data.totalDebitRial)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-400">جمع بستانکار (تسویه/کاهش)</p>
              <p className="font-black text-green-700">{toman(data.totalCreditRial)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-gray-400">مانده پایان دوره</p>
              <p className="font-black">{toman(data.closingBalanceRial)}</p>
            </div>
          </div>
          {!data.data.length ? (
            <Empty text="در این بازه گردشی ثبت نشده است" />
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table w-full min-w-[820px]">
                <thead>
                  <tr>
                    <th>تاریخ</th>
                    <th>نوع</th>
                    <th>شرح</th>
                    <th>بدهکار</th>
                    <th>بستانکار</th>
                    <th>مانده</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={r.id}>
                      <td className="text-[11px] text-gray-500 whitespace-nowrap">{faDateTime(r.createdAt)}</td>
                      <td>
                        <span className="badge bg-gray-100 text-gray-600">{LEDGER_TYPE_FA[r.type] ?? r.type}</span>
                        {r.referenceNumber && (
                          <p className="text-[10px] text-gray-400 mt-1" dir="ltr">
                            {r.referenceNumber}
                          </p>
                        )}
                      </td>
                      <td className="text-[12px] max-w-[320px]">
                        {r.description}
                        {r.createdByAdmin && <p className="text-[10px] text-gray-400">ثبت: {r.createdByAdmin.fullName}</p>}
                      </td>
                      <td className="text-red-600 font-bold">{Number(r.debitRial) ? toman(r.debitRial) : "—"}</td>
                      <td className="text-green-700 font-bold">{Number(r.creditRial) ? toman(r.creditRial) : "—"}</td>
                      <td className="font-black">{toman(r.balanceAfterRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-400">
            مبالغ به تومان. مانده‌ی مثبت یعنی بدهی نماینده به شرکت؛ منفی یعنی بستانکاری نماینده. مانده‌ی فعلی:{" "}
            <b>{toman(data.currentBalanceRial)} تومان</b>
          </p>
          <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════ حواله‌ها ═══════════════════════════

interface MovementRow {
  id: string;
  voucherNumber: string;
  type: string;
  weightGrams: string;
  note: string | null;
  createdAt: string;
  hologramCode: { code: string; purityKarat: string | null; factorySerialNumber: string | null };
  performedByAdmin: { fullName: string } | null;
  agent: { code: string; name: string };
}

export function MovementsView({
  endpoint,
  voucherHref,
  showAgent = false,
}: {
  endpoint: string;
  voucherHref: (voucherNumber: string) => string;
  showAgent?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const qs = new URLSearchParams({ page: String(page), limit: "30" });
  if (type) qs.set("type", type);
  const { data, isLoading } = useSWR<{ data: MovementRow[]; totalPages: number }>(`${endpoint}?${qs.toString()}`, fetcher);

  return (
    <div className="space-y-3">
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          setPage(1);
        }}
        className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
      >
        <option value="">همه حرکات</option>
        {Object.entries(MOVEMENT_TYPE).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <Empty text="حرکتی ثبت نشده است" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px]">
            <thead>
              <tr>
                <th>حواله / سند</th>
                <th>نوع</th>
                {showAgent && <th>نماینده</th>}
                <th>کد هولوگرام</th>
                <th>وزن (گرم)</th>
                <th>انجام‌دهنده</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.type === "ALLOCATION" || m.type === "RETURN" ? (
                      <a
                        href={voucherHref(m.voucherNumber)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline"
                        dir="ltr"
                        style={{ color: "var(--color-emerald)" }}
                      >
                        {m.voucherNumber}
                      </a>
                    ) : (
                      <span className="font-bold" dir="ltr">
                        {m.voucherNumber}
                      </span>
                    )}
                    {m.note && <p className="text-[10px] text-gray-400">{m.note}</p>}
                  </td>
                  <td>
                    <Badge map={MOVEMENT_TYPE} value={m.type} />
                  </td>
                  {showAgent && <td className="text-[12px]">{m.agent.name}</td>}
                  <td className="font-mono">{m.hologramCode.code}</td>
                  <td>{faNum(m.weightGrams)}</td>
                  <td className="text-[12px]">{m.performedByAdmin?.fullName ?? "—"}</td>
                  <td className="text-[11px] text-gray-500 whitespace-nowrap">{faDateTime(m.createdAt)}</td>
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

// ═══════════════════════════ اسناد دفتر کل ═══════════════════════════

interface JournalRow {
  id: string;
  description: string | null;
  totalRial: string;
  totalGrams: string;
  entryDate: string;
  ledgerEntries: {
    id: string;
    side: "DEBIT" | "CREDIT";
    amountRial: string;
    amountGrams: string;
    account: { code: string; name: string; type: string };
  }[];
}

export function JournalsView({ endpoint }: { endpoint: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<{ data: JournalRow[]; totalPages: number; total: number }>(
    `${endpoint}?page=${page}&limit=15`,
    fetcher,
  );
  if (isLoading || !data) return <Spinner />;
  if (!data.data.length) return <Empty text="سندی برای این نماینده ثبت نشده است" />;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">
        همه‌ی اسناد دوطرفه‌ی دفتر کل که به این نماینده مربوط است ({faNum(data.total)} سند). هر سند متوازن است: جمع بدهکار
        = جمع بستانکار (ریالی و وزنی).
      </p>
      {data.data.map((j) => (
        <div key={j.id} className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-2.5 bg-gray-50">
            <p className="text-[12px] font-black text-gray-800">{j.description}</p>
            <p className="text-[11px] text-gray-400">
              {faDateTime(j.entryDate)} · <span className="font-mono text-[10px]">{j.id.slice(0, 8)}</span>
            </p>
          </div>
          <table className="admin-table w-full">
            <thead>
              <tr>
                <th>حساب</th>
                <th>بدهکار (تومان)</th>
                <th>بستانکار (تومان)</th>
                <th>بدهکار (گرم)</th>
                <th>بستانکار (گرم)</th>
              </tr>
            </thead>
            <tbody>
              {j.ledgerEntries.map((l) => (
                <tr key={l.id}>
                  <td className="text-[12px]">
                    <span className="font-mono text-gray-400 ml-1">{l.account.code}</span>
                    {l.account.name}
                  </td>
                  <td>{l.side === "DEBIT" && Number(l.amountRial) ? toman(l.amountRial) : ""}</td>
                  <td>{l.side === "CREDIT" && Number(l.amountRial) ? toman(l.amountRial) : ""}</td>
                  <td>{l.side === "DEBIT" && Number(l.amountGrams) ? faNum(l.amountGrams, 4) : ""}</td>
                  <td>{l.side === "CREDIT" && Number(l.amountGrams) ? faNum(l.amountGrams, 4) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  );
}
