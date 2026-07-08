"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import IdentityBanner from "./components/IdentityBanner";
import LegalProfileBanner from "./components/LegalProfileBanner"; // اضافه شد
import { UserType, type UserData } from '@arkan-gold/shared';

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
        <svg
          className="mb-4 animate-spin"
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            stroke="var(--color-emerald-light)"
            strokeWidth="4"
          />
          <path
            d="M44 24a20 20 0 0 0-20-20"
            stroke="var(--color-emerald)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <p
          className="animate-pulse text-lg font-bold"
          style={{ color: "var(--color-text-secondary)" }}
        >
          در حال برقراری ارتباط امن...
        </p>
      </div>
    );
  }

  const identityStatus = userData?.identity?.status || null;
  const displayName = userData?.identity?.firstName
    ? `${userData.identity.firstName} ${userData.identity.lastName}`
    : userData?.name || "کاربر جدید";

  // متغیرهای تصمیم‌گیری (هسته اصلی منطق درخواستی شما)
  const isLegalUser = userData?.type === UserType.LEGAL;
  const isLegalVerified = userData?.legalProfile?.verified === true;
  const needsLegalProfileCompletion = isLegalUser && !isLegalVerified;

  return (
    <div
      className="flex h-screen overflow-hidden"
      dir="rtl"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userName={displayName}
          userPhone={userData?.phone}
          identityStatus={identityStatus}
        />
      </div>

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <div className="hidden lg:block">
          <Topbar onMenuOpen={() => setSidebarOpen(true)} notifCount={3} />
        </div>

        <MobileHeader userName={displayName} identityStatus={identityStatus} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          {/* اگر کاربر حقوقی است و فرم را کامل نکرده -> بنر حقوقی نشان بده */}
          {/* در غیر این صورت -> برو سراغ نمایش بنر احراز هویت */}
          {needsLegalProfileCompletion ? (
            <LegalProfileBanner />
          ) : (
            <IdentityBanner status={identityStatus} />
          )}

          {children}
        </main>
      </div>

      <BottomNav identityStatus={identityStatus} />
    </div>
  );
}
