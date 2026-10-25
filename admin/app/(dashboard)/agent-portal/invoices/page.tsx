// admin/app/(dashboard)/agent-portal/invoices/page.tsx
//
// صورتحساب‌ها و پیش‌فاکتورهایی که شرکت به نام نماینده صادر کرده است (خرید شمش از شرکت و
// فروش شمش امانی). فاکتور مشتریان نماینده را خود نماینده صادر می‌کند و در این فهرست نیست.
"use client";
import { useState } from "react";
import useSWR from "swr";
import { FileText, ReceiptText } from "lucide-react";
import { Alert, Empty, Pagination, Spinner, cardStyle, fetcher, toman } from "@/app/components/agents/ui";

interface InvoiceRow {
  id: string;
  kind: "INVOICE" | "PROFORMA";
  invoiceNumberFa: string;
  status: string;
  totalRial: string;
  issuedAtJalali: string;
  sourceType: string;
}

const STATUS_FA: Record<string, string> = {
  ISSUED: "صادرشده",
  PAID: "پرداخت‌شده",
  CONSUMED: "تبدیل به صورتحساب",
  EXPIRED: "منقضی",
  CANCELLED: "ابطال‌شده",
};

const SOURCE_FA: Record<string, string> = {
  AGENT_PURCHASE: "خرید شمش از شرکت",
  AGENT_SALE: "فروش شمش امانی (قیمت نمایندگی)",
};

export default function AgentCompanyInvoicesPage() {
  const [kind, setKind] = useState<"" | "INVOICE" | "PROFORMA">("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<{ items: InvoiceRow[]; page: number; totalPages: number }>(
    `/api/agent-portal/company-invoices?page=${page}&limit=20${kind ? `&kind=${kind}` : ""}`,
    fetcher,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <ReceiptText className="w-5 h-5" /> صورتحساب‌های شرکت به نام شما
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">صورتحساب‌های فروش و پیش‌فاکتورهایی که آرکان گلد به نام نمایندگی شما صادر کرده است.</p>
      </div>
      <Alert
        kind="info"
        text="شرکت برای مشتریانی که از شما خرید می‌کنند فاکتور صادر نمی‌کند؛ فاکتور فروش به مشتری را خودتان با کد اقتصادی نمایندگی در سامانه مؤدیان صادر کنید (بند ۸-۲ قرارداد)."
      />
      <div className="flex gap-1 p-1 rounded-2xl bg-gray-100 w-fit">
        {(
          [
            ["", "همه"],
            ["INVOICE", "صورتحساب فروش"],
            ["PROFORMA", "پیش‌فاکتور"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-[12px] font-black ${kind === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : !data.items.length ? (
          <Empty text="سندی صادر نشده است" />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[620px]">
              <thead>
                <tr>
                  <th>شماره سند</th>
                  <th>نوع</th>
                  <th>بابت</th>
                  <th>تاریخ</th>
                  <th>مبلغ (تومان)</th>
                  <th>وضعیت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td className="font-bold" dir="ltr">
                      {i.invoiceNumberFa}
                    </td>
                    <td>{i.kind === "PROFORMA" ? "پیش‌فاکتور" : "صورتحساب فروش"}</td>
                    <td className="text-[12px]">{SOURCE_FA[i.sourceType] ?? i.sourceType}</td>
                    <td className="text-[12px]">{i.issuedAtJalali}</td>
                    <td className="font-black">{toman(i.totalRial)}</td>
                    <td className="text-[12px]">{STATUS_FA[i.status] ?? i.status}</td>
                    <td>
                      <a href={`/invoices/${i.id}/print?scope=agent-company`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] font-bold" style={{ color: "var(--color-emerald)" }}>
                        <FileText className="w-4 h-4" /> مشاهده
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>
    </div>
  );
}
