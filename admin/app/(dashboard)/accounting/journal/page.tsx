// admin/app/(dashboard)/accounting/journal/page.tsx — دفتر روزنامه
"use client";
import { Fragment, useState } from "react";
import useSWR from "swr";
import { FileText } from "lucide-react";
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
  toman,
} from "@/app/components/finance/ui";
import JournalModal from "@/app/components/finance/JournalModal";

interface JournalRow {
  id: string;
  description: string | null;
  referenceNumber: number;
  permanentNumber: number | null;
  source: string;
  totalRial: string;
  totalGrams: string;
  entryDate: string;
  reversalOfId: string | null;
  lines?: { accountCode: string; accountName: string; side: string; amountRial: string; amountGrams: string; description: string | null }[];
}
interface JournalList {
  data: JournalRow[];
  page: number;
  totalPages: number;
  total: number;
}

export default function JournalBookPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState("");
  const [number, setNumber] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "30", withLines: String(expanded) });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (source) qs.set("source", source);
  if (search) qs.set("search", search);
  if (/^\d{4,10}$/.test(account)) qs.set("accountCode", account);
  if (/^\d+$/.test(number)) qs.set("referenceNumber", number);
  const { data, isLoading } = useSWR<JournalList>(`/api/admin/accounting/journal-entries?${qs}`, fetcher);
  const reset = () => setPage(1);

  const exportCsv = () =>
    data &&
    downloadCsv(
      "journal.csv",
      ["شماره عطف", "شماره قطعی", "تاریخ", "منبع", "شرح", "کد حساب", "حساب", "جهت", "مبلغ (ریال)", "گرم"],
      data.data.flatMap((j) =>
        (j.lines ?? [{ accountCode: "", accountName: "", side: "", amountRial: j.totalRial, amountGrams: j.totalGrams, description: null }]).map((l) => [
          j.referenceNumber,
          j.permanentNumber,
          faDateTime(j.entryDate),
          SOURCE[j.source]?.label ?? j.source,
          l.description ?? j.description,
          l.accountCode,
          l.accountName,
          l.side === "DEBIT" ? "بدهکار" : l.side === "CREDIT" ? "بستانکار" : "",
          l.amountRial,
          l.amountGrams,
        ]),
      ),
    );

  const inputSm = "px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white";
  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="دفتر روزنامه"
        subtitle="همه‌ی اسناد حسابداری به ترتیب تاریخ — سیستمی (معاملات، فروشگاه، واریز/برداشت)، خزانه، شرکا، دستی، افتتاحیه/اختتامیه و ارزیابی"
        actions={<CsvButton onClick={exportCsv} />}
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <DateRange
          from={from}
          to={to}
          onFrom={(v) => {
            setFrom(v);
            reset();
          }}
          onTo={(v) => {
            setTo(v);
            reset();
          }}
        >
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              reset();
            }}
            className={inputSm}
          >
            <option value="">همه‌ی منابع</option>
            {Object.entries(SOURCE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <input value={account} onChange={(e) => { setAccount(e.target.value); reset(); }} placeholder="کد حساب" className={`${inputSm} w-28`} dir="ltr" />
          <input value={number} onChange={(e) => { setNumber(e.target.value); reset(); }} placeholder="شماره سند" className={`${inputSm} w-28`} dir="ltr" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="جست‌وجو در شرح" className={inputSm} />
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 pb-2">
            <input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} /> نمایش سطرها
          </label>
        </DateRange>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <p className="text-[11px] text-gray-400">{data.total.toLocaleString("fa-IR")} سند</p>
            <Table>
              <thead>
                <tr>
                  <th>عطف</th>
                  <th>قطعی</th>
                  <th>تاریخ</th>
                  <th>منبع</th>
                  <th>شرح</th>
                  <th>مبلغ (تومان)</th>
                  <th>گرم</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((j) => (
                  <Fragment key={j.id}>
                    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setOpen(j.id)}>
                      <Num bold>{j.referenceNumber.toLocaleString("fa-IR")}</Num>
                      <Num>{j.permanentNumber?.toLocaleString("fa-IR") ?? "—"}</Num>
                      <td className="whitespace-nowrap">{faDateTime(j.entryDate)}</td>
                      <td>
                        <Badge map={SOURCE} value={j.source} />
                      </td>
                      <td className="max-w-lg">{j.description}</td>
                      <Num>{toman(j.totalRial)}</Num>
                      <Num>{Number(j.totalGrams) ? grams(j.totalGrams) : "—"}</Num>
                    </tr>
                    {expanded &&
                      j.lines?.map((l, i) => (
                        <tr key={`${j.id}-${i}`} className="bg-gray-50/60 text-[11px]">
                          <td colSpan={3}></td>
                          <td dir="ltr" className="text-left">
                            {l.accountCode}
                          </td>
                          <td className={l.side === "CREDIT" ? "pr-8" : ""}>
                            {l.side === "DEBIT" ? "بد: " : "بس: "}
                            {l.accountName}
                          </td>
                          <Num>{Number(l.amountRial) ? toman(l.amountRial) : "—"}</Num>
                          <Num>{Number(l.amountGrams) ? grams(l.amountGrams) : "—"}</Num>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
      {open && <JournalModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
