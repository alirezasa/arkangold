"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IdentityStatus, UserType } from "@arkan-gold/shared";

import { useProfilePage } from "@/app/hooks/useProfilePage";
import { isIdentityFreePath } from "@/app/utils/mock-data";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import BottomNav from "./components/BottomNav";
import MobileHeader from "./components/MobileHeader";
import IdentityBanner from "./components/IdentityBanner";
import LegalProfileBanner from "./components/LegalProfileBanner";

const IDENTITY_PATH = "/dashboard/identity";
const LEGAL_PROFILE_PATH = "/dashboard/identity/legal";

type LegalOnboardingStep =
  | "not_applicable"
  | "identity"
  | "legal_profile_submit"
  | "legal_profile_pending"
  | "done";

/**
 * وضعیت هویت دریافتی از API را به enum مورد استفاده در رابط کاربری
 * تبدیل می‌کند.
 */
function normalizeIdentityStatus(
  status: string | null | undefined,
): IdentityStatus | null {
  switch (status) {
    case "PENDING":
      return IdentityStatus.PENDING;

    case "VERIFIED":
      return IdentityStatus.VERIFIED;

    case "REJECTED":
      return IdentityStatus.REJECTED;

    case "MANUAL_REVIEW":
      return IdentityStatus.MANUAL_REVIEW;

    default:
      return null;
  }
}

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
        aria-hidden="true"
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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // منبع داده واحد و مشترک بین Layout و صفحه پروفایل حقوقی
  const { data: userData, loading: isVerifying, error } = useProfilePage();

  /**
   * در صورت نامعتبر بودن نشست کاربر، انتقال به صفحه ورود
   */
  useEffect(() => {
    if (!isVerifying && error) {
      router.replace("/login");
    }
  }, [isVerifying, error, router]);

  /**
   * تبدیل وضعیت رشته‌ای دریافتی از API به enum مشترک پروژه
   */
  const identityStatus: IdentityStatus | null = normalizeIdentityStatus(
    userData?.identity?.status,
  );

  // نمایش نام و نام خانوادگی کاربر (در صورت نبود، شماره موبایل)
  const fullName = [userData?.identity?.firstName, userData?.identity?.lastName]
    .filter((part) => part && part.trim())
    .join(" ")
    .trim();
  const displayName = fullName || userData?.phone || "";

  const isLegalUser = userData?.type === UserType.LEGAL;

  const isIdentityVerified = identityStatus === IdentityStatus.VERIFIED;

  const legalProfile = userData?.legalProfile ?? null;

  const isLegalProfileVerified = legalProfile?.verified === true;

  const hasSubmittedLegalProfile = Boolean(legalProfile?.companyName?.trim());

  /**
   * تعیین مرحله فعلی احراز هویت کاربر حقوقی
   */
  const legalOnboardingStep: LegalOnboardingStep = !isLegalUser
    ? "not_applicable"
    : !isIdentityVerified
      ? "identity"
      : isLegalProfileVerified
        ? "done"
        : hasSubmittedLegalProfile
          ? "legal_profile_pending"
          : "legal_profile_submit";

  /**
   * احراز هویت برای همه کاربران اجباری است: تا تایید نهایی هویت، کاربر فقط به
   * صفحه احراز هویت (و پشتیبانی) دسترسی دارد. برای کاربر حقوقی پس از تایید هویت،
   * تکمیل و تایید پروفایل حقوقی نیز الزامی است.
   */
  const gateTargetPath: string | null = !isIdentityVerified
    ? IDENTITY_PATH
    : legalOnboardingStep === "legal_profile_submit" ||
        legalOnboardingStep === "legal_profile_pending"
      ? LEGAL_PROFILE_PATH
      : null;

  const isAllowedWhileGated = (path: string) =>
    path === gateTargetPath ||
    (gateTargetPath === IDENTITY_PATH && isIdentityFreePath(path));

  const isNavLocked = gateTargetPath !== null;

  /**
   * جلوگیری از ورود کاربر به بخش‌های سیستم تا زمان تکمیل و تایید احراز هویت
   */
  const allowedHere = gateTargetPath === null || isAllowedWhileGated(pathname);

  useEffect(() => {
    if (isVerifying || error) {
      return;
    }

    if (gateTargetPath && !allowedHere) {
      router.replace(gateTargetPath);
    }
  }, [isVerifying, error, gateTargetPath, allowedHere, router]);

  if (isVerifying) {
    return <FullScreenLoader text="در حال برقراری ارتباط امن..." />;
  }

  if (error) {
    return <FullScreenLoader text="در حال انتقال به صفحه ورود..." />;
  }

  if (gateTargetPath && !allowedHere) {
    return <FullScreenLoader text="در حال بررسی وضعیت حساب کاربری..." />;
  }

  const onGateTargetPage =
    gateTargetPath !== null && pathname === gateTargetPath;

  let bannerNode: ReactNode = null;

  if (!onGateTargetPage) {
    if (
      legalOnboardingStep === "legal_profile_submit" ||
      legalOnboardingStep === "legal_profile_pending"
    ) {
      bannerNode = (
        <LegalProfileBanner
          status={
            legalProfile?.status === "REJECTED"
              ? "rejected"
              : legalOnboardingStep === "legal_profile_pending"
                ? "pending_approval"
                : "need_submit"
          }
        />
      );
    } else {
      bannerNode = <IdentityBanner status={identityStatus} />;
    }
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      dir="rtl"
      style={{ backgroundColor: "var(--color-bg-page)" }}
    >
      <div className="hidden h-full shrink-0 lg:block">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          userName={displayName}
          userPhone={userData?.phone}
          identityStatus={identityStatus}
          locked={isNavLocked}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="hidden lg:block">
          <Topbar onMenuOpen={() => setSidebarOpen(true)} />
        </div>

        <MobileHeader userName={displayName} identityStatus={identityStatus} />

        <main className="flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          {bannerNode}
          {children}
        </main>
      </div>

      <BottomNav
        identityStatus={identityStatus}
        userName={displayName}
        userPhone={userData?.phone}
        locked={isNavLocked}
      />
    </div>
  );
}
