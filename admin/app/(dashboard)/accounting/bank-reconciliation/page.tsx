// admin/app/(dashboard)/accounting/bank-reconciliation/page.tsx
//
// مغایرت‌گیری بانکی: انتخاب حساب بانک و تاریخ صورتحساب، علامت‌زدن سطرهایی که در صورتحساب بانک
// آمده‌اند و ثبت وقتی مانده‌ی تطبیق‌شده با مانده‌ی صورتحساب برابر است.
"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Landmark, RotateCcw } from "lucide-react";
import JalaliDateInput from "@/app/components/JalaliDateInput";
import { todayIsoLocal } from "@/app/utils/jalali";
import {
  AccountSelect,
  ActionButton,
  Alert,
  Empty,
  Field,
  Kpi,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  faDate,
  faDateTime,
  fetcher,
  inputCls,
  signedToman,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Workspace {
  account: { code: string; name: string; hasChildren: boolean };
  bookBalanceRial: string;
  clearedBalanceRial: string;
  openEntries: {
    id: string;
    side: "DEBIT" | "CREDIT";
    amountRial: string;
    description: string | null;
    referenceNumber: number;
    referenceType: string | null;
    entryDate: string;
  }[];
  history: {
    id: string;
    statementDate: string;
    statementBalanceRial: string;
    bookBalanceRial: string;
    clearedBalanceRial: string;
    differenceRial: string;
    outstandingDebitRial: string;
    outstandingCreditRial: string;
    note: string | null;
    createdAt: string;
  }[];
}

export default function BankReconciliationPage() {
  const [code, setCode] = useState("1010");
  const [date, setDate] = useState(todayIsoLocal());
  const [statementToman, setStatementToman] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const act = useAction();
  const can = usePerm();

  const { data, mutate, isLoading } = useSWR<Workspace>(
    code && date ? `/api/admin/accounting/bank-reconciliation/${code}?statementDate=${date}` : null,
    fetcher,
  );

  const newlyCleared = useMemo(() => {
    if (!data) return 0;
    return data.openEntries
      .filter((e) => selected.has(e.id))
      .reduce((s, e) => s + (e.side === "DEBIT" ? Number(e.amountRial) : -Number(e.amountRial)), 0);
  }, [data, selected]);

  const statementRial = statementToman.trim() ? tomanToRial(statementToman) : null;
  const clearedRial = data ? Number(data.clearedBalanceRial) + newlyCleared : 0;
  const diff = statementRial == null ? null : statementRial - clearedRial;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async (allowDifference: boolean) => {
    if (statementRial == null) return;
    const ok = await act.run(() =>
      api.post("/api/admin/accounting/bank-reconciliation", {
        accountCode: code,
        statementDate: date,
        statementBalanceRial: String(statementRial),
        entryIds: [...selected],
        note: note || undefined,
        allowDifference,
      }),
    );
    if (ok) {
      setSelected(new Set());
      setNote("");
      await mutate();
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={Landmark}
        title="مغایرت‌گیری بانکی"
        subtitle="سطرهای دفتر حساب بانک را با صورتحساب بانک تطبیق دهید. سطرهای تطبیق‌نشده تا تاریخ صورتحساب، واریز یا پرداخت در راه هستند. برای هر حساب بانکی شرکت یک معین زیر 1010 تعریف کنید."
      />

      <div className="rounded-2xl p-4 grid gap-3 md:grid-cols-3" style={cardStyle}>
        <Field label="حساب بانک">
          <AccountSelect
            value={code}
            onChange={(v) => {
              setCode(v);
              setSelected(new Set());
            }}
            filter={(a) => a.code.startsWith("1010")}
          />
        </Field>
        <Field label="تاریخ صورتحساب بانک">
          <JalaliDateInput
            value={date}
            onChange={(v) => {
              setDate(v);
              setSelected(new Set());
            }}
            clearable={false}
          />
        </Field>
        <Field label="مانده‌ی پایان صورتحساب بانک (تومان)">
          <input value={statementToman} onChange={(e) => setStatementToman(e.target.value)} className={`${inputCls} text-left`} dir="ltr" inputMode="numeric" />
        </Field>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {data.account.hasChildren && (
            <Alert kind="warn" text="این حساب کل است و معین دارد؛ مغایرت‌گیری را برای هر حساب بانکی معین جداگانه انجام دهید." />
          )}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi title="مانده‌ی دفتر تا تاریخ" value={`${signedToman(data.bookBalanceRial)} ت`} />
            <Kpi title="مانده‌ی تطبیق‌شده" value={`${signedToman(clearedRial)} ت`} hint={selected.size ? `شامل ${selected.size.toLocaleString("fa-IR")} سطر انتخابی` : undefined} />
            <Kpi title="مانده‌ی صورتحساب" value={statementRial == null ? "—" : `${signedToman(statementRial)} ت`} />
            <Kpi title="اختلاف" value={diff == null ? "—" : `${signedToman(diff)} ت`} color={diff === 0 ? "#16a34a" : "#dc2626"} />
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <div className="flex items-center justify-between">
              <p className="font-black text-[13px]">سطرهای تطبیق‌نشده تا {faDate(`${date}T12:00:00`)}</p>
              {data.openEntries.length > 0 && (
                <button
                  type="button"
                  className="text-[12px] font-bold text-emerald-700"
                  onClick={() => setSelected(selected.size === data.openEntries.length ? new Set() : new Set(data.openEntries.map((e) => e.id)))}
                >
                  {selected.size === data.openEntries.length ? "حذف انتخاب همه" : "انتخاب همه"}
                </button>
              )}
            </div>
            {data.openEntries.length === 0 ? (
              <Empty text="همه‌ی سطرها تا این تاریخ تطبیق شده‌اند" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th />
                    <th>تاریخ</th>
                    <th>عطف</th>
                    <th>شرح</th>
                    <th>واریز (بدهکار)</th>
                    <th>برداشت (بستانکار)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openEntries.map((e) => (
                    <tr key={e.id} className={selected.has(e.id) ? "bg-emerald-50/50" : ""}>
                      <td>
                        <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                      </td>
                      <td className="whitespace-nowrap">{faDate(e.entryDate)}</td>
                      <td>{e.referenceNumber.toLocaleString("fa-IR")}</td>
                      <td className="text-[11px]">{e.description}</td>
                      <td dir="ltr" className="text-left">
                        {e.side === "DEBIT" ? toman(e.amountRial) : ""}
                      </td>
                      <td dir="ltr" className="text-left">
                        {e.side === "CREDIT" ? toman(e.amountRial) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {can("accounting.bank_reconcile") && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح (برای ثبت با اختلاف الزامی است)" className={inputCls} />
                {act.error && <Alert kind="error" text={act.error} />}
                {act.success && <Alert kind="success" text={act.success} />}
                <div className="flex flex-wrap gap-2">
                  <ActionButton busy={act.busy} disabled={statementRial == null || diff !== 0} onClick={() => void submit(false)}>
                    ثبت مغایرت‌گیری
                  </ActionButton>
                  <ActionButton variant="secondary" busy={act.busy} disabled={statementRial == null || diff === 0 || note.trim().length < 5} onClick={() => void submit(true)}>
                    ثبت با اختلاف (با توضیح)
                  </ActionButton>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
            <div className="flex items-center justify-between">
              <p className="font-black text-[13px]">سوابق مغایرت‌گیری این حساب</p>
              {can("accounting.bank_reconcile") && data.history.length > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[12px] font-bold text-red-600"
                  onClick={() => void act.run(() => api.post(`/api/admin/accounting/bank-reconciliation/${code}/undo`), "آخرین مغایرت‌گیری برگردانده شود؟").then(() => mutate())}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> برگرداندن آخرین مورد
                </button>
              )}
            </div>
            {data.history.length === 0 ? (
              <Empty text="سابقه‌ای ثبت نشده است" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>تاریخ صورتحساب</th>
                    <th>مانده‌ی بانک</th>
                    <th>مانده‌ی دفتر</th>
                    <th>واریز در راه</th>
                    <th>پرداخت در راه</th>
                    <th>اختلاف</th>
                    <th>ثبت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td>{faDate(h.statementDate)}</td>
                      <td>{signedToman(h.statementBalanceRial)}</td>
                      <td>{signedToman(h.bookBalanceRial)}</td>
                      <td>{toman(h.outstandingDebitRial)}</td>
                      <td>{toman(h.outstandingCreditRial)}</td>
                      <td className={Number(h.differenceRial) ? "text-red-600 font-bold" : ""}>
                        {signedToman(h.differenceRial)}
                        {h.note && <p className="text-[10px] text-gray-400">{h.note}</p>}
                      </td>
                      <td className="text-[11px]">{faDateTime(h.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
