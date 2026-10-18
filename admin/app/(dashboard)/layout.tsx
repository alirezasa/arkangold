// admin/app/(dashboard)/layout.tsx
"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { portalFromHost } from "@/lib/portal";
import Sidebar from "@/app/components/Sidebar";
import MobileHeader from "@/app/components/MobileHeader";
import MobileDrawer from "@/app/components/MobileDrawer";
import BottomNav from "@/app/components/BottomNav";
import OfflineBanner from "@/app/components/OfflineBanner";
import NewOrderAlert from "@/app/components/NewOrderAlert";
import { Loader2, ShieldOff } from "lucide-react";
import Link from "next/link";
import { canOpenPath } from "@/app/utils/nav";
import { logoutAndWipe } from "@/app/utils/session-cleanup";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { me, loading, error } = useAdminMe();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (error) router.replace("/login");
  }, [error, router]);

  // نشست باید با دامنه بخواند (کارشناس در admin.arkan.gold، نماینده در panel.arkan.gold)؛
  // در غیر این صورت نشست بسته و کاربر به صفحه‌ی ورود همین دامنه هدایت می‌شود
  const wrongPortal =
    !!me &&
    typeof window !== "undefined" &&
    (portalFromHost(window.location.host) === "agent") !== !!me.agent;
  useEffect(() => {
    if (!wrongPortal) return;
    void logoutAndWipe("/api/admin-auth/logout");
  }, [wrongPortal, router]);

  // حساب نماینده فقط پرتال نمایندگی و پروفایل خودش را دارد؛ مسیرهای مدیریتی به پرتال هدایت می‌شوند
  const agentBlocked =
    !!me?.agent && !pathname.startsWith("/agent-portal") && !pathname.startsWith("/profile");
  useEffect(() => {
    if (agentBlocked) router.replace("/agent-portal");
  }, [agentBlocked, router]);

  if (loading || !me || agentBlocked || wrongPortal) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-page)" }}
      >
        <Loader2
          className="w-7 h-7 animate-spin"
          style={{ color: "var(--color-emerald)" }}
        />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      <OfflineBanner />
      <Sidebar me={me} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        me={me}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <MobileHeader onMenuOpen={() => setDrawerOpen(true)} me={me} />
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">
          {canOpenPath(pathname, me) ? (
            children
          ) : (
            // ورود مستقیم با نشانی به بخشی که نقش ادمین دسترسی آن را ندارد
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center" dir="rtl">
              <ShieldOff className="mx-auto mb-3 h-10 w-10 text-gray-300" />
              <h2 className="text-[15px] font-black text-gray-900">دسترسی به این بخش ندارید</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
                نقش شما مجوز مشاهده‌ی این بخش را ندارد. در صورت نیاز با مدیر سیستم تماس بگیرید.
              </p>
              <Link
                href={me.agent ? "/agent-portal" : "/modules"}
                className="mt-5 inline-block rounded-xl px-5 py-2.5 text-[12.5px] font-black text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                بازگشت
              </Link>
            </div>
          )}
        </main>
        <BottomNav me={me} />
      </div>
      {/* اعلان صوتی سفارش جدید فروشگاه (فقط کارشناسان با دسترسی مشاهده‌ی سفارش) */}
      {!me.agent && me.permissions.includes("shop.view") && <NewOrderAlert />}
    </div>
  );
}
