// admin/app/(dashboard)/agent-portal/contracts/[id]/page.tsx
//
// مطالعه و امضای الکترونیک قرارداد توسط نماینده: پذیرش مفاد ← دریافت کد ۶ رقمی پیامکی ← امضا.
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight, FileSignature, ShieldCheck } from "lucide-react";
import { CONTRACT_STATUS, ContractDocument, PrintButton, type ContractDetail } from "@/app/components/agents/ContractViews";
import { ActionButton, Alert, Badge, Spinner, api, cardStyle, faDateTime, fetcher, inputCls, useAction } from "@/app/components/finance/ui";

export default function PortalContractPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, mutate } = useSWR<ContractDetail>(`/api/agent-portal/contracts/${id}`, fetcher);
  const act = useAction();
  const [accept, setAccept] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!c) return <Spinner />;

  const requestOtp = async () => {
    const ok = await act.run(async () => {
      const res = await api.post(`/api/agent-portal/contracts/${c.id}/request-otp`);
      setCooldown((res.data as { resendAfterSeconds?: number }).resendAfterSeconds ?? 60);
      return res;
    });
    if (ok) setOtpSent(true);
  };

  const sign = async () => {
    const ok = await act.run(() => api.post(`/api/agent-portal/contracts/${c.id}/sign`, { code, accept }));
    if (ok) await mutate();
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link href="/agent-portal/contracts" className="p-2 rounded-xl border border-gray-200 bg-white">
            <ChevronRight className="w-4 h-4" />
          </Link>
          <h1 className="font-black text-[15px]">
            قرارداد <span dir="ltr">{c.contractNumber}</span>
          </h1>
          <Badge map={CONTRACT_STATUS} value={c.status} />
        </div>
        <PrintButton />
      </div>

      {c.status === "ISSUED" && c.signDeadline && (
        <div className="print:hidden">
          <Alert kind="info" text={`مهلت امضا تا ${faDateTime(c.signDeadline)}`} />
        </div>
      )}

      <ContractDocument c={c} />

      {c.status === "ISSUED" && (
        <div className="rounded-2xl p-5 space-y-3 print:hidden" style={cardStyle}>
          <p className="font-black flex items-center gap-2">
            <FileSignature className="w-4 h-4" /> امضای الکترونیک
          </p>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1.5" />
            <span>
              متن کامل قرارداد شماره <span dir="ltr">{c.contractNumber}</span> را مطالعه کرده‌ام و مفاد آن را می‌پذیرم. می‌دانم که امضای الکترونیک با کد
              یکبارمصرف ارسال‌شده به شماره همراه <span dir="ltr">{c.agent.phone}</span> در حکم امضای دستی است.
            </span>
          </label>
          {act.error && <Alert kind="error" text={act.error} />}
          {act.success && <Alert kind="success" text={act.success} />}
          {!otpSent && !c.otpPending ? (
            <ActionButton busy={act.busy} disabled={!accept} onClick={() => void requestOtp()}>
              دریافت کد امضا
            </ActionButton>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="کد ۶ رقمی"
                className={`${inputCls} w-40 text-center tracking-[0.4em] font-black text-lg`}
                dir="ltr"
              />
              <ActionButton busy={act.busy} disabled={!accept || code.trim().length !== 6} onClick={() => void sign()}>
                <ShieldCheck className="w-4 h-4" /> امضای قرارداد
              </ActionButton>
              <button type="button" disabled={cooldown > 0 || act.busy} onClick={() => void requestOtp()} className="text-[12px] font-bold text-emerald-700 disabled:text-gray-400">
                {cooldown > 0 ? `ارسال مجدد (${cooldown.toLocaleString("fa-IR")})` : "ارسال مجدد کد"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
