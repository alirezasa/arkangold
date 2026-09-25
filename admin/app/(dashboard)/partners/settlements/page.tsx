// admin/app/(dashboard)/partners/settlements/page.tsx — تسویه‌های دریافتی از شرکای فروش
"use client";
import { useState } from "react";
import useSWR from "swr";
import { HandCoins, Plus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Field,
  Modal,
  Num,
  PageHeader,
  Pagination,
  SETTLEMENT_METHOD_FA,
  Spinner,
  Table,
  api,
  cardStyle,
  faDate,
  fetcher,
  inputCls,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Settlement {
  id: string;
  settlementNumber: string;
  partnerName: string;
  partnerCode: string;
  amountRial: string;
  method: string;
  cashAccountCode: string;
  referenceNumber: string | null;
  paidAt: string;
  note: string | null;
  orderCount: number;
}
interface OpenOrder {
  id: string;
  orderNumber: string;
  externalRef: string;
  netReceivableRial: string;
  dueDate: string | null;
  overdue: boolean;
}

function SettlementForm({ onDone }: { onDone: () => void }) {
  const { data: partners } = useSWR<{ data: { id: string; code: string; name: string; balanceRial: string }[] }>("/api/admin/partners?limit=200", fetcher);
  const [partnerId, setPartnerId] = useState("");
  const { data: open } = useSWR<{ data: OpenOrder[] }>(partnerId ? `/api/admin/partners/orders?partnerId=${partnerId}&status=CONFIRMED&limit=200` : null, fetcher);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [cash, setCash] = useState("1010");
  const [ref, setRef] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [note, setNote] = useState("");
  const [auto, setAuto] = useState(true);
  const act = useAction();
  const selectedSum = (open?.data ?? []).filter((o) => selected.includes(o.id)).reduce((t, o) => t + Number(o.netReceivableRial), 0);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const save = async () => {
    const ok = await act.run(() =>
      api.post("/api/admin/partners/settlements", {
        partnerId,
        amountRial: String(tomanToRial(amount)),
        method,
        cashAccountCode: cash,
        referenceNumber: ref || undefined,
        paidAt: paidAt || undefined,
        note: note || undefined,
        orderIds: selected.length ? selected : undefined,
        autoAllocate: !selected.length && auto,
      }),
    );
    if (ok) onDone();
  };
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="شریک">
          <select
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value);
              setSelected([]);
            }}
            className={inputCls}
          >
            <option value="">انتخاب کنید</option>
            {partners?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name} (طلب {toman(p.balanceRial)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="مبلغ واریزی (تومان)" hint={selected.length ? `جمع سفارش‌های انتخابی: ${toman(selectedSum)} تومان` : undefined}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="روش">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {Object.entries(SETTLEMENT_METHOD_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="حساب بانکی مقصد" hint="1010 یا زیرحساب بانکی آن">
          <input value={cash} onChange={(e) => setCash(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="شماره پیگیری">
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} />
        </Field>
        <Field label="تاریخ واریز">
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} dir="ltr" />
        </Field>
      </div>
      {open && open.data.length > 0 && (
        <div className="space-y-1 max-h-60 overflow-y-auto border border-gray-100 rounded-xl p-2">
          <p className="text-[12px] font-bold text-gray-600">سفارش‌های تسویه‌نشده (انتخاب برای تخصیص):</p>
          {open.data.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.orderNumber} ({o.externalRef}) — {toman(o.netReceivableRial)} تومان — سررسید {faDate(o.dueDate)}
              {o.overdue && <span className="text-red-600 font-bold">معوق</span>}
            </label>
          ))}
        </div>
      )}
      {!selected.length && (
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> تخصیص خودکار به قدیمی‌ترین سررسیدها
        </label>
      )}
      <Field label="توضیحات">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!partnerId || !Number(amount)}>
        ثبت تسویه
      </ActionButton>
    </div>
  );
}

export default function PartnerSettlementsPage() {
  const can = usePerm();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const { data, isLoading, mutate } = useSWR<{ data: Settlement[]; page: number; totalPages: number }>(`/api/admin/partners/settlements?page=${page}`, fetcher);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={HandCoins}
        title="تسویه‌های شرکای فروش"
        subtitle="ثبت وجه دریافتی از اسنپ‌پی، دیجی‌پی و سایر شرکا — سند «بدهکار بانک / بستانکار دریافتنی از شرکا» و بسته‌شدن سفارش‌های تسویه‌شده"
        actions={
          can("partner.settlement.manage") && (
            <ActionButton onClick={() => setModal(true)}>
              <Plus className="w-4 h-4" /> ثبت تسویه
            </ActionButton>
          )
        }
      />
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>شریک</th>
                  <th>مبلغ (تومان)</th>
                  <th>روش</th>
                  <th>پیگیری</th>
                  <th>سفارش‌ها</th>
                  <th>تاریخ واریز</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((s) => (
                  <tr key={s.id}>
                    <Num bold>{s.settlementNumber}</Num>
                    <td>{s.partnerName}</td>
                    <Num bold>{toman(s.amountRial)}</Num>
                    <td>{SETTLEMENT_METHOD_FA[s.method]}</td>
                    <td>{s.referenceNumber ?? "—"}</td>
                    <td>{s.orderCount.toLocaleString("fa-IR")}</td>
                    <td>{faDate(s.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
      {modal && (
        <Modal title="ثبت تسویه‌ی شریک" onClose={() => setModal(false)} wide>
          <SettlementForm
            onDone={() => {
              setModal(false);
              void mutate();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
