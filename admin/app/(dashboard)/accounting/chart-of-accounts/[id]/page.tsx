// admin/app/(dashboard)/accounting/chart-of-accounts/[id]/page.tsx — دفتر معین حساب
"use client";
import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, BookOpen } from "lucide-react";
import {
  Badge,
  CsvButton,
  DateRange,
  Num,
  PageHeader,
  Pagination,
  SOURCE,
  Spinner,
  Table,
  cardStyle,
  downloadCsv,
  faDateTime,
  fetcher,
  grams,
  signedToman,
  toman,
} from "@/app/components/finance/ui";
import JournalModal from "@/app/components/finance/JournalModal";

interface Statement {
  account: { code: string; name: string; isDebitNature: boolean; balanceRial: string; balanceGrams: string };
  openingRial: string;
  openingGrams: string;
  data: {
    id: string;
    accountCode: string;
    side: "DEBIT" | "CREDIT";
    amountRial: string;
    amountGrams: string;
    description: string | null;
    journalEntryId: string;
    referenceNumber: number;
    permanentNumber: number | null;
    source: string;
    entryDate: string;
    balanceRial: string;
    balanceGrams: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}

export default function AccountLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [journal, setJournal] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), limit: "50" });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useSWR<Statement>(`/api/admin/accounting/accounts/${id}/ledger?${qs}`, fetcher);

  const exportCsv = () =>
    data &&
    downloadCsv(
      `ledger-${data.account.code}.csv`,
      ["تاریخ", "شماره عطف", "شماره قطعی", "حساب", "شرح", "بدهکار (ریال)", "بستانکار (ریال)", "گرم", "مانده (ریال)", "مانده (گرم)"],
      data.data.map((r) => [
        faDateTime(r.entryDate),
        r.referenceNumber,
        r.permanentNumber,
        r.accountCode,
        r.description,
        r.side === "DEBIT" ? r.amountRial : "",
        r.side === "CREDIT" ? r.amountRial : "",
        `${r.side === "DEBIT" ? "" : "-"}${r.amountGrams}`,
        r.balanceRial,
        r.balanceGrams,
      ]),
    );

  return (
    <div className="space-y-5">
      <Link href="/accounting/chart-of-accounts" className="inline-flex items-center gap-1 text-[12px] font-bold text-gray-500">
        <ArrowRight className="w-4 h-4" /> سرفصل حساب‌ها
      </Link>
      <PageHeader
        icon={BookOpen}
        title={data ? `دفتر معین ${data.account.code} — ${data.account.name}` : "دفتر معین"}
        subtitle={
          data
            ? `مانده فعلی: ${signedToman(data.account.balanceRial)} تومان${
                Number(data.account.balanceGrams) ? ` — ${grams(data.account.balanceGrams)} گرم` : ""
              } — ماهیت ${data.account.isDebitNature ? "بدهکار" : "بستانکار"} (به‌همراه زیرحساب‌ها)`
            : undefined
        }
        actions={<CsvButton onClick={exportCsv} />}
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <DateRange
          from={from}
          to={to}
          onFrom={(v) => {
            setFrom(v);
            setPage(1);
          }}
          onTo={(v) => {
            setTo(v);
            setPage(1);
          }}
        />
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            {from && (
              <p className="text-[12px] font-bold text-gray-600">
                مانده ابتدای دوره: {signedToman(data.openingRial)} تومان
                {Number(data.openingGrams) ? ` — ${grams(data.openingGrams)} گرم` : ""}
              </p>
            )}
            <Table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>سند</th>
                  <th>شرح</th>
                  <th>بدهکار (تومان)</th>
                  <th>بستانکار (تومان)</th>
                  <th>گرم</th>
                  <th>مانده (تومان)</th>
                  <th>مانده (گرم)</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{faDateTime(r.entryDate)}</td>
                    <td>
                      <button type="button" onClick={() => setJournal(r.journalEntryId)} className="font-bold text-blue-700 hover:underline">
                        {r.referenceNumber.toLocaleString("fa-IR")}
                      </button>
                      <div>
                        <Badge map={SOURCE} value={r.source} />
                      </div>
                    </td>
                    <td className="max-w-md">
                      {r.description}
                      {r.accountCode !== data.account.code && <span className="text-[10px] text-gray-400"> ({r.accountCode})</span>}
                    </td>
                    <Num>{r.side === "DEBIT" ? toman(r.amountRial) : "—"}</Num>
                    <Num>{r.side === "CREDIT" ? toman(r.amountRial) : "—"}</Num>
                    <Num>{Number(r.amountGrams) ? `${r.side === "CREDIT" ? "−" : "+"}${grams(r.amountGrams)}` : "—"}</Num>
                    <Num bold>{signedToman(r.balanceRial)}</Num>
                    <Num>{grams(r.balanceGrams)}</Num>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
      {journal && <JournalModal id={journal} onClose={() => setJournal(null)} />}
    </div>
  );
}
