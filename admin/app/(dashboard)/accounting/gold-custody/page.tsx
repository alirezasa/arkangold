// admin/app/(dashboard)/accounting/gold-custody/page.tsx — طلای نزد بانک کارگشایی (حساب 1027)
"use client";
import { useState } from "react";
import useSWR from "swr";
import { ArrowDownToLine, ArrowUpFromLine, Landmark } from "lucide-react";
import {
  ActionButton,
  Alert,
  Field,
  Kpi,
  Num,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  faDate,
  fetcher,
  grams,
  inputCls,
  toman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import JalaliDateInput from "@/app/components/JalaliDateInput";

interface Row {
  code: string;
  name: string;
  grams: string;
  bookValueRial: string;
  averageCostPerGramRial: string;
  marketValueRial: string;
}

interface Summary {
  pricePerGramRial: string;
  vault: Row;
  atBank: Row;
  loanBalanceRial: string;
  history: {
    id: string;
    referenceNumber: number;
    entryDate: string;
    direction: "TO_BANK" | "FROM_BANK";
    grams: string;
    costRial: string;
    description: string | null;
    reference: string | null;
  }[];
}

export default function GoldCustodyPage() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<Summary>("/api/admin/accounting/gold-custody", fetcher);
  const act = useAction();
  const [direction, setDirection] = useState<"TO_BANK" | "FROM_BANK">("TO_BANK");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");

  const source = direction === "TO_BANK" ? data?.vault : data?.atBank;
  const estimate =
    source && Number(weight) > 0 ? Math.round(Number(source.averageCostPerGramRial) * Number(weight)) : null;

  const submit = async () => {
    const ok = await act.run(
      () =>
        api.post("/api/admin/accounting/gold-custody", {
          direction,
          grams: weight.trim(),
          date: date || undefined,
          reference: reference || undefined,
          description: description || undefined,
        }),
      direction === "TO_BANK"
        ? `${weight} گرم طلای ۷۵۰ از خزانه به بانک کارگشایی منتقل شود؟`
        : `${weight} گرم طلای ۷۵۰ از بانک کارگشایی به خزانه برگردد؟`,
    );
    if (ok) {
      setWeight("");
      setReference("");
      setDescription("");
      void mutate();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Landmark}
        title="طلای نزد بانک کارگشایی"
        subtitle="طلایی که به‌عنوان وثیقه‌ی تسهیلات یا امانت به بانک کارگشایی سپرده می‌شود همچنان دارایی شرکت است (حساب 1027). جابه‌جایی بین خزانه و بانک به بهای میانگین ثبت می‌شود؛ دریافت وام (بستانکار 2090) و کارمزد آن (بدهکار 5190) را با سند دستی ثبت کنید."
      />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="طلای خزانه (1020)" value={`${grams(data.vault.grams)} گرم`} hint={`بهای دفتری ${toman(data.vault.bookValueRial)} تومان`} />
            <Kpi title="طلای نزد بانک کارگشایی (1027)" value={`${grams(data.atBank.grams)} گرم`} hint={`بهای دفتری ${toman(data.atBank.bookValueRial)} تومان`} />
            <Kpi title="ارزش روز طلای نزد بانک" value={`${toman(data.atBank.marketValueRial)} تومان`} hint={`قیمت هر گرم ${toman(data.pricePerGramRial)} تومان`} />
            <Kpi title="مانده‌ی تسهیلات (2090)" value={`${toman(data.loanBalanceRial)} تومان`} />
          </div>

          {can("accounting.manage") && (
            <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("TO_BANK")}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold border ${direction === "TO_BANK" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-gray-200 text-gray-500"}`}
                >
                  <ArrowUpFromLine className="w-4 h-4" /> سپردن از خزانه به بانک
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("FROM_BANK")}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold border ${direction === "FROM_BANK" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-500"}`}
                >
                  <ArrowDownToLine className="w-4 h-4" /> بازگشت از بانک به خزانه
                </button>
              </div>
              <div className="grid md:grid-cols-4 gap-3">
                <Field label="وزن (گرم معادل ۷۵۰)" hint={source ? `موجودی مبدأ: ${grams(source.grams)} گرم` : undefined}>
                  <input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} dir="ltr" inputMode="decimal" placeholder="25.5" />
                </Field>
                <Field label="تاریخ تحویل" hint="خالی = همین الان">
                  <JalaliDateInput value={date} onChange={setDate} className={inputCls} />
                </Field>
                <Field label="شماره رسید / قرارداد بانک">
                  <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
                </Field>
                <Field label="توضیح">
                  <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="مثلاً وثیقه‌ی وام ۶ ماهه" />
                </Field>
              </div>
              {estimate != null && (
                <p className="text-[12px] text-gray-500">
                  بهای ثبت‌شده (میانگین موزون مبدأ): حدود <b>{toman(estimate)}</b> تومان
                </p>
              )}
              {act.error && <Alert kind="error" text={act.error} />}
              {act.success && <Alert kind="success" text={act.success} />}
              <ActionButton onClick={submit} busy={act.busy} disabled={!(Number(weight) > 0)}>
                ثبت انتقال
              </ActionButton>
            </div>
          )}

          <div className="rounded-2xl p-4" style={cardStyle}>
            <Table>
              <thead>
                <tr>
                  <th>عطف</th>
                  <th>تاریخ</th>
                  <th>جهت</th>
                  <th>وزن (گرم)</th>
                  <th>بها (تومان)</th>
                  <th>رسید</th>
                  <th>شرح</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <Num>{h.referenceNumber}</Num>
                    <td>{faDate(h.entryDate)}</td>
                    <td className={h.direction === "TO_BANK" ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                      {h.direction === "TO_BANK" ? "به بانک" : "به خزانه"}
                    </td>
                    <Num>{grams(h.grams)}</Num>
                    <Num>{toman(h.costRial)}</Num>
                    <td>{h.reference ?? "—"}</td>
                    <td className="text-[11px] text-gray-500 max-w-md">{h.description}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.history.length && <p className="text-center text-[12px] text-gray-400 py-6">هنوز انتقالی ثبت نشده است</p>}
          </div>
        </>
      )}
    </div>
  );
}
