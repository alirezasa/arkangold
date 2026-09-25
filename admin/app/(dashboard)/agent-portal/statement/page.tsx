// admin/app/(dashboard)/agent-portal/statement/page.tsx
"use client";
import { FileSpreadsheet } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { Alert, cardStyle } from "@/app/components/agents/ui";
import { StatementView } from "@/app/components/agents/LedgerViews";

export default function AgentStatementPage() {
  const { me } = useAdminMe();
  if (me && !me.agent) return <Alert kind="warn" text="این حساب به نماینده‌ای متصل نیست." />;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" /> صورتحساب نمایندگی
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          هر فروش سهم شرکت را به بدهی شما اضافه (بدهکار) و هر تسویه‌ی تأییدشده آن را کم (بستانکار) می‌کند.
        </p>
      </div>
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <StatementView endpoint="/api/agent-portal/statement" printHref="/agent-docs/statement?scope=agent" />
      </div>
    </div>
  );
}
