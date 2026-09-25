// admin/app/(dashboard)/agents/settlements/page.tsx
"use client";
import { HandCoins } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { Alert, cardStyle } from "@/app/components/agents/ui";
import SettlementsTable from "@/app/components/agents/SettlementsTable";

export default function AgentSettlementsPage() {
  const { me } = useAdminMe();
  const canReview = me?.permissions.includes("agent.settlement.manage") ?? false;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <HandCoins className="w-5 h-5" /> تسویه‌های نمایندگان
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          واریزهایی که نمایندگان اعلام کرده‌اند یا واحد مالی ثبت کرده است
        </p>
      </div>
      {canReview && (
        <Alert
          kind="info"
          text="پیش از تأیید، واریز را در صورتحساب بانکی شرکت با شماره پیگیری تطبیق دهید. با تأیید، سند «بدهکار موجودی نقد / بستانکار دریافتنی از نمایندگان» صادر و از بدهی نماینده کسر می‌شود."
        />
      )}
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <SettlementsTable
          listEndpoint="/api/admin/agents/settlements"
          showAgent
          canReview={canReview}
          defaultStatus="PENDING"
        />
      </div>
    </div>
  );
}
