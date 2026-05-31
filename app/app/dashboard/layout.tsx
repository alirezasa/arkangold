// app/dashboard/layout.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import type { UserData } from "@/app/utils/types";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [isVerifying, setIsVerifying] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) throw new Error("unauthorized");
        const data: UserData = await res.json();
        setUserData(data);
      } catch {
        router.replace("/login");
      } finally {
        setIsVerifying(false);
      }
    };

    verifySession();
  }, [router]);

  if (isVerifying) {
    return (
      <div
        className="flex h-screen w-full flex-col items-center justify-center"
        style={{ backgroundColor: "var(--color-bg-page)" }}
      >
        <svg className="mb-4 animate-spin" width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="var(--color-emerald-light)" strokeWidth="4" />
          <path d="M44 24a20 20 0 0 0-20-20" stroke="var(--color-emerald)" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <p className="animate-pulse text-lg font-bold" style={{ color: "var(--color-text-secondary)" }}>
          در حال برقراری ارتباط امن...
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      dir="rtl"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      {/* ── Desktop sidebar ── */}
      {/* با اضافه کردن hidden lg:block مشکل نمایش سایدبار در موبایل کاملا حل می‌شود */}
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userName={userData?.name}
          userPhone={userData?.phone}
        />
      </div>

      {/* ── Right column: topbar + content ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        
        {/* Desktop topbar */}
        <div className="hidden lg:block">
          <Topbar
            onMenuOpen={() => setSidebarOpen(true)}
            notifCount={3}
          />
        </div>

        {/* Mobile header */}
        <MobileHeader
          userName={userData?.name}
        />

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8"
        >
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation (که خودش مودال پروفایل رو هم هندل میکنه) ── */}
      <BottomNav />
    </div>
  );
}