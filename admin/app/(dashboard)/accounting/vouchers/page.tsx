// admin/app/(dashboard)/accounting/vouchers/page.tsx — اسناد حسابداری دستی (کنترل دوگانه)
"use client";
import { useState } from "react";
import useSWR from "swr";
import { FilePlus2, FileText, Plus, Receipt, Trash2 } from "lucide-react";
import {
  AccountSelect,
  ActionButton,
  Alert,
  Badge,
  Field,
  Modal,
  Num,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  VOUCHER_STATUS,
  VOUCHER_TYPE_FA,
  api,
  cardStyle,
  faDate,
  fetcher,
  grams,
  inputCls,
  todayIso,
  toman,
  tomanToRial,
  useAccounts,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import JournalModal from "@/app/components/finance/JournalModal";

interface Line {
  accountCode: string;
  side: "DEBIT" | "CREDIT";
  amountRial?: string;
  amountGrams?: string;
  description?: string;
}
interface Voucher {
  id: string;
  voucherNumber: string;
  type: string;
  status: string;
  entryDate: string;
  description: string;
  totalRial: string;
  totalGrams: string;
  lines: Line[];
  attachmentRef: string | null;
  createdBy: string | null;
  createdByAdminId: string;
  approvedBy: string | null;
  rejectReason: string | null;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
}
interface VoucherList {
  data: Voucher[];
  page: number;
  totalPages: number;
}

/** سطر فرم: مبلغ به تومان */
interface FormLine {
  accountCode: string;
  debit: string;
  credit: string;
  gramsDebit: string;
  gramsCredit: string;
  description: string;
}
const emptyLine = (): FormLine => ({ accountCode: "", debit: "", credit: "", gramsDebit: "", gramsCredit: "", description: "" });

function toFormLines(lines: Line[]): FormLine[] {
  return lines.map((l) => ({
    accountCode: l.accountCode,
    debit: l.side === "DEBIT" && Number(l.amountRial) ? String(Number(l.amountRial) / 10) : "",
    credit: l.side === "CREDIT" && Number(l.amountRial) ? String(Number(l.amountRial) / 10) : "",
    gramsDebit: l.side === "DEBIT" && Number(l.amountGrams) ? String(l.amountGrams) : "",
    gramsCredit: l.side === "CREDIT" && Number(l.amountGrams) ? String(l.amountGrams) : "",
    description: l.description ?? "",
  }));
}

function VoucherForm({ voucher, onDone }: { voucher?: Voucher; onDone: () => void }) {
  const [type, setType] = useState(voucher?.type ?? "GENERAL");
  const [entryDate, setEntryDate] = useState(voucher ? voucher.entryDate.slice(0, 10) : todayIso());
  const [description, setDescription] = useState(voucher?.description ?? "");
  const [attachmentRef, setAttachmentRef] = useState(voucher?.attachmentRef ?? "");
  const [lines, setLines] = useState<FormLine[]>(voucher ? toFormLines(voucher.lines) : [emptyLine(), emptyLine()]);
  const act = useAction();
  const { data: accounts } = useAccounts();

  const set = (i: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const n = (v: string) => Number(v.replace(/[,،\s]/g, "")) || 0;
  const totals = lines.reduce(
    (t, l) => ({ dr: t.dr + n(l.debit), cr: t.cr + n(l.credit), gd: t.gd + n(l.gramsDebit), gc: t.gc + n(l.gramsCredit) }),
    { dr: 0, cr: 0, gd: 0, gc: 0 },
  );
  const balanced = Math.abs(totals.dr - totals.cr) < 0.01 && Math.abs(totals.gd - totals.gc) < 0.00001;

  const payload = () => ({
    type,
    entryDate: new Date(`${entryDate}T12:00:00`).toISOString(),
    description,
    attachmentRef: attachmentRef || undefined,
    lines: lines
      .filter((l) => l.accountCode)
      .flatMap((l) => {
        const out: Line[] = [];
        const dr = n(l.debit);
        const cr = n(l.credit);
        const gd = n(l.gramsDebit);
        const gc = n(l.gramsCredit);
        if (dr || gd)
          out.push({ accountCode: l.accountCode, side: "DEBIT", amountRial: dr ? String(tomanToRial(l.debit)) : "0", amountGrams: gd ? String(gd) : "0", description: l.description || undefined });
        if (cr || gc)
          out.push({ accountCode: l.accountCode, side: "CREDIT", amountRial: cr ? String(tomanToRial(l.credit)) : "0", amountGrams: gc ? String(gc) : "0", description: l.description || undefined });
        return out;
      }),
  });

  const save = async () => {
    const ok = await act.run(() =>
      voucher ? api.patch(`/api/admin/accounting/vouchers/${voucher.id}`, payload()) : api.post("/api/admin/accounting/vouchers", payload()),
    );
    if (ok) onDone();
  };

  const opening = type === "OPENING";
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="نوع سند">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {Object.entries(VOUCHER_TYPE_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاریخ سند">
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="شماره مدرک پیوست" hint="شماره فاکتور، رسید بانکی، ...">
          <input value={attachmentRef} onChange={(e) => setAttachmentRef(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="شرح سند">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
      </Field>
      {opening && (
        <Alert
          kind="info"
          text="سند افتتاحیه می‌تواند حساب‌های کنترلی را هم شامل شود. برای موجودی شمش: بدهکار 1025 (ریال و گرم) / بستانکار 3010 سرمایه (ریال) و 1095 (گرم). برای طلای خزانه: بدهکار 1020 / بستانکار 3010 و 1090."
        />
      )}
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 rounded-xl border border-gray-100 bg-white">
            <div className="col-span-12 md:col-span-4">
              <AccountSelect value={l.accountCode} onChange={(v) => set(i, { accountCode: v })} filter={(a) => opening || a.allowManualEntry} />
            </div>
            <input placeholder="بدهکار (تومان)" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: "" })} className={`${inputCls} col-span-6 md:col-span-2`} dir="ltr" />
            <input placeholder="بستانکار (تومان)" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: "" })} className={`${inputCls} col-span-6 md:col-span-2`} dir="ltr" />
            <input placeholder="گرم بد." value={l.gramsDebit} onChange={(e) => set(i, { gramsDebit: e.target.value })} className={`${inputCls} col-span-3 md:col-span-1`} dir="ltr" />
            <input placeholder="گرم بس." value={l.gramsCredit} onChange={(e) => set(i, { gramsCredit: e.target.value })} className={`${inputCls} col-span-3 md:col-span-1`} dir="ltr" />
            <input placeholder="شرح سطر" value={l.description} onChange={(e) => set(i, { description: e.target.value })} className={`${inputCls} col-span-5 md:col-span-1`} />
            <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="col-span-1 p-2 text-gray-400 hover:text-red-600" aria-label="حذف سطر">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="flex items-center gap-1 text-[12px] font-bold text-blue-700">
          <Plus className="w-4 h-4" /> سطر جدید
        </button>
      </div>
      <div className={`p-3 rounded-xl text-[12px] font-bold ${balanced ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
        جمع بدهکار {totals.dr.toLocaleString("fa-IR")} — جمع بستانکار {totals.cr.toLocaleString("fa-IR")} تومان
        {(totals.gd || totals.gc) ? ` | گرم: ${totals.gd.toLocaleString("fa-IR")} / ${totals.gc.toLocaleString("fa-IR")}` : ""}
        {balanced ? " — تراز است" : " — تراز نیست"}
      </div>
      {accounts && act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!balanced || !description}>
        ثبت پیش‌نویس (ارسال برای تأیید)
      </ActionButton>
    </div>
  );
}

/** فرم سریع ثبت هزینه: حساب هزینه + حساب پرداخت + مبلغ */
function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [expense, setExpense] = useState("");
  const [cash, setCash] = useState("1010");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [attachmentRef, setAttachmentRef] = useState("");
  const act = useAction();
  const save = async () => {
    const rial = String(tomanToRial(amount));
    const ok = await act.run(() =>
      api.post("/api/admin/accounting/vouchers", {
        type: "EXPENSE",
        entryDate: new Date(`${entryDate}T12:00:00`).toISOString(),
        description,
        attachmentRef: attachmentRef || undefined,
        lines: [
          { accountCode: expense, side: "DEBIT", amountRial: rial },
          { accountCode: cash, side: "CREDIT", amountRial: rial },
        ],
      }),
    );
    if (ok) onDone();
  };
  return (
    <div className="space-y-3">
      <Field label="نوع هزینه">
        <AccountSelect value={expense} onChange={setExpense} filter={(a) => a.type === "EXPENSE" && a.allowManualEntry} />
      </Field>
      <Field label="پرداخت از" hint="صندوق/بانک یا حساب پرداختنی (برای هزینه‌ی پرداخت‌نشده)">
        <AccountSelect
          value={cash}
          onChange={setCash}
          filter={(a) => a.code.startsWith("1010") || a.code.startsWith("2050") || a.code.startsWith("2060") || a.code.startsWith("1070")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="مبلغ (تومان)">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="تاریخ">
          <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
      </div>
      <Field label="شرح">
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="مثلاً اجاره دفتر مرکزی — مهر ماه" />
      </Field>
      <Field label="شماره مدرک">
        <input value={attachmentRef} onChange={(e) => setAttachmentRef(e.target.value)} className={inputCls} />
      </Field>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!expense || !cash || !amount || !description}>
        ثبت هزینه (ارسال برای تأیید)
      </ActionButton>
    </div>
  );
}

export default function VouchersPage() {
  const can = usePerm();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"new" | "expense" | Voucher | null>(null);
  const [journal, setJournal] = useState<string | null>(null);
  const act = useAction();
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set("status", status);
  const { data, isLoading, mutate } = useSWR<VoucherList>(`/api/admin/accounting/vouchers?${qs}`, fetcher);

  const action = async (v: Voucher, kind: "approve" | "reject" | "reverse" | "cancel") => {
    let body: unknown = undefined;
    if (kind === "reject" || kind === "reverse") {
      const reason = window.prompt(kind === "reject" ? "دلیل رد سند:" : "دلیل برگشت سند:");
      if (!reason) return;
      body = { reason };
    }
    const confirmText =
      kind === "approve" ? `سند ${v.voucherNumber} تأیید و در دفتر کل ثبت شود؟` : kind === "cancel" ? "پیش‌نویس ابطال شود؟" : undefined;
    await act.run(() => api.post(`/api/admin/accounting/vouchers/${v.id}/${kind}`, body), confirmText);
    void mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="اسناد حسابداری دستی"
        subtitle="هزینه‌ها، اصلاحیه‌ها و سند افتتاحیه. هر سند پس از ثبت، توسط شخص دیگری تأیید و سپس در دفتر کل ثبت می‌شود (کنترل دوگانه). سند ثبت‌شده حذف نمی‌شود و فقط با سند برگشتی اصلاح می‌شود."
        actions={
          can("accounting.voucher.create") && (
            <>
              <ActionButton variant="secondary" onClick={() => setModal("expense")}>
                <Receipt className="w-4 h-4" /> ثبت هزینه
              </ActionButton>
              <ActionButton onClick={() => setModal("new")}>
                <FilePlus2 className="w-4 h-4" /> سند جدید
              </ActionButton>
            </>
          )
        }
      />
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
        >
          <option value="">همه‌ی وضعیت‌ها</option>
          {Object.entries(VOUCHER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>تاریخ</th>
                  <th>نوع</th>
                  <th>شرح</th>
                  <th>مبلغ (تومان)</th>
                  <th>گرم</th>
                  <th>وضعیت</th>
                  <th>ثبت / تأیید</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((v) => (
                  <tr key={v.id}>
                    <Num bold>{v.voucherNumber}</Num>
                    <td>{faDate(v.entryDate)}</td>
                    <td>{VOUCHER_TYPE_FA[v.type]}</td>
                    <td className="max-w-sm">
                      {v.description}
                      {v.rejectReason && <p className="text-[10px] text-red-500">{v.rejectReason}</p>}
                    </td>
                    <Num>{toman(v.totalRial)}</Num>
                    <Num>{Number(v.totalGrams) ? grams(v.totalGrams) : "—"}</Num>
                    <td>
                      <Badge map={VOUCHER_STATUS} value={v.status} />
                    </td>
                    <td className="text-[11px] text-gray-500">
                      {v.createdBy}
                      {v.approvedBy && <p>✓ {v.approvedBy}</p>}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {v.status === "DRAFT" && can("accounting.voucher.approve") && (
                          <>
                            <button type="button" className="text-[11px] font-bold text-green-700" onClick={() => void action(v, "approve")}>
                              تأیید
                            </button>
                            <button type="button" className="text-[11px] font-bold text-red-600" onClick={() => void action(v, "reject")}>
                              رد
                            </button>
                          </>
                        )}
                        {v.status === "DRAFT" && can("accounting.voucher.create") && (
                          <>
                            <button type="button" className="text-[11px] font-bold text-blue-700" onClick={() => setModal(v)}>
                              ویرایش
                            </button>
                            <button type="button" className="text-[11px] font-bold text-gray-500" onClick={() => void action(v, "cancel")}>
                              ابطال
                            </button>
                          </>
                        )}
                        {v.status === "POSTED" && can("accounting.voucher.approve") && (
                          <button type="button" className="text-[11px] font-bold text-purple-700" onClick={() => void action(v, "reverse")}>
                            برگشت
                          </button>
                        )}
                        {v.journalEntryId && (
                          <button type="button" className="text-[11px] font-bold text-gray-600" onClick={() => setJournal(v.journalEntryId)}>
                            سند
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
      {modal && (
        <Modal
          title={modal === "expense" ? "ثبت هزینه" : modal === "new" ? "سند حسابداری جدید" : `ویرایش ${modal.voucherNumber}`}
          onClose={() => setModal(null)}
          wide={modal !== "expense"}
        >
          {modal === "expense" ? (
            <ExpenseForm
              onDone={() => {
                setModal(null);
                void mutate();
              }}
            />
          ) : (
            <VoucherForm
              voucher={modal === "new" ? undefined : modal}
              onDone={() => {
                setModal(null);
                void mutate();
              }}
            />
          )}
        </Modal>
      )}
      {journal && <JournalModal id={journal} onClose={() => setJournal(null)} />}
    </div>
  );
}
