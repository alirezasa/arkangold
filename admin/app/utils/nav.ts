// admin/app/utils/nav.ts
import {
  LayoutDashboard,
  Wallet,
  Building2,
  Package,
  ShoppingBag,
  FolderTree,
  Users,
  ShieldAlert,
  Settings2,
  UserCog,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  perm: string | null;
  badgeKey?: string; // برای نشون دادن تعداد در انتظار (اختیاری، در آینده)
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "کلی",
    items: [
      { label: "داشبورد", href: "/", icon: LayoutDashboard, perm: null },
    ],
  },
  {
    title: "مالی",
    items: [
      { label: "درخواست‌های برداشت", href: "/withdrawals", icon: Wallet, perm: "withdrawal.view" },
      { label: "تراکنش‌های کاربران", href: "/transactions", icon: Wallet, perm: "transactions.view" },
    ],
  },
  {
    title: "کاربران",
    items: [
      { label: "لیست کاربران", href: "/users", icon: Users, perm: "users.view" },
      { label: "پروفایل‌های حقوقی", href: "/legal-profiles", icon: Building2, perm: "legal_profile.view" },
    ],
  },
  {
    title: "فروشگاه",
    items: [
      { label: "محصولات", href: "/shop/products", icon: Package, perm: "shop.manage" },
      { label: "دسته‌بندی‌ها", href: "/shop/categories", icon: FolderTree, perm: "shop.manage" },
      { label: "سفارشات فروشگاه", href: "/shop-orders", icon: ShoppingBag, perm: "shop.view" },
    ],
  },
  {
    title: "عملیات",
    items: [
      { label: "تحویل فیزیکی طلا", href: "/physical-deliveries", icon: Package, perm: "physical_delivery.view" },
      { label: "پی‌رول (شارژ دستی)", href: "/payroll", icon: Wallet, perm: "payroll.view" },
    ],
  },
  {
    title: "سیستم",
    items: [
      { label: "تنظیمات سیستم", href: "/system-config", icon: Settings2, perm: "system_config.view" },
    ],
  },
  {
    title: "مدیریت پنل",
    items: [
      { label: "مدیریت ادمین‌ها", href: "/admins", icon: UserCog, perm: "admin.manage" },
      { label: "گزارش فعالیت‌ها", href: "/audit-log", icon: ShieldAlert, perm: "admin.audit_log.view" },
    ],
  },
];

export const BOTTOM_NAV_ITEMS = [
  { label: "داشبورد", href: "/", icon: LayoutDashboard, perm: null },
  { label: "برداشت‌ها", href: "/withdrawals", icon: Wallet, perm: "withdrawal.view" },
  { label: "محصولات", href: "/shop/products", icon: Package, perm: "shop.manage" },
  { label: "سفارشات", href: "/shop-orders", icon: ShoppingBag, perm: "shop.view" },
  { label: "پروفایل", href: "/profile", icon: UserCog, perm: null },
];
