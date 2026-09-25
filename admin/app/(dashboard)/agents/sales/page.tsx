// admin/app/(dashboard)/agents/sales/page.tsx
"use client";
import { Coins } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { cardStyle } from "@/app/components/agents/ui";
import SalesTable from "@/app/components/agents/SalesTable";

export default function AgentSalesPage() {
  const { me } = useAdminMe();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Coins className="w-5 h-5" /> فروش‌های نمایندگان
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          همه‌ی شمش‌هایی که نمایندگان به مالک نهایی فروخته‌اند — با جزئیات قیمت، حق‌العمل، فاکتور مشتری و امکان ابطال
        </p>
      </div>
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <SalesTable
          listEndpoint="/api/admin/agents/sales"
          detailEndpoint={(id) => `/api/admin/agents/sales/${id}`}
          invoiceIssueEndpoint={(id) => `/api/admin/agents/sales/${id}/invoice`}
          showAgent
          canVoid={me?.permissions.includes("agent.sale.void") ?? false}
          invoiceScope="admin"
        />
      </div>
    </div>
  );
}
