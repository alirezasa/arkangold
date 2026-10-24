// admin/app/components/zarpayesh/DeliveriesTab.tsx
//
// ارسال/تحویل دارایی در سامانه ناظر: MakeDeliveries، SetDeliveries (۱ Approve، ۲ Ship، ۳ Delivery، ۴ Cancel)،
// GetDeliveries و MakeDeliverFollowup
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Plus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  Empty,
  Field,
  Modal,
  Pagination,
  Spinner,
  Table,
  api,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import { API, DELIVERY_REMOTE, DELIVERY_STATE, Json, Section, SingleUserPicker, mgToGrams } from "./shared";

interface Delivery {
  id: string;
  srcTrackingNumber: string;
  trackingCode: string | null;
  amountMg: string;
  description: string | null;
  reference: string | null;
  state: string;
  remoteStatus: number | null;
  requestedAt: string | null;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  fullName: string;
  phone: string;
}

export default function DeliveriesTab() {
  const can = usePerm();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<Delivery | null>(null);
  const { data, mutate } = useSWR<{ data: Delivery[]; totalPages: number }>(`${API}/deliveries?page=${page}&limit=20`, fetcher);
  return (
    <Section
      title="ارسال / تحویل دارایی"
      actions={
        can("zarpayesh.manage") && (
          <ActionButton onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" /> ثبت درخواست ارسال
          </ActionButton>
        )
      }
    >
      <Alert
        kind="info"
        text="وقتی طلای آب‌شده‌ی کاربر به‌صورت فیزیکی تحویل می‌شود (مثلاً تبدیل به شمش)، درخواست ارسال را ثبت و مراحل را به‌روز کنید. توجه: با وضعیت ۱ (Approve) مقدار دارایی از موجودی کاربر در سامانه ناظر کسر و به خزانه‌ی مبدأ برگردانده می‌شود و کد تأیید کاربر الزامی است."
      />
      {!data ? (
        <Spinner />
      ) : data.data.length === 0 ? (
        <Empty text="درخواست ارسالی ثبت نشده است" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>کد پیگیری پلتفرم</th>
              <th>کد پیگیری مرسوله</th>
              <th>کاربر</th>
              <th>مقدار (گرم)</th>
              <th>مرجع</th>
              <th>ثبت</th>
              <th>آخرین مرحله</th>
              <th>زمان</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setActive(d)}>
                <td dir="ltr" className="font-mono">
                  {d.srcTrackingNumber}
                </td>
                <td dir="ltr" className="font-mono">
                  {d.trackingCode ?? "—"}
                </td>
                <td>
                  {d.fullName || "—"} <span dir="ltr" className="text-gray-400">{d.phone}</span>
                </td>
                <td>{mgToGrams(d.amountMg)}</td>
                <td>{d.reference ?? "—"}</td>
                <td>
                  <Badge map={DELIVERY_STATE} value={d.state} />
                </td>
                <td>{d.remoteStatus ? <Badge map={DELIVERY_REMOTE} value={String(d.remoteStatus)} /> : "ثبت‌شده"}</td>
                <td>{faDateTime(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onDone={() => mutate()} />}
      {active && <DeliveryModal d={active} onClose={() => setActive(null)} onChange={() => mutate()} />}
    </Section>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [user, setUser] = useState<{ id: string; phone: string } | null>(null);
  const [grams, setGrams] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const a = useAction();
  const submit = async () => {
    const ok = await a.run(() =>
      api.post(`${API}/deliveries`, {
        userId: user?.id,
        amountGrams: grams,
        description: description || undefined,
        reference: reference || undefined,
      }),
    );
    if (ok) onDone();
  };
  return (
    <Modal title="ثبت درخواست ارسال دارایی (MakeDeliveries)" onClose={onClose}>
      <Field label="کاربر">
        <SingleUserPicker value={user} onChange={setUser} />
      </Field>
      <Field label="مقدار (گرم — حداکثر ۳ رقم اعشار)">
        <input dir="ltr" className={inputCls} value={grams} onChange={(e) => setGrams(e.target.value)} />
      </Field>
      <Field label="توضیح مرسوله">
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="مرجع داخلی (اختیاری)" hint="مثلاً شماره‌ی سفارش فروشگاه یا درخواست تحویل فیزیکی">
        <input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      {a.error && <Alert kind="error" text={a.error} />}
      {a.success && <Alert kind="success" text={a.success} />}
      <ActionButton busy={a.busy} disabled={!user || !grams} onClick={submit}>
        ثبت در سامانه ناظر
      </ActionButton>
    </Modal>
  );
}

function DeliveryModal({ d, onClose, onChange }: { d: Delivery; onClose: () => void; onChange: () => void }) {
  const can = usePerm();
  const [status, setStatus] = useState("2");
  const [code, setCode] = useState("");
  const [out, setOut] = useState<unknown>(undefined);
  const a = useAction();
  const call = async (fn: () => Promise<{ data: unknown }>, confirm?: string) => {
    const ok = await a.run(async () => {
      const res = await fn();
      setOut((res.data as { result?: unknown }).result ?? res.data);
      return res;
    }, confirm);
    if (ok) onChange();
  };
  return (
    <Modal title={`مرسوله ${d.trackingCode ?? d.srcTrackingNumber}`} onClose={onClose} wide>
      <div className="grid gap-1 sm:grid-cols-2 text-[12px]">
        <p>درخواست: {faDateTime(d.requestedAt)}</p>
        <p>Approve (تحویل کاربر): {faDateTime(d.approvedAt)}</p>
        <p>Ship: {faDateTime(d.shippedAt)}</p>
        <p>Delivery: {faDateTime(d.deliveredAt)}</p>
        <p>Cancel: {faDateTime(d.cancelledAt)}</p>
        <p>{d.description}</p>
      </div>
      {d.errorMessage && <Alert kind="warn" text={`${d.errorCode ? `[${d.errorCode}] ` : ""}${d.errorMessage}`} />}
      {can("zarpayesh.manage") && (
        <div className="space-y-2">
          <ActionButton variant="secondary" busy={a.busy} onClick={() => call(() => api.post(`${API}/deliveries/${d.id}/refresh`))}>
            {d.trackingCode ? "استعلام (GetDeliveries)" : "پیگیری ثبت (MakeDeliverFollowup)"}
          </ActionButton>
          {d.trackingCode && (
            <div className="flex flex-wrap gap-2 items-end">
              <Field label="مرحله‌ی جدید (SetDeliveries)">
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="2">۲ — Ship (آماده ارسال)</option>
                  <option value="3">۳ — Delivery (ارسال شد)</option>
                  <option value="1">۱ — Approve (تحویل کاربر)</option>
                  <option value="4">۴ — Cancel (لغو ارسال)</option>
                </select>
              </Field>
              {status === "1" && (
                <Field label="کد تأیید کاربر (approveCode)">
                  <input dir="ltr" className={inputCls} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))} />
                </Field>
              )}
              <ActionButton
                busy={a.busy}
                disabled={status === "1" && !code}
                onClick={() =>
                  call(
                    () => api.post(`${API}/deliveries/${d.id}/status`, { status: Number(status), approveCode: status === "1" ? code : undefined }),
                    status === "1"
                      ? "با Approve، دارایی از موجودی کاربر در سامانه ناظر کسر می‌شود. ادامه می‌دهید؟"
                      : undefined,
                  )
                }
              >
                ثبت مرحله
              </ActionButton>
            </div>
          )}
        </div>
      )}
      {a.error && <Alert kind="error" text={a.error} />}
      {a.success && <Alert kind="success" text={a.success} />}
      {out !== undefined && <Json value={out} />}
    </Modal>
  );
}
