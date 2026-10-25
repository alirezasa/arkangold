// admin/app/components/agents/PaymentResultBanner.tsx
//
// نتیجه‌ی بازگشت از درگاه پرداخت (?payment=success|failed) در پرتال نماینده.
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "./ui";

function Banner({ success, failed }: { success: string; failed: string }) {
  const p = useSearchParams().get("payment");
  if (p === "success") return <Alert kind="success" text={success} />;
  if (p === "failed") return <Alert kind="error" text={failed} />;
  return null;
}

export default function PaymentResultBanner(props: { success: string; failed: string }) {
  return (
    <Suspense fallback={null}>
      <Banner {...props} />
    </Suspense>
  );
}
