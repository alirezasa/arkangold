// admin/app/components/agents/SettlementsTable.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Check, X, Loader2 } from "lucide-react";
import {
  Alert,
  Badge,
  Empty,
  Field,
  Modal,
  Pagination,
  SETTLEMENT_METHOD_FA,
  SETTLEMENT_STATUS,
  Spinner,
  faDate,
  faDateTime,
  fetcher,
  getErrorMessage,
  inputCls,
  toman,
} from "./ui";

interface SettlementRow {
  id: string;
  settlementNumber: string;
  agent: { id: string; code: string; name: string };
  amountRial: string;
  method: string;
  referenceNumber: string | null;
  paidAt: string | null;
  note: string | null;
  status: string;
  rejectionReason: string | null;
  journalEntryId: string | null;
  submittedByAdmin: { fullName: string } | null;
  reviewedByAdmin: { fullName: string } | null;
  reviewedAt: string | null;
  createdAt: string;
}

export default function SettlementsTable({
  listEndpoint,
  agentId,
  showAgent = false,
  canReview = false,
  defaultStatus = "",
  refreshKey = 0,
  onChanged,
}: {
  listEndpoint: string;
  agentId?: string;
  showAgent?: boolean;
  canReview?: boolean;
  defaultStatus?: string;
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(defaultStatus);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SettlementRow | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) qs.set("status", status);
  if (agentId) qs.set("agentId", agentId);
  const { data, isLoading, mutate } = useSWR<{ data: SettlementRow[]; totalPages: number; totalAmountRial: string }>(
    [`${listEndpoint}?${qs.toString()}`, refreshKey],
    ([url]: [string, number]) => fetcher(url),
  );

  const approve = async (s: SettlementRow) => {
    if (!confirm(`تأیید دریافت ${toman(s.amountRial)} تومان از «${s.agent.name}»؟ سند حسابداری ثبت و از بدهی نماینده کسر می‌شود.`))
      return;
    setBusy(s.id);
    setMessage(null);
    try {
      await axios.post(`/api/admin/agents/settlements/${s.id}/approve`);
      await mutate();
      onChanged?.();
      setMessage({ kind: "success", text: `تسویه ${s.settlementNumber} تأیید شد` });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err, "تأیید تسویه ممکن نشد") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
        >
          <option value="">همه تسویه‌ها</option>
          <option value="PENDING">در انتظار تأیید</option>
          <option value="APPROVED">تأییدشده</option>
          <option value="REJECTED">ردشده</option>
        </select>
        {data && (
          <p className="text-[12px] text-gray-500">
            جمع مبالغ فهرست: <span className="font-black text-gray-800">{toman(data.totalAmountRial)} تومان</span>
          </p>
        )}
      </div>
      {message && <Alert kind={message.kind} text={message.text} />}

      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <Empty text="تسویه‌ای ثبت نشده است" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[820px]">
            <thead>
              <tr>
                <th>شماره / ثبت</th>
                {showAgent && <th>نماینده</th>}
                <th>مبلغ (تومان)</th>
                <th>روش / مرجع</th>
                <th>تاریخ پرداخت</th>
                <th>وضعیت</th>
                {canReview && <th></th>}
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <p className="font-bold" dir="ltr">
                      {s.settlementNumber}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {faDateTime(s.createdAt)} · {s.submittedByAdmin?.fullName ?? "—"}
                    </p>
                  </td>
                  {showAgent && (
                    <td className="text-[12px]">
                      {s.agent.name}
                      <p className="text-[10px] text-gray-400" dir="ltr">
                        {s.agent.code}
                      </p>
                    </td>
                  )}
                  <td className="font-black">{toman(s.amountRial)}</td>
                  <td className="text-[12px]">
                    {SETTLEMENT_METHOD_FA[s.method] ?? s.method}
                    {s.referenceNumber && (
                      <p className="text-[11px] text-gray-400" dir="ltr">
                        {s.referenceNumber}
                      </p>
                    )}
                    {s.note && <p className="text-[11px] text-gray-400">{s.note}</p>}
                  </td>
                  <td className="text-[12px]">{faDate(s.paidAt)}</td>
                  <td>
                    <Badge map={SETTLEMENT_STATUS} value={s.status} />
                    {s.reviewedByAdmin && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {s.reviewedByAdmin.fullName} · {faDate(s.reviewedAt)}
                      </p>
                    )}
                    {s.rejectionReason && <p className="text-[10px] text-red-500 mt-1">{s.rejectionReason}</p>}
                  </td>
                  {canReview && (
                    <td>
                      {s.status === "PENDING" && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => void approve(s)}
                            disabled={busy === s.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-green-50 text-green-700 disabled:opacity-50"
                          >
                            {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            تأیید
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejecting(s)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-red-50 text-red-600"
                          >
                            <X className="w-3.5 h-3.5" /> رد
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}

      {rejecting && (
        <RejectModal
          settlement={rejecting}
          onClose={() => setRejecting(null)}
          onDone={async () => {
            setRejecting(null);
            await mutate();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function RejectModal({
  settlement,
  onClose,
  onDone,
}: {
  settlement: SettlementRow;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (reason.trim().length < 5) return setError("دلیل رد را وارد کنید");
    setBusy(true);
    try {
      await axios.post(`/api/admin/agents/settlements/${settlement.id}/reject`, { reason: reason.trim() });
      await onDone();
    } catch (err) {
      setError(getErrorMessage(err, "رد تسویه ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`رد تسویه ${settlement.settlementNumber}`} onClose={onClose}>
      {error && <Alert kind="error" text={error} />}
      <Field label="دلیل رد (برای نماینده نمایش داده می‌شود)">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} />
      </Field>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white bg-red-600 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-4 h-4" />}
        رد تسویه
      </button>
    </Modal>
  );
}
