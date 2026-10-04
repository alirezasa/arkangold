// admin/app/(dashboard)/agent-portal/contracts/page.tsx — قراردادهای نماینده در پرتال
"use client";
import useSWR from "swr";
import { FileSignature } from "lucide-react";
import { ContractsTable, type ContractListItem } from "@/app/components/agents/ContractViews";
import { Alert, Empty, PageHeader, Spinner, cardStyle, fetcher } from "@/app/components/finance/ui";

export default function PortalContractsPage() {
  const { data, isLoading } = useSWR<ContractListItem[]>("/api/agent-portal/contracts", fetcher);
  const pending = (data ?? []).filter((c) => c.status === "ISSUED");
  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader icon={FileSignature} title="قراردادهای نمایندگی" subtitle="قراردادهای صادرشده برای شما؛ قرارداد را مطالعه و با کد یکبارمصرف ارسال‌شده به شماره همراه خود امضا کنید." />
      {pending.length > 0 && <Alert kind="warn" text={`${pending.length.toLocaleString("fa-IR")} قرارداد در انتظار امضای شماست.`} />}
      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? <Spinner /> : data.length === 0 ? <Empty text="قراردادی برای شما صادر نشده است" /> : <ContractsTable items={data} basePath="/agent-portal/contracts" />}
      </div>
    </div>
  );
}
