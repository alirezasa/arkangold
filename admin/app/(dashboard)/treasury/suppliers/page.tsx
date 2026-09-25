// admin/app/(dashboard)/treasury/suppliers/page.tsx — تأمین‌کنندگان طلا و صورتحساب آن‌ها
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Landmark, Pencil, Plus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Field,
  Modal,
  Num,
  PageHeader,
  Pagination,
  SETTLEMENT_METHOD_FA,
  SUPPLIER_KIND_FA,
  Spinner,
  Table,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  signedToman,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Supplier {
  id: string;
  code: string;
  name: string;
  kind: string;
  nationalId: string | null;
  economicCode: string | null;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  iban: string | null;
  isActive: boolean;
  notes: string | null;
  balanceRial: string;
  boughtGrams: string;
  boughtRial: string;
  soldGrams: string;
  orderCount: number;
}
interface Statement {
  supplier: Supplier;
  data: { id: string; type: string; debitRial: string; creditRial: string; balanceAfterRial: string; description: string; referenceNumber: string | null; createdAt: string }[];
  page: number;
  totalPages: number;
}

function SupplierForm({ s, onDone }: { s?: Supplier; onDone: () => void }) {
  const [f, setF] = useState({
    name: s?.name ?? "",
    kind: s?.kind ?? "MELTED_GOLD_DEALER",
    nationalId: s?.nationalId ?? "",
    economicCode: s?.economicCode ?? "",
    contactPerson: s?.contactPerson ?? "",
    phone: s?.phone ?? "",
    address: s?.address ?? "",
    iban: s?.iban ?? "",
    notes: s?.notes ?? "",
    isActive: s?.isActive ?? true,
  });
  const act = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? undefined : v]));
    const ok = await act.run(() => (s ? api.patch(`/api/admin/treasury/suppliers/${s.id}`, body) : api.post("/api/admin/treasury/suppliers", body)));
    if (ok) onDone();
  };
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="نام">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
        </Field>
        <Field label="نوع">
          <select value={f.kind} onChange={(e) => set("kind", e.target.value)} className={inputCls}>
            {Object.entries(SUPPLIER_KIND_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="شناسه/کد ملی">
          <input value={f.nationalId} onChange={(e) => set("nationalId", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="کد اقتصادی">
          <input value={f.economicCode} onChange={(e) => set("economicCode", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="نماینده / رابط">
          <input value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={inputCls} />
        </Field>
        <Field label="تلفن">
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="شماره شبا">
          <input value={f.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} className={inputCls} dir="ltr" placeholder="IR..." />
        </Field>
      </div>
      <Field label="نشانی">
        <input value={f.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
      </Field>
      <Field label="توضیحات">
        <input value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
      </Field>
      {s && (
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
          <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> فعال
        </label>
      )}
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!f.name}>
        ذخیره
      </ActionButton>
    </div>
  );
}

function StatementView({ s }: { s: Supplier }) {
  const can = usePerm();
  const [page, setPage] = useState(1);
  const { data, mutate } = useSWR<Statement>(`/api/admin/treasury/suppliers/${s.id}/statement?page=${page}`, fetcher);
  const [dir, setDir] = useState("PAY");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [ref, setRef] = useState("");
  const act = useAction();
  const pay = async () => {
    const ok = await act.run(() =>
      api.post("/api/admin/treasury/payments", {
        supplierId: s.id,
        direction: dir,
        amountRial: String(tomanToRial(amount)),
        method,
        referenceNumber: ref || undefined,
      }),
    );
    if (ok) {
      setAmount("");
      void mutate();
    }
  };
  if (!data) return <Spinner />;
  const bal = Number(data.supplier.balanceRial);
  return (
    <div className="space-y-3">
      <Alert
        kind={bal < 0 ? "warn" : "info"}
        text={bal < 0 ? `بدهی ما به ${s.name}: ${toman(-bal)} تومان` : bal > 0 ? `طلب ما از ${s.name}: ${toman(bal)} تومان` : "حساب تسویه است"}
      />
      {can("treasury.payment.manage") && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <select value={dir} onChange={(e) => setDir(e.target.value)} className={inputCls}>
            <option value="PAY">پرداخت به او</option>
            <option value="RECEIVE">دریافت از او</option>
          </select>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مبلغ (تومان)" className={inputCls} dir="ltr" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {Object.entries(SETTLEMENT_METHOD_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="پیگیری" className={inputCls} />
          <ActionButton onClick={pay} busy={act.busy} disabled={!Number(amount)}>
            ثبت
          </ActionButton>
        </div>
      )}
      {act.error && <Alert kind="error" text={act.error} />}
      <Table>
        <thead>
          <tr>
            <th>تاریخ</th>
            <th>شرح</th>
            <th>بدهکار</th>
            <th>بستانکار</th>
            <th>مانده (تومان)</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{faDateTime(r.createdAt)}</td>
              <td className="max-w-md">{r.description}</td>
              <Num>{Number(r.debitRial) ? toman(r.debitRial) : "—"}</Num>
              <Num>{Number(r.creditRial) ? toman(r.creditRial) : "—"}</Num>
              <Num bold>{signedToman(r.balanceAfterRial)}</Num>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  );
}

export default function SuppliersPage() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<{ data: Supplier[] }>("/api/admin/treasury/suppliers?limit=200", fetcher);
  const [form, setForm] = useState<{ s?: Supplier } | null>(null);
  const [stmt, setStmt] = useState<Supplier | null>(null);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={Landmark}
        title="تأمین‌کنندگان و طرف‌های معامله‌ی طلا"
        subtitle="بنکداران طلای آب‌شده، ضرابخانه‌ها و خریداران طلای خزانه — با صورتحساب بدهکار/بستانکار، پرداخت‌ها و حجم معاملات"
        actions={
          can("treasury.order.manage") && (
            <ActionButton onClick={() => setForm({})}>
              <Plus className="w-4 h-4" /> تأمین‌کننده جدید
            </ActionButton>
          )
        }
      />
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>کد</th>
                <th>نام</th>
                <th>نوع</th>
                <th>تماس</th>
                <th>خرید (گرم)</th>
                <th>خرید (تومان)</th>
                <th>فروش (گرم)</th>
                <th>مانده حساب</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id} className={s.isActive ? "" : "opacity-50"}>
                  <Num bold>{s.code}</Num>
                  <td>
                    <button type="button" onClick={() => setStmt(s)} className="font-bold hover:underline">
                      {s.name}
                    </button>
                  </td>
                  <td>{SUPPLIER_KIND_FA[s.kind]}</td>
                  <td>
                    {s.contactPerson} {s.phone}
                  </td>
                  <Num>{grams(s.boughtGrams)}</Num>
                  <Num>{toman(s.boughtRial)}</Num>
                  <Num>{grams(s.soldGrams)}</Num>
                  <Num bold>
                    <span className={Number(s.balanceRial) < 0 ? "text-red-600" : ""}>{signedToman(s.balanceRial)}</span>
                  </Num>
                  <td>
                    {can("treasury.order.manage") && (
                      <button type="button" onClick={() => setForm({ s })} className="p-1.5 text-gray-400 hover:text-gray-700" aria-label="ویرایش">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-[11px] text-gray-400 mt-2">مانده‌ی منفی (داخل پرانتز) یعنی بدهی ما به تأمین‌کننده.</p>
      </div>
      {form && (
        <Modal title={form.s ? `ویرایش ${form.s.name}` : "تأمین‌کننده جدید"} onClose={() => setForm(null)} wide>
          <SupplierForm
            s={form.s}
            onDone={() => {
              setForm(null);
              void mutate();
            }}
          />
        </Modal>
      )}
      {stmt && (
        <Modal title={`صورتحساب ${stmt.code} — ${stmt.name}`} onClose={() => { setStmt(null); void mutate(); }} wide>
          <StatementView s={stmt} />
        </Modal>
      )}
    </div>
  );
}
