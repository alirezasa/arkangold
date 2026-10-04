// admin/app/(dashboard)/agents/contracts/[id]/page.tsx
//
// جزئیات قرارداد نماینده: ویرایش پیش‌نویس، صدور برای امضا، ابطال، گواهی امضا و رویدادها.
"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight, Send, XCircle } from "lucide-react";
import JalaliDateInput from "@/app/components/JalaliDateInput";
import {
  CONTRACT_EVENT_FA,
  CONTRACT_STATUS,
  ContractDocument,
  PrintButton,
  type ContractDetail,
} from "@/app/components/agents/ContractViews";
import {
  ActionButton,
  Alert,
  Badge,
  Field,
  Spinner,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

const ACTOR_FA: Record<string, string> = { ADMIN: "پنل", AGENT: "نماینده", SYSTEM: "سیستم" };

export default function AdminContractPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, mutate } = useSWR<ContractDetail>(`/api/admin/agent-contracts/${id}`, fetcher);
  const can = usePerm();
  const act = useAction();
  const [editing, setEditing] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  if (!c) return <Spinner />;
  const manage = can("agent.contract.manage");

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link href={`/agents/${c.agent.id}`} className="p-2 rounded-xl border border-gray-200 bg-white">
            <ChevronRight className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-black text-[15px]">
              قرارداد <span dir="ltr">{c.contractNumber}</span>
            </h1>
            <p className="text-[12px] text-gray-500">
              {c.agent.name} ({c.agent.code}) — {c.agent.managerName} — <span dir="ltr">{c.agent.phone}</span>
            </p>
          </div>
          <Badge map={CONTRACT_STATUS} value={c.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && c.status === "DRAFT" && (
            <>
              <ActionButton variant="secondary" onClick={() => setEditing((v) => !v)}>
                {editing ? "بستن ویرایش" : "ویرایش پیش‌نویس"}
              </ActionButton>
              <ActionButton
                busy={act.busy}
                onClick={() =>
                  void act
                    .run(() => api.post(`/api/admin/agent-contracts/${c.id}/issue`), "قرارداد صادر شود؟ پس از صدور متن قابل تغییر نیست و پیامک امضا برای نماینده ارسال می‌شود.")
                    .then(() => mutate())
                }
              >
                <Send className="w-4 h-4" /> صدور و ارسال برای امضا
              </ActionButton>
            </>
          )}
          {manage && (c.status === "DRAFT" || c.status === "ISSUED" || c.status === "SIGNED") && (
            <ActionButton variant="danger" onClick={() => setShowCancel(true)}>
              <XCircle className="w-4 h-4" /> ابطال
            </ActionButton>
          )}
          <PrintButton />
        </div>
      </div>

      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      {c.status === "CANCELLED" && <Alert kind="error" text={`ابطال‌شده در ${faDateTime(c.cancelledAt)}: ${c.cancelReason ?? ""}`} />}
      {c.status === "ISSUED" && (
        <Alert
          kind="info"
          text={`در انتظار امضای نماینده${c.signDeadline ? ` تا ${faDateTime(c.signDeadline)}` : ""}${c.firstViewedAt ? ` — مشاهده‌شده در ${faDateTime(c.firstViewedAt)}` : " — هنوز مشاهده نشده"}`}
        />
      )}

      {showCancel && (
        <div className="rounded-2xl p-4 space-y-2 print:hidden" style={cardStyle}>
          <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="دلیل ابطال" className={inputCls} />
          <div className="flex gap-2">
            <ActionButton variant="secondary" onClick={() => setShowCancel(false)}>
              انصراف
            </ActionButton>
            <ActionButton
              variant="danger"
              busy={act.busy}
              disabled={cancelReason.trim().length < 5}
              onClick={() =>
                void act.run(() => api.post(`/api/admin/agent-contracts/${c.id}/cancel`, { reason: cancelReason })).then((ok) => {
                  if (ok) setShowCancel(false);
                  return mutate();
                })
              }
            >
              ثبت ابطال
            </ActionButton>
          </div>
        </div>
      )}

      {editing && c.status === "DRAFT" && <DraftEditor c={c} onSaved={() => void mutate()} />}

      <ContractDocument c={c} />

      <div className="rounded-2xl p-4 print:hidden" style={cardStyle}>
        <p className="font-black text-[13px] mb-2">رویدادهای قرارداد</p>
        <ol className="space-y-1.5 text-[12px]">
          {c.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3">
              <span className="font-bold">{CONTRACT_EVENT_FA[e.type] ?? e.type}</span>
              <span className="text-gray-500">{ACTOR_FA[e.actorType] ?? e.actorType}</span>
              <span className="text-gray-400">{faDateTime(e.createdAt)}</span>
              {e.ip && (
                <span className="text-gray-400" dir="ltr">
                  {e.ip}
                </span>
              )}
              {e.note && <span className="text-gray-500">{e.note}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function DraftEditor({ c, onSaved }: { c: ContractDetail; onSaved: () => void }) {
  const [title, setTitle] = useState(c.title);
  const [body, setBody] = useState(c.rawBody ?? c.body);
  const [startsAt, setStartsAt] = useState(c.startsAt?.slice(0, 10) ?? "");
  const [endsAt, setEndsAt] = useState(c.endsAt?.slice(0, 10) ?? "");
  const [signDeadline, setSignDeadline] = useState(c.signDeadline?.slice(0, 10) ?? "");
  const act = useAction();
  const iso = (d: string, end = false) => (d ? new Date(`${d}T${end ? "23:59:00" : "00:00:00"}`).toISOString() : null);
  return (
    <div className="rounded-2xl p-4 space-y-3 print:hidden" style={cardStyle}>
      <Field label="عنوان">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="تاریخ شروع">
          <JalaliDateInput value={startsAt} onChange={setStartsAt} />
        </Field>
        <Field label="تاریخ پایان">
          <JalaliDateInput value={endsAt} onChange={setEndsAt} />
        </Field>
        <Field label="مهلت امضا">
          <JalaliDateInput value={signDeadline} onChange={setSignDeadline} />
        </Field>
      </div>
      <Field label="متن (متغیرها هنگام صدور جایگذاری می‌شوند)">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className={`${inputCls} leading-7 text-[13px]`} />
      </Field>
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      <ActionButton
        busy={act.busy}
        onClick={() =>
          void act
            .run(() =>
              api.patch(`/api/admin/agent-contracts/${c.id}`, {
                title,
                body,
                startsAt: iso(startsAt),
                endsAt: iso(endsAt),
                signDeadline: iso(signDeadline, true),
              }),
            )
            .then(onSaved)
        }
      >
        ذخیره پیش‌نویس
      </ActionButton>
    </div>
  );
}
