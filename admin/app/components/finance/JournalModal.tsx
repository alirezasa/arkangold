// admin/app/components/finance/JournalModal.tsx — نمایش سند حسابداری (سطرها، منبع، برگشت)
"use client";
import useSWR from "swr";
import { Badge, Modal, Num, SOURCE, Spinner, Table, faDateTime, fetcher, grams, toman } from "./ui";

interface JournalDetail {
  id: string;
  description: string | null;
  referenceNumber: number;
  permanentNumber: number | null;
  source: string;
  referenceType: string | null;
  createdBy: string | null;
  reversedBy: { id: string; referenceNumber: number } | null;
  reversalOf: { id: string; referenceNumber: number } | null;
  totalRial: string;
  totalGrams: string;
  entryDate: string;
  createdAt: string;
  lines: {
    accountCode: string;
    accountName: string;
    side: "DEBIT" | "CREDIT";
    description: string | null;
    amountRial: string;
    amountGrams: string;
  }[];
}

export default function JournalModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useSWR<JournalDetail>(`/api/admin/accounting/journal-entries/${id}`, fetcher);
  const sum = (side: string, key: "amountRial" | "amountGrams") =>
    (data?.lines ?? []).filter((l) => l.side === side).reduce((t, l) => t + Number(l[key]), 0);
  return (
    <Modal title={data ? `سند عطف ${data.referenceNumber.toLocaleString("fa-IR")}` : "سند حسابداری"} onClose={onClose} wide>
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
            <div>
              <p className="text-gray-400">تاریخ سند</p>
              <p className="font-bold">{faDateTime(data.entryDate)}</p>
            </div>
            <div>
              <p className="text-gray-400">شماره قطعی</p>
              <p className="font-bold">{data.permanentNumber?.toLocaleString("fa-IR") ?? "قطعی نشده"}</p>
            </div>
            <div>
              <p className="text-gray-400">منبع</p>
              <Badge map={SOURCE} value={data.source} />
            </div>
            <div>
              <p className="text-gray-400">ثبت‌کننده</p>
              <p className="font-bold">{data.createdBy ?? "سیستم"}</p>
            </div>
          </div>
          <p className="text-[13px] font-bold text-gray-800">{data.description}</p>
          {data.reversedBy && (
            <p className="text-[12px] text-red-600 font-bold">
              این سند با سند عطف {data.reversedBy.referenceNumber.toLocaleString("fa-IR")} برگشت خورده است
            </p>
          )}
          {data.reversalOf && (
            <p className="text-[12px] text-purple-700 font-bold">
              سند برگشتیِ سند عطف {data.reversalOf.referenceNumber.toLocaleString("fa-IR")}
            </p>
          )}
          <Table>
            <thead>
              <tr>
                <th>کد</th>
                <th>حساب</th>
                <th>بدهکار (تومان)</th>
                <th>بستانکار (تومان)</th>
                <th>بدهکار (گرم)</th>
                <th>بستانکار (گرم)</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={i}>
                  <Num bold>{l.accountCode}</Num>
                  <td>
                    {l.accountName}
                    {l.description && <p className="text-[10px] text-gray-400">{l.description}</p>}
                  </td>
                  <Num>{l.side === "DEBIT" && Number(l.amountRial) ? toman(l.amountRial) : "—"}</Num>
                  <Num>{l.side === "CREDIT" && Number(l.amountRial) ? toman(l.amountRial) : "—"}</Num>
                  <Num>{l.side === "DEBIT" && Number(l.amountGrams) ? grams(l.amountGrams) : "—"}</Num>
                  <Num>{l.side === "CREDIT" && Number(l.amountGrams) ? grams(l.amountGrams) : "—"}</Num>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-black">
                <td colSpan={2}>جمع</td>
                <Num>{toman(sum("DEBIT", "amountRial"))}</Num>
                <Num>{toman(sum("CREDIT", "amountRial"))}</Num>
                <Num>{grams(sum("DEBIT", "amountGrams"))}</Num>
                <Num>{grams(sum("CREDIT", "amountGrams"))}</Num>
              </tr>
            </tfoot>
          </Table>
        </div>
      )}
    </Modal>
  );
}
