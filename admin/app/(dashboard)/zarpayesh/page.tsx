// admin/app/(dashboard)/zarpayesh/page.tsx
//
// سامانه ناظر بر خرید و فروش بر خط طلا و نقره (زر پایش — api.rpmms.ir، مستند ۳.۰.۰.۴):
// راه‌اندازی و آزمون اتصال، روشن/خاموش کردن ثبت خودکار معاملات (پیش‌فرض خاموش)، معاملات گزارش‌شده،
// کاربران سکو، ارسال دارایی، استعلام‌ها و لاگ کامل فراخوانی‌ها.
"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Alert, PageHeader, Spinner, Tabs } from "@/app/components/finance/ui";
import { useOverview } from "@/app/components/zarpayesh/shared";
import SetupTab from "@/app/components/zarpayesh/SetupTab";
import TradesTab from "@/app/components/zarpayesh/TradesTab";
import UsersTab from "@/app/components/zarpayesh/UsersTab";
import DeliveriesTab from "@/app/components/zarpayesh/DeliveriesTab";
import LogsTab from "@/app/components/zarpayesh/LogsTab";

type TabKey = "setup" | "trades" | "users" | "deliveries" | "logs";

export default function ZarPayeshPage() {
  const [tab, setTab] = useState<TabKey>("setup");
  const { data, error } = useOverview();
  const review = data?.stats.needsReview ?? 0;
  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={Eye}
        title="سامانه ناظر طلا (زر پایش)"
        subtitle="ثبت عملیات خرید و فروش طلای آب‌شده در سامانه ناظر بر خرید و فروش بر خط طلا و نقره — رزرو، تأیید، لغو، پیگیری، ثبت کاربران و ارسال دارایی"
      />
      <Tabs<TabKey>
        tabs={[
          { key: "setup", label: "وضعیت و راه‌اندازی" },
          { key: "trades", label: review ? `معاملات (${review.toLocaleString("fa-IR")} نیازمند بررسی)` : "معاملات" },
          { key: "users", label: "کاربران و استعلام‌ها" },
          { key: "deliveries", label: "ارسال دارایی" },
          { key: "logs", label: "لاگ‌ها و کدهای خطا" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {error ? (
        <Alert kind="error" text="دریافت وضعیت سامانه ناظر ناموفق بود" />
      ) : !data ? (
        <Spinner />
      ) : tab === "setup" ? (
        <SetupTab />
      ) : tab === "trades" ? (
        <TradesTab />
      ) : tab === "users" ? (
        <UsersTab />
      ) : tab === "deliveries" ? (
        <DeliveriesTab />
      ) : (
        <LogsTab />
      )}
    </div>
  );
}
