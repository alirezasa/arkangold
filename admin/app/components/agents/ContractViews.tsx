// admin/app/components/agents/ContractViews.tsx
//
// اجزای مشترک قرارداد الکترونیک نمایندگان (پنل مدیریت و پرتال نماینده).
"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FilePlus2, FileSignature, Printer, ShieldCheck } from "lucide-react";
import JalaliDateInput from "@/app/components/JalaliDateInput";
import {
  ActionButton,
  Alert,
  Badge,
  Empty,
  Field,
  Modal,
  Spinner,
  Table,
  api,
  faDate,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

export interface ContractListItem {
  id: string;
  contractNumber: string;
  title: string;
  status: "DRAFT" | "ISSUED" | "SIGNED" | "CANCELLED" | "EXPIRED";
  statusLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  signDeadline: string | null;
  issuedAt: string | null;
  signedAt: string | null;
  firstViewedAt?: string | null;
  agent?: { id: string; code: string; name: string; managerName: string; phone: string };
}

export interface ContractDetail {
  id: string;
  contractNumber: string;
  title: string;
  body: string;
  rawBody?: string;
  bodyHash: string | null;
  status: ContractListItem["status"];
  statusLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  signDeadline: string | null;
  issuedAt: string | null;
  firstViewedAt: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  agent: { id: string; code: string; name: string; managerName: string; phone: string; nationalCode: string | null };
  otpPending: boolean;
  signature: {
    signedAt: string;
    signedAtJalali: string;
    signerName: string | null;
    signerNationalCode: string | null;
    signerPhone: string | null;
    signerIp: string | null;
    signerUserAgent?: string | null;
    signatureHash: string | null;
    method: string;
  } | null;
  events: { id: string; type: string; actorType: string; ip: string | null; note: string | null; createdAt: string }[];
}

export const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "پیش‌نویس", cls: "bg-gray-100 text-gray-600" },
  ISSUED: { label: "در انتظار امضا", cls: "bg-amber-50 text-amber-700" },
  SIGNED: { label: "امضاشده", cls: "bg-green-50 text-green-700" },
  CANCELLED: { label: "ابطال‌شده", cls: "bg-red-50 text-red-600" },
  EXPIRED: { label: "منقضی", cls: "bg-gray-100 text-gray-500" },
};

export const CONTRACT_EVENT_FA: Record<string, string> = {
  CREATED: "ایجاد پیش‌نویس",
  UPDATED: "ویرایش پیش‌نویس",
  ISSUED: "صدور و ارسال برای امضا",
  VIEWED: "مشاهده توسط نماینده",
  OTP_SENT: "ارسال کد امضا",
  OTP_FAILED: "ورود کد نادرست",
  SIGNED: "امضای الکترونیک",
  CANCELLED: "ابطال",
  EXPIRED: "پایان مهلت امضا",
};

/** متن قرارداد + گواهی امضا — قابل چاپ */
export function ContractDocument({ c }: { c: ContractDetail }) {
  return (
    <div className="contract-print rounded-2xl bg-white border border-gray-200 p-6 md:p-10 space-y-6 text-[13px] leading-8 text-gray-800">
      <div className="text-center space-y-1">
        <h1 className="text-[18px] font-black">{c.title}</h1>
        <p className="text-[12px] text-gray-500">
          شماره <span dir="ltr">{c.contractNumber}</span>
          {c.issuedAt && ` — تاریخ صدور ${faDate(c.issuedAt)}`}
        </p>
      </div>
      <div className="whitespace-pre-line text-justify">{c.body}</div>

      {c.signature ? (
        <div className="rounded-xl border-2 border-emerald-600 p-4 space-y-1 text-[12px] leading-6 break-inside-avoid">
          <p className="font-black text-emerald-700 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> گواهی امضای الکترونیک
          </p>
          <p>
            امضاکننده: <b>{c.signature.signerName}</b>
            {c.signature.signerNationalCode && ` — کد ملی ${c.signature.signerNationalCode}`}
          </p>
          <p>
            زمان امضا: <b>{c.signature.signedAtJalali}</b>
          </p>
          <p>
            روش احراز: {c.signature.method} (<span dir="ltr">{c.signature.signerPhone}</span>)
          </p>
          {c.signature.signerIp && (
            <p>
              نشانی IP: <span dir="ltr">{c.signature.signerIp}</span>
            </p>
          )}
          {c.bodyHash && (
            <p className="break-all">
              اثر انگشت متن (SHA-256): <span dir="ltr" className="font-mono text-[10px]">{c.bodyHash}</span>
            </p>
          )}
          {c.signature.signatureHash && (
            <p className="break-all">
              شناسه امضا: <span dir="ltr" className="font-mono text-[10px]">{c.signature.signatureHash}</span>
            </p>
          )}
        </div>
      ) : (
        c.bodyHash && (
          <p className="text-[10px] text-gray-400 break-all">
            اثر انگشت متن (SHA-256): <span dir="ltr" className="font-mono">{c.bodyHash}</span>
          </p>
        )
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700 print:hidden"
    >
      <Printer className="w-4 h-4" /> چاپ / PDF
    </button>
  );
}

/** قراردادهای یک نماینده (تب صفحه‌ی نماینده) */
export function AgentContractsPanel({ agentId }: { agentId: string }) {
  const { data, isLoading, mutate } = useSWR<{ items: ContractListItem[] }>(`/api/admin/agent-contracts?agentId=${agentId}`, fetcher);
  const [creating, setCreating] = useState(false);
  const can = usePerm();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-gray-500">قرارداد صادرشده در پرتال نماینده نمایش داده می‌شود و نماینده با کد پیامکی آن را امضا می‌کند.</p>
        {can("agent.contract.manage") && (
          <ActionButton onClick={() => setCreating(true)}>
            <FilePlus2 className="w-4 h-4" /> قرارداد جدید
          </ActionButton>
        )}
      </div>
      {isLoading || !data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty text="قراردادی برای این نماینده ثبت نشده است" />
      ) : (
        <ContractsTable items={data.items} />
      )}
      {creating && (
        <CreateContractModal
          agentId={agentId}
          onClose={() => {
            setCreating(false);
            void mutate();
          }}
        />
      )}
    </div>
  );
}

export function ContractsTable({ items, showAgent, basePath = "/agents/contracts" }: { items: ContractListItem[]; showAgent?: boolean; basePath?: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>شماره</th>
          {showAgent && <th>نماینده</th>}
          <th>عنوان</th>
          <th>مدت</th>
          <th>وضعیت</th>
          <th>امضا</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((c) => (
          <tr key={c.id}>
            <td dir="ltr" className="whitespace-nowrap">
              {c.contractNumber}
            </td>
            {showAgent && (
              <td>
                {c.agent?.name} <span className="text-[10px] text-gray-400">{c.agent?.code}</span>
              </td>
            )}
            <td>{c.title}</td>
            <td className="whitespace-nowrap text-[11px]">
              {c.startsAt ? faDate(c.startsAt) : "—"} تا {c.endsAt ? faDate(c.endsAt) : "—"}
            </td>
            <td>
              <Badge map={CONTRACT_STATUS} value={c.status} />
            </td>
            <td className="text-[11px] whitespace-nowrap">{c.signedAt ? faDateTime(c.signedAt) : c.signDeadline && c.status === "ISSUED" ? `مهلت ${faDate(c.signDeadline)}` : "—"}</td>
            <td>
              <Link href={`${basePath}/${c.id}`} className="text-emerald-700 font-bold text-[12px]">
                مشاهده
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function CreateContractModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { data: tpl } = useSWR<{ items: { id: string; title: string; isActive: boolean; version: number }[] }>("/api/admin/agent-contracts/templates", fetcher);
  const [templateId, setTemplateId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [signDeadline, setSignDeadline] = useState("");
  const act = useAction();
  const [created, setCreated] = useState<string | null>(null);

  const toIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);

  return (
    <Modal title="قرارداد جدید" onClose={onClose}>
      {created ? (
        <div className="space-y-3">
          <Alert kind="success" text="پیش‌نویس ایجاد شد. پس از بازبینی متن، آن را صادر کنید تا برای امضای نماینده ارسال شود." />
          <Link href={`/agents/contracts/${created}`} className="inline-flex items-center gap-2 font-bold text-emerald-700">
            <FileSignature className="w-4 h-4" /> بازبینی و صدور قرارداد
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="قالب قرارداد">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
              <option value="">انتخاب کنید</option>
              {(tpl?.items ?? [])
                .filter((t) => t.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} (نسخه {t.version.toLocaleString("fa-IR")})
                  </option>
                ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاریخ شروع">
              <JalaliDateInput value={startsAt} onChange={setStartsAt} />
            </Field>
            <Field label="تاریخ پایان">
              <JalaliDateInput value={endsAt} onChange={setEndsAt} min={startsAt || undefined} />
            </Field>
          </div>
          <Field label="مهلت امضا (اختیاری — پیش‌فرض ۳۰ روز پس از صدور)">
            <JalaliDateInput value={signDeadline} onChange={setSignDeadline} />
          </Field>
          {act.error && <Alert kind="error" text={act.error} />}
          <ActionButton
            busy={act.busy}
            disabled={!templateId}
            onClick={() =>
              void act.run(async () => {
                const res = await api.post("/api/admin/agent-contracts", {
                  agentId,
                  templateId,
                  startsAt: toIso(startsAt),
                  endsAt: toIso(endsAt),
                  signDeadline: signDeadline ? new Date(`${signDeadline}T23:59:00`).toISOString() : undefined,
                });
                setCreated((res.data as { id: string }).id);
                return res;
              })
            }
          >
            ایجاد پیش‌نویس
          </ActionButton>
        </div>
      )}
    </Modal>
  );
}
