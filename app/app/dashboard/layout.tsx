"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import IdentityBanner from "./components/IdentityBanner";
import LegalProfileBanner from "./components/LegalProfileBanner";
import { UserType, IdentityStatus, type UserData } from "@arkan-gold/shared";

const IDENTITY_PATH = "/dashboard/identity";
const LEGAL_PROFILE_PATH = "/dashboard/identity/legal";

type LegalOnboardingStep =
  | "not_applicable" // کاربر حقیقی
  | "identity" // حقوقی، هنوز احراز هویت شخصی نشده
  | "legal_profile_submit" // احراز شده، هنوز اطلاعات شرکت ثبت نشده
  | "legal_profile_pending" // اطلاعات شرکت ثبت شده، منتظر تایید ادمین
  | "done"; // همه چیز تمام و تایید شده

function FullScreenLoader({ text }: { text: string }) {
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
        {text}
      </p>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

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

  const identityStatus = userData?.identity?.status || null;
  const displayName = userData?.identity?.firstName
    ? `${userData.identity.firstName} ${userData.identity.lastName}`
    : userData?.name || "کاربر جدید";

  // ── تشخیص مرحله‌ی onboarding برای کاربر حقوقی ──
  const isLegalUser = userData?.type === UserType.LEGAL;
  const isIdentityVerified = identityStatus === IdentityStatus.VERIFIED;
  const legalProfile = userData?.legalProfile ?? null;
  const isLegalProfileVerified = legalProfile?.verified === true;
  const hasSubmittedLegalProfile = !!legalProfile?.companyName?.trim();

  const legalOnboardingStep: LegalOnboardingStep = !isLegalUser
    ? "not_applicable"
    : !isIdentityVerified
      ? "identity"
      : isLegalProfileVerified
        ? "done"
        : hasSubmittedLegalProfile
          ? "legal_profile_pending"
          : "legal_profile_submit";

  // مسیر اجباری برای این مرحله (اگر null باشد یعنی محدودیتی نیست)
  const gateTargetPath =
    legalOnboardingStep === "identity"
      ? IDENTITY_PATH
      : legalOnboardingStep === "legal_profile_submit" ||
          legalOnboardingStep === "legal_profile_pending"
        ? LEGAL_PROFILE_PATH
        : null;

  useEffect(() => {
    if (isVerifying) return;
    if (gateTargetPath && pathname !== gateTargetPath) {
      router.replace(gateTargetPath);
    }
  }, [isVerifying, gateTargetPath, pathname, router]);

  if (isVerifying) {
    return <FullScreenLoader text="در حال برقراری ارتباط امن..." />;
  }

  if (gateTargetPath && pathname !== gateTargetPath) {
    return <FullScreenLoader text="در حال بررسی وضعیت حساب کاربری..." />;
  }

  // ── تعیین بنر قابل‌نمایش ──
  // اگر روی خودِ صفحه‌ی گیت هستیم، بنر تکراری نشون نده (خودِ صفحه وضعیت رو توضیح می‌ده)
  const onGateTargetPage =
    gateTargetPath !== null && pathname === gateTargetPath;

  let bannerNode: React.ReactNode = null;
  if (!onGateTargetPage) {
    if (
      legalOnboardingStep === "legal_profile_submit" ||
      legalOnboardingStep === "legal_profile_pending"
    ) {
      bannerNode = (
        <LegalProfileBanner
          status={
            legalOnboardingStep === "legal_profile_pending"
              ? "pending_approval"
              : "need_submit"
          }
        />
      );
    } else {
      // کاربر حقیقی، یا کاربر حقوقیِ تایید‌شده (done) — بنر معمولیِ احراز هویت
      bannerNode = <IdentityBanner status={identityStatus} />;
    }
  }

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
          {bannerNode}
          {children}
        </main>
      </div>

      <BottomNav identityStatus={identityStatus} />
    </div>
  );
}
