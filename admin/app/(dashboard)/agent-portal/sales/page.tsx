// admin/app/(dashboard)/agent-portal/sales/page.tsx
"use client";
import Link from "next/link";
import { Receipt, ShoppingCart } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { Alert, cardStyle, primaryBtn, primaryBtnStyle } from "@/app/components/agents/ui";
import SalesTable from "@/app/components/agents/SalesTable";

export default function AgentSalesPage() {
  const { me } = useAdminMe();
  if (me && !me.agent) return <Alert kind="warn" text="این حساب به نماینده‌ای متصل نیست." />;
  const canSell = (me?.permissions.includes("agent_portal.sell") ?? false) && me?.agent?.status === "ACTIVE";
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5" /> فروش‌های من
          </h1>
          <p className="text-[12px] text-gray-400 mt-1">
            فروش‌های ثبت‌شده، فاکتور مشتری، حق‌العمل شما و سهم شرکت از هر فروش
          </p>
        </div>
        {canSell && (
          <Link href="/agent-portal/sell" className={primaryBtn} style={primaryBtnStyle}>
            <ShoppingCart className="w-4 h-4" /> ثبت فروش جدید
          </Link>
        )}
      </div>
      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        <SalesTable
          listEndpoint="/api/agent-portal/sales"
          detailEndpoint={(id) => `/api/agent-portal/sales/${id}`}
          invoiceIssueEndpoint={(id) => `/api/agent-portal/sales/${id}/invoice`}
          invoiceScope="agent"
        />
      </div>
    </div>
  );
}
