// admin/app/components/zarpayesh/TradesTab.tsx
//
// معاملات گزارش‌شده به سامانه ناظر (Reserve / Approve / Cancel / TxnFollowup) و رزرو آزمایشی
"use client";
import { useState } from "react";
import useSWR from "swr";
import { FlaskConical, Search } from "lucide-react";
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
  toman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import {
  API,
  Json,
  ORDER_TYPE_FA,
  Section,
  SingleUserPicker,
  TRADE_STATUS,
  TXN_STATUS_FA,
  mgToGrams,
} from "./shared";

interface Trade {
  id: string;
  srcTrackingNumber: string;
  source: string;
  userId: string;
  orderId: string | null;
  orderType: number;
  amountMg: string;
  unitPrice: string;
  totalPrice: string;
  payType: number | null;
  rrn: string | null;
  reserveCode: string | null;
  reserveExpireAt: string | null;
  referenceNumber: string | null;
  remoteStatus: number | null;
  status: string;
  needsReview: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  reviewNote: string | null;
  createdAt: string;
  approvedAt: string | null;
  fullName?: string;
  phone?: string;
}

interface LogRow {
  id: string;
  method: string;
  httpMethod: string;
  path: string;
  requestBody: unknown;
  responseBody: unknown;
  httpStatus: number | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
  trigger: string;
  createdAt: string;
}

const STATUS_TABS = [
  { key: "", label: "همه" },
  { key: "REVIEW", label: "نیازمند بررسی" },
  { key: "APPROVED", label: "تأیید شده" },
  { key: "RESERVED", label: "رزرو شده" },
  { key: "UNKNOWN", label: "نامشخص" },
  { key: "FAILED", label: "ناموفق" },
  { key: "CANCELLED", label: "لغو شده" },
];

export default function TradesTab() {
  const can = usePerm();
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (tab === "REVIEW") params.set("needsReview", "true");
  else if (tab) params.set("status", tab);
  if (q.trim()) params.set("q", q.trim());
  const { data, mutate } = useSWR<{ data: Trade[]; totalPages: number }>(`${API}/trades?${params}`, fetcher);

  return (
    <Section
      title="معاملات گزارش‌شده"
      actions={
        can("zarpayesh.manage") && (
          <ActionButton variant="secondary" onClick={() => setTestOpen(true)}>
            <FlaskConical className="w-4 h-4" /> رزرو آزمایشی
          </ActionButton>
        )
      }
    >
      <div className="flex flex-wrap gap-2 items-center">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-bold border ${tab === t.key ? "text-white border-transparent" : "bg-white border-gray-200 text-gray-600"}`}
            style={tab === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {t.label}
          </button>
        ))}
        <div className="relative flex-1 min-w-52">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className={`${inputCls} pr-9`}
            placeholder="کد پیگیری / کد رزرو / شناسه سفارش / موبایل"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {!data ? (
        <Spinner />
      ) : data.data.length === 0 ? (
        <Empty text="معامله‌ای ثبت نشده است" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>کد پیگیری پلتفرم</th>
              <th>کاربر</th>
              <th>نوع</th>
              <th>مقدار (گرم)</th>
              <th>مبلغ کل (تومان)</th>
              <th>وضعیت</th>
              <th>کد رزرو / مرجع</th>
              <th>زمان</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((t) => (
              <tr key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpenId(t.id)}>
                <td dir="ltr" className="font-mono">
                  {t.srcTrackingNumber}
                  {t.source === "ADMIN_TEST" && <span className="badge bg-violet-50 text-violet-700 mr-1">آزمایشی</span>}
                </td>
                <td>
                  {t.fullName || "—"} <span dir="ltr" className="text-gray-400">{t.phone}</span>
                </td>
                <td>{ORDER_TYPE_FA[t.orderType]}</td>
                <td>{mgToGrams(t.amountMg)}</td>
                <td>{toman(t.totalPrice)}</td>
                <td>
                  <Badge map={TRADE_STATUS} value={t.status} />
                  {t.needsReview && <span className="badge bg-red-50 text-red-600 mr-1">بررسی</span>}
                </td>
                <td dir="ltr" className="font-mono text-[11px]">
                  {t.reserveCode ?? "—"}
                  {t.referenceNumber ? ` / ${t.referenceNumber}` : ""}
                </td>
                <td>{faDateTime(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
      {openId && <TradeModal id={openId} onClose={() => setOpenId(null)} onChange={() => mutate()} />}
      {testOpen && <TestReserveModal onClose={() => setTestOpen(false)} onDone={() => mutate()} />}
    </Section>
  );
}

function TradeModal({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const can = usePerm();
  const { data, mutate } = useSWR<{ trade: Trade; logs: LogRow[] }>(`${API}/trades/${id}`, fetcher);
  const a = useAction();
  const [note, setNote] = useState("");
  const act = async (path: string, body: unknown, confirm?: string) => {
    const ok = await a.run(() => api.post(`${API}/trades/${id}/${path}`, body), confirm);
    if (ok) {
      mutate();
      onChange();
    }
  };
  const t = data?.trade;
  return (
    <Modal title="جزئیات معامله در سامانه ناظر" onClose={onClose} wide>
      {!t ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 text-[12px]">
            <Info k="وضعیت" v={<Badge map={TRADE_STATUS} value={t.status} />} />
            <Info k="وضعیت سامانه ناظر (Table 3)" v={t.remoteStatus ? TXN_STATUS_FA[t.remoteStatus] ?? t.remoteStatus : "—"} />
            <Info k="srcTrackingNumber" v={t.srcTrackingNumber} ltr />
            <Info k="reserveCode" v={t.reserveCode ?? "—"} ltr />
            <Info k="referenceNumber" v={t.referenceNumber ?? "—"} ltr />
            <Info k="rrn" v={t.rrn ?? "—"} ltr />
            <Info k="نوع سفارش" v={ORDER_TYPE_FA[t.orderType]} />
            <Info k="مقدار" v={`${Number(t.amountMg).toLocaleString("fa-IR")} میلی‌گرم`} />
            <Info k="قیمت واحد (ریال)" v={Number(t.unitPrice).toLocaleString("fa-IR")} />
            <Info k="قیمت کل (ریال)" v={Number(t.totalPrice).toLocaleString("fa-IR")} />
            <Info k="سفارش داخلی" v={t.orderId ?? "—"} ltr />
            <Info k="انقضای رزرو" v={faDateTime(t.reserveExpireAt)} />
          </div>
          {t.errorMessage && <Alert kind="warn" text={`${t.errorCode ? `[${t.errorCode}] ` : ""}${t.errorMessage}`} />}
          {t.needsReview && <Alert kind="error" text={t.reviewNote ?? "نیازمند بررسی"} />}
          {!t.needsReview && t.reviewNote && <Alert kind="info" text={t.reviewNote} />}
          {can("zarpayesh.manage") && (
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" busy={a.busy} onClick={() => act("followup", {})}>
                استعلام وضعیت (TxnFollowup)
              </ActionButton>
              {(t.status === "RESERVED" || t.status === "UNKNOWN") && (
                <ActionButton variant="danger" busy={a.busy} onClick={() => act("cancel", {}, "رزرو در سامانه ناظر لغو شود؟")}>
                  لغو رزرو (Cancel)
                </ActionButton>
              )}
              {t.status === "RESERVED" && (
                <ActionButton
                  busy={a.busy}
                  onClick={() =>
                    act(
                      "approve",
                      {},
                      t.source === "ADMIN_TEST"
                        ? "تأیید رزرو آزمایشی یک معامله‌ی واقعی در سامانه ناظر ثبت می‌کند و موجودی کاربر/خزانه در سامانه ناظر را تغییر می‌دهد. ادامه می‌دهید؟"
                        : "معامله در سامانه ناظر تأیید (قطعی) شود؟",
                    )
                  }
                >
                  تأیید (Approve)
                </ActionButton>
              )}
            </div>
          )}
          {can("zarpayesh.manage") && t.needsReview && (
            <div className="flex gap-2">
              <input className={inputCls} placeholder="شرح اقدام اصلاحی انجام‌شده" value={note} onChange={(e) => setNote(e.target.value)} />
              <ActionButton busy={a.busy} disabled={note.trim().length < 3} onClick={() => act("review", { note })}>
                ثبت بررسی
              </ActionButton>
            </div>
          )}
          {a.error && <Alert kind="error" text={a.error} />}
          {a.success && <Alert kind="success" text={a.success} />}
          <h4 className="text-[13px] font-black pt-2">فراخوانی‌های این معامله</h4>
          {data.logs.length === 0 ? (
            <Empty text="فراخوانی‌ای ثبت نشده" />
          ) : (
            data.logs.map((l) => <LogItem key={l.id} log={l} />)
          )}
        </div>
      )}
    </Modal>
  );
}

function Info({ k, v, ltr }: { k: string; v: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-2 border-b border-gray-50 py-1">
      <span className="text-gray-500">{k}</span>
      <span className={`font-bold ${ltr ? "font-mono" : ""}`} dir={ltr ? "ltr" : undefined}>
        {v}
      </span>
    </div>
  );
}

export function LogItem({ log }: { log: LogRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-100">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex flex-wrap items-center gap-2 px-3 py-2 text-[12px] text-right">
        <span className={`badge ${log.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{log.success ? "موفق" : "ناموفق"}</span>
        <span className="font-black">{log.method}</span>
        <span dir="ltr" className="text-gray-400 font-mono">
          {log.httpMethod} {log.path}
        </span>
        <span className="text-gray-400">HTTP {log.httpStatus ?? "—"}</span>
        {log.errorCode && <span className="text-red-600 font-bold">[{log.errorCode}]</span>}
        <span className="text-gray-400 mr-auto">
          {log.durationMs.toLocaleString("fa-IR")} ms · {log.trigger} · {faDateTime(log.createdAt)}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {log.errorMessage && <Alert kind="error" text={log.errorMessage} />}
          <Field label="درخواست (پاک‌سازی‌شده)">
            <Json value={log.requestBody} />
          </Field>
          <Field label="پاسخ">
            <Json value={log.responseBody} />
          </Field>
        </div>
      )}
    </div>
  );
}

function TestReserveModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [user, setUser] = useState<{ id: string; phone: string } | null>(null);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [grams, setGrams] = useState("0.01");
  const [price, setPrice] = useState("");
  const a = useAction();
  const submit = async () => {
    const ok = await a.run(() =>
      api.post(`${API}/trades/test-reserve`, { userId: user?.id, side, amountGrams: grams, pricePerGramRial: price }),
    );
    if (ok) onDone();
  };
  return (
    <Modal title="رزرو آزمایشی (Reserve)" onClose={onClose}>
      <Alert
        kind="info"
        text="برای آزمون دقیق پیش از روشن کردن: یک رزرو واقعی در سامانه ناظر ثبت می‌شود (بدون اثر روی کیف پول آرکان گلد). سپس از فهرست معاملات آن را «لغو» کنید. کاربر در صورت نیاز ابتدا در سامانه ناظر ثبت می‌شود."
      />
      <Field label="کاربر (احراز هویت‌شده)">
        <SingleUserPicker value={user} onChange={setUser} />
      </Field>
      <Field label="نوع سفارش">
        <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}>
          <option value="BUY">۱ — خرید کاربر از پلتفرم</option>
          <option value="SELL">۲ — فروش کاربر به پلتفرم</option>
        </select>
      </Field>
      <Field label="مقدار (گرم — حداکثر ۳ رقم اعشار)">
        <input dir="ltr" className={inputCls} value={grams} onChange={(e) => setGrams(e.target.value)} />
      </Field>
      <Field label="قیمت هر گرم (ریال)">
        <input dir="ltr" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} />
      </Field>
      {a.error && <Alert kind="error" text={a.error} />}
      {a.success && <Alert kind="success" text={a.success} />}
      <ActionButton busy={a.busy} disabled={!user || !grams || !price} onClick={submit}>
        ثبت رزرو آزمایشی
      </ActionButton>
    </Modal>
  );
}
