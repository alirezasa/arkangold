// admin/app/(dashboard)/agent-portal/inventory/page.tsx
"use client";
import { Boxes } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { Alert, cardStyle } from "@/app/components/agents/ui";
import InventoryTable from "@/app/components/agents/InventoryTable";
import { MovementsView } from "@/app/components/agents/LedgerViews";

export default function AgentInventoryPage() {
  const { me } = useAdminMe();
  if (me && !me.agent) return <Alert kind="warn" text="این حساب به نماینده‌ای متصل نیست." />;
  const canSell = (me?.permissions.includes("agent_portal.sell") ?? false) && me?.agent?.status === "ACTIVE";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Boxes className="w-5 h-5" /> موجودی امانی
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          شمش‌هایی که شرکت به‌صورت امانی به شما تحویل داده و هنوز فروخته نشده‌اند. پیش از فروش، کد هولوگرام روی شمش را با
          این فهرست تطبیق دهید.
        </p>
      </div>
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <InventoryTable endpoint="/api/agent-portal/inventory" sellLink={canSell} />
      </div>
      <div className="rounded-2xl p-4 sm:p-5 space-y-3" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800">حواله‌های ورود و خروج شمش</h2>
        <MovementsView
          endpoint="/api/agent-portal/movements"
          voucherHref={(v) => `/agent-docs/voucher/${encodeURIComponent(v)}?scope=agent`}
        />
      </div>
    </div>
  );
}
