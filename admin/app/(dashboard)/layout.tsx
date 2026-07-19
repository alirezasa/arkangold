"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import {
  LayoutDashboard,
  Wallet,
  Building2,
  Package,
  ShoppingBag,
  Users,
  ShieldAlert,
  LogOut,
} from "lucide-react";

interface AdminMe {
  username: string;
  fullName: string;
  role: { key: string; name: string };
  permissions: string[];
}

const NAV = [
  { label: "داشبورد", href: "/", icon: LayoutDashboard, perm: null },
  {
    label: "درخواست‌های برداشت",
    href: "/withdrawals",
    icon: Wallet,
    perm: "withdrawal.view",
  },
  {
    label: "پروفایل‌های حقوقی",
    href: "/legal-profiles",
    icon: Building2,
    perm: "legal_profile.view",
  },
  {
    label: "تحویل فیزیکی",
    href: "/physical-deliveries",
    icon: Package,
    perm: "physical_delivery.view",
  },
  {
    label: "سفارشات فروشگاه",
    href: "/shop-orders",
    icon: ShoppingBag,
    perm: "shop.view",
  },
  {
    label: "مدیریت ادمین‌ها",
    href: "/admins",
    icon: Users,
    perm: "admin.manage",
  },
  {
    label: "گزارش فعالیت‌ها",
    href: "/audit-log",
    icon: ShieldAlert,
    perm: "admin.audit_log.view",
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    axios
      .get("/api/admin-auth/me")
      .then((res) => setMe(res.data))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await axios.post("/api/admin-auth/logout");
    router.replace("/login");
  };

  if (loading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        در حال بارگذاری...
      </div>
    );
  }

  const visibleNav = NAV.filter(
    (item) => !item.perm || me.permissions.includes(item.perm),
  );

  return (
    <div className="flex min-h-screen" dir="rtl">
      <aside
        className="w-64 shrink-0 flex flex-col"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <h1 className="text-white font-black text-lg">پنل مدیریت</h1>
          <p className="text-white/40 text-[11px] mt-0.5">آرکان گلد</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-colors ${
                  active ? "text-white" : "text-white/60 hover:bg-white/5"
                }`}
                style={
                  active
                    ? {
                        backgroundColor: "var(--color-gold-500)",
                        color: "var(--color-emerald)",
                      }
                    : undefined
                }
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-[12px] font-bold">{me.fullName}</p>
            <p className="text-white/40 text-[11px]">{me.role.name}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-300 hover:bg-red-500/10 text-[12px] font-bold"
          >
            <LogOut className="w-4 h-4" />
            خروج
          </button>
        </div>
      </aside>

      <main
        className="flex-1 p-6"
        style={{ backgroundColor: "var(--color-bg-page)" }}
      >
        {children}
      </main>
    </div>
  );
}
