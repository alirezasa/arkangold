"use client";
import { IdentityStatus } from "@arkan-gold/shared"; // این خط اضافه شود
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ShieldCheck,
  ShieldAlert,
  ShieldCheck as ShieldPending,
  CreditCard,
  Lock,
  LogOut,
  ChevronLeft,
  User,
  Settings,
} from "lucide-react";

interface MobileProfileProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userPhone?: string;
  identityStatus?: IdentityStatus | null;
}

export default function MobileProfile({
  isOpen,
  onClose,
  userName = "کاربر گرامی",
  userPhone = "۰۹۲۱****۷۰۴",
  identityStatus = null,
}: MobileProfileProps) {
  const router = useRouter();

  // قفل کردن اسکرول صفحه پشت مودال در زمان باز بودن
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onClose();
      router.replace("/login");
    } catch {
      console.error("خطا در خروج");
    }
  };

  if (!isOpen) return null;

  // تنظیم رنگ و متن وضعیت احراز هویت
  const getStatusDetails = () => {
    switch (identityStatus) {
      case "VERIFIED":
        return {
          text: "احراز هویت شده",
          color: "text-green-600 bg-green-50 border-green-200",
          icon: <ShieldCheck className="w-5 h-5 text-green-500" />,
        };
      case "PENDING":
      case "MANUAL_REVIEW":
        return {
          text: "در حال بررسی",
          color: "text-amber-600 bg-amber-50 border-amber-200",
          icon: (
            <ShieldPending className="w-5 h-5 text-amber-500 animate-pulse" />
          ),
        };
      default:
        return {
          text: "نیاز به احراز هویت",
          color: "text-red-600 bg-red-50 border-red-200",
          icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
        };
    }
  };

  const status = getStatusDetails();

  return (
    <div className="fixed inset-0 z-[100] lg:hidden" dir="rtl">
      {/* بک‌دراپ تاریک و مات کننده پشت مودال */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* باکس اصلی منو که از پایین بالا می‌آید */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-50 rounded-t-[24px] max-h-[92vh] overflow-y-auto flex flex-col shadow-[0_-8px_32px_rgba(0,0,0,0.15)] animate-slide-up pb-safe">
        {/* هدر مودال و دستگیره بالایی */}
        <div className="flex flex-col items-center justify-center pt-3 pb-2 bg-white border-b border-gray-100 rounded-t-[24px]">
          <div
            className="w-12 h-1 bg-gray-300 rounded-full mb-4"
            onClick={onClose}
          />
          <div className="flex items-center justify-between w-full px-5">
            <h2 className="text-[16px] font-black text-gray-800">
              پروفایل کاربری
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 bg-gray-100 rounded-full text-gray-500 active:scale-95 transition-transform"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* بخش اطلاعات کاربر */}
        <div className="p-5 bg-white border-b border-gray-100 flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-[20px] font-black"
            style={{
              background: "var(--color-gold-500)",
              color: "var(--color-emerald)",
            }}
          >
            {userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-black text-gray-800 truncate mb-1">
              {userName}
            </h3>
            <p
              className="text-[13px] text-gray-500 font-medium"
              dir="ltr"
              style={{ textAlign: "right" }}
            >
              {userPhone}
            </p>
          </div>
        </div>

        {/* کارت وضعیت احراز هویت */}
        <div className="p-4">
          <div
            className={`flex items-center justify-between p-4 rounded-2xl border ${status.color} bg-white shadow-sm`}
          >
            <div className="flex items-center gap-3">
              {status.icon}
              <div>
                <p className="text-[13px] font-black">{status.text}</p>
                {identityStatus !== "VERIFIED" && (
                  <p className="text-[11px] opacity-80 mt-0.5">
                    برای دسترسی به تمامی امکانات هویت خود را تایید کنید.
                  </p>
                )}
              </div>
            </div>
            {identityStatus !== "VERIFIED" && (
              <button
                onClick={() => {
                  onClose();
                  router.push("/dashboard/identity");
                }}
                className="bg-[#064e3b] text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shrink-0 active:scale-95 transition-transform"
              >
                شروع احراز
              </button>
            )}
          </div>
        </div>

        {/* منوهای ناوبری داخل پروفایل */}
        <div className="px-4 space-y-2.5 flex-1">
          {[
            {
              title: "اطلاعات حساب کاربری",
              icon: <User className="w-5 h-5 text-gray-500" />,
              path: "/dashboard/profile",
            },
            {
              title: "حساب‌ها و کارت‌های بانکی",
              icon: <CreditCard className="w-5 h-5 text-gray-500" />,
              path: "/dashboard/cards",
            },
            {
              title: "امنیت و تغییر رمز عبور",
              icon: <Lock className="w-5 h-5 text-gray-500" />,
              path: "/dashboard/security",
            },
            {
              title: "تنظیمات پیشرفته",
              icon: <Settings className="w-5 h-5 text-gray-500" />,
              path: "/dashboard/settings",
            },
          ].map((menu, idx) => (
            <button
              key={idx}
              onClick={() => {
                onClose();
                router.push(menu.path);
              }}
              className="w-full flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border border-gray-100/50 active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2 bg-gray-50 rounded-xl text-gray-600">
                  {menu.icon}
                </div>
                <span className="text-[13px] font-bold text-gray-700">
                  {menu.title}
                </span>
              </div>
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
          ))}
        </div>

        {/* دکمه خروج از حساب */}
        <div className="p-4 mt-6">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-[13px] font-black active:bg-red-100 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>خروج از حساب کاربری</span>
          </button>
        </div>
      </div>
    </div>
  );
}
