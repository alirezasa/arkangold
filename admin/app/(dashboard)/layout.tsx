// admin/app/(dashboard)/layout.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

  useEffect(() => {
    if (error) router.replace("/login");
  }, [error, router]);

  if (loading || !me) {
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
      <Sidebar permissions={me.permissions} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        permissions={me.permissions}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <MobileHeader
          onMenuOpen={() => setDrawerOpen(true)}
          fullName={me.fullName}
        />
        <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">{children}</main>
        <BottomNav permissions={me.permissions} />
      </div>
    </div>
  );
}
