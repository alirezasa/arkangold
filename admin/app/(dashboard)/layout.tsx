// admin/app/(dashboard)/layout.tsx
"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import Sidebar from "@/app/components/Sidebar";
import MobileHeader from "@/app/components/MobileHeader";
import MobileDrawer from "@/app/components/MobileDrawer";
import BottomNav from "@/app/components/BottomNav";
import OfflineBanner from "@/app/components/OfflineBanner";
import { Loader2 } from "lucide-react";

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

  // حساب نماینده فقط پرتال نمایندگی و پروفایل خودش را دارد؛ مسیرهای مدیریتی به پرتال هدایت می‌شوند
  const agentBlocked =
    !!me?.agent && !pathname.startsWith("/agent-portal") && !pathname.startsWith("/profile");
  useEffect(() => {
    if (agentBlocked) router.replace("/agent-portal");
  }, [agentBlocked, router]);

  if (loading || !me || agentBlocked) {
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
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">{children}</main>
        <BottomNav me={me} />
      </div>
    </div>
  );
}
