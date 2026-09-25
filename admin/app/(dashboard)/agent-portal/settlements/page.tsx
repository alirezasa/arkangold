// admin/app/(dashboard)/agent-portal/settlements/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import { HandCoins, Plus } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { Alert, cardStyle, fetcher, primaryBtn, primaryBtnStyle, toman } from "@/app/components/agents/ui";
import SettlementsTable from "@/app/components/agents/SettlementsTable";
import { SettlementModal } from "@/app/components/agents/AgentActionModals";

export default function AgentSettlementsPage() {
  const { me } = useAdminMe();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: summary, mutate } = useSWR<{ balanceRial: string; settlements: { pendingRial: string } }>(
    me?.agent ? "/api/agent-portal/summary" : null,
    fetcher,
  );
  if (me && !me.agent) return <Alert kind="warn" text="این حساب به نماینده‌ای متصل نیست." />;
  const canSettle = (me?.permissions.includes("agent_portal.settle") ?? false) && me?.agent?.status === "ACTIVE";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <HandCoins className="w-5 h-5" /> تسویه و واریز
          </h1>
          <p className="text-[12px] text-gray-400 mt-1">
            سهم شرکت از فروش‌ها را به حساب شرکت واریز و در اینجا اعلام کنید؛ پس از تأیید واحد مالی از بدهی شما کسر می‌شود.
          </p>
        </div>
        {canSettle && (
          <button type="button" onClick={() => setOpen(true)} className={primaryBtn} style={primaryBtnStyle}>
            <Plus className="w-4 h-4" /> اعلام واریز
          </button>
        )}
      </div>
      {summary && (
        <div className="grid grid-cols-2 gap-3 max-w-xl">
          <div className="rounded-2xl p-4" style={cardStyle}>
            <p className="text-[11px] text-gray-500">بدهی فعلی شما</p>
            <p className={`text-[18px] font-black ${Number(summary.balanceRial) > 0 ? "text-red-600" : "text-green-700"}`}>
              {toman(summary.balanceRial)} تومان
            </p>
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}>
            <p className="text-[11px] text-gray-500">واریزهای در انتظار تأیید</p>
            <p className="text-[18px] font-black text-amber-700">{toman(summary.settlements.pendingRial)} تومان</p>
          </div>
        </div>
      )}
      {message && <Alert kind="success" text={message} />}
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <SettlementsTable listEndpoint="/api/agent-portal/settlements" refreshKey={refreshKey} />
      </div>
      {open && (
        <SettlementModal
          endpoint="/api/agent-portal/settlements"
          title="اعلام واریز به شرکت"
          balanceRial={summary?.balanceRial}
          intro="پس از واریز به حساب شرکت، مبلغ و شماره پیگیری را ثبت کنید. واحد مالی واریز را با صورتحساب بانک تطبیق می‌دهد و پس از تأیید، از بدهی شما کسر می‌شود."
          submitLabel="ثبت اعلام واریز"
          onClose={() => setOpen(false)}
          onDone={async (msg) => {
            setOpen(false);
            setMessage(`${msg} — در انتظار تأیید واحد مالی`);
            setRefreshKey((k) => k + 1);
            await mutate();
          }}
        />
      )}
    </div>
  );
}
