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
  BookOpen,
  Scale,
  Headset,
  Tags,
  Plug,
  ScanLine,
  KeyRound,
  Bell,
  ShieldCheck,
  Gift,
  TicketPercent,
  Box,
  Store,
  Coins,
  Receipt,
  HandCoins,
  FileSpreadsheet,
  BarChart3,
  Boxes,
  ShoppingCart,
  UserCircle,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  perm: string | null;
  badgeKey?: string; // برای نشون دادن تعداد در انتظار (اختیاری، در آینده)
  /** فقط برای حساب‌های متصل به نماینده فروش (پرتال نماینده) */
  agentOnly?: boolean;
  /** برای حساب نماینده نمایش داده نشود */
  hideForAgent?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "کلی",
    items: [
      { label: "داشبورد", href: "/", icon: LayoutDashboard, perm: null, hideForAgent: true },
    ],
  },
  {
    title: "پرتال نماینده",
    items: [
      { label: "داشبورد نمایندگی", href: "/agent-portal", icon: Store, perm: "agent_portal.view", agentOnly: true },
      { label: "ثبت فروش شمش", href: "/agent-portal/sell", icon: ShoppingCart, perm: "agent_portal.sell", agentOnly: true },
      { label: "موجودی امانی", href: "/agent-portal/inventory", icon: Boxes, perm: "agent_portal.view", agentOnly: true },
      { label: "فروش‌های من", href: "/agent-portal/sales", icon: Receipt, perm: "agent_portal.view", agentOnly: true },
      { label: "تسویه و واریز", href: "/agent-portal/settlements", icon: HandCoins, perm: "agent_portal.view", agentOnly: true },
      { label: "صورتحساب", href: "/agent-portal/statement", icon: FileSpreadsheet, perm: "agent_portal.view", agentOnly: true },
    ],
  },
  {
    title: "مالی",
    items: [
      { label: "درخواست‌های برداشت", href: "/withdrawals", icon: Wallet, perm: "withdrawal.view" },
      { label: "تراکنش‌های کاربران", href: "/transactions", icon: Wallet, perm: "transactions.view" },
      { label: "درخواست‌های واریز", href: "/deposits", icon: Wallet, perm: "deposit.view" },
    ],
  },
    {
    title: "حسابداری",
    items: [
      { label: "دفتر حساب‌ها", href: "/accounting/chart-of-accounts", icon: BookOpen, perm: "accounting.view" },
      { label: "تراز آزمایشی", href: "/accounting/trial-balance", icon: Scale, perm: "accounting.view" },
    ],
  },
  {
    title: "کاربران",
    items: [
      { label: "لیست کاربران", href: "/users", icon: Users, perm: "users.view" },
      { label: "پروفایل‌های حقوقی", href: "/legal-profiles", icon: Building2, perm: "legal_profile.view" },
      { label: "اعلان‌های کاربران", href: "/notifications", icon: Bell, perm: "notifications.view" },
      { label: "دعوت از دوستان", href: "/referrals", icon: Gift, perm: "referral.view" },
    ],
  },
  {
    title: "فروشگاه",
    items: [
      { label: "محصولات", href: "/shop/products", icon: Package, perm: "shop.manage" },
      { label: "دسته‌بندی‌ها", href: "/shop/categories", icon: FolderTree, perm: "shop.manage" },
      { label: "بسته‌بندی ارسال", href: "/shop/packaging", icon: Box, perm: "shop.manage" },
      { label: "سفارشات فروشگاه", href: "/shop-orders", icon: ShoppingBag, perm: "shop.view" },
      { label: "کدهای تخفیف", href: "/discount-codes", icon: TicketPercent, perm: "discount.view" },
    ],
  },
  {
    title: "عملیات",
    items: [
      { label: "تحویل فیزیکی طلا", href: "/physical-deliveries", icon: Package, perm: "physical_delivery.view" },
      { label: "اصالت‌سنجی هولوگرام", href: "/holograms", icon: ScanLine, perm: "hologram.code.view" },
      { label: "پی‌رول (شارژ دستی)", href: "/payroll", icon: Wallet, perm: "payroll.view" },
    ],
  },
  {
    title: "نمایندگان فروش",
    items: [
      { label: "نمایندگان", href: "/agents", icon: Store, perm: "agent.view" },
      { label: "فروش‌های نمایندگان", href: "/agents/sales", icon: Coins, perm: "agent.view" },
      { label: "تسویه‌های نمایندگان", href: "/agents/settlements", icon: HandCoins, perm: "agent.view" },
      { label: "گزارش عملکرد", href: "/agents/reports", icon: BarChart3, perm: "agent.view" },
    ],
  },
  {
    title: "پشتیبانی",
    items: [
      { label: "تیکت‌ها", href: "/tickets", icon: Headset, perm: "tickets.view" },
      { label: "دسته‌بندی تیکت‌ها", href: "/tickets/categories", icon: Tags, perm: "tickets.manage_categories" },
    ],
  },
  {
    title: "سیستم",
    items: [
      { label: "تنظیمات سیستم", href: "/system-config", icon: Settings2, perm: "system_config.view" },
      { label: "یکپارچه‌سازی‌ها (KYC/فینوتک)", href: "/integrations", icon: Plug, perm: "integrations.view" },
    ],
  },
  {
    title: "مدیریت پنل",
    items: [
      { label: "مدیریت ادمین‌ها", href: "/admins", icon: UserCog, perm: "admin.manage" },
      { label: "نقش‌ها و دسترسی‌ها", href: "/roles", icon: ShieldCheck, perm: "admin.manage" },
      { label: "گزارش فعالیت‌ها", href: "/audit-log", icon: ShieldAlert, perm: "admin.audit_log.view" },
      { label: "امنیت و رمزنگاری", href: "/security", icon: KeyRound, perm: "security.crypto.view" },
    ],
  },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "داشبورد", href: "/", icon: LayoutDashboard, perm: null, hideForAgent: true },
  { label: "برداشت‌ها", href: "/withdrawals", icon: Wallet, perm: "withdrawal.view" },
  { label: "محصولات", href: "/shop/products", icon: Package, perm: "shop.manage" },
  { label: "سفارشات", href: "/shop-orders", icon: ShoppingBag, perm: "shop.view" },
  { label: "نمایندگی", href: "/agent-portal", icon: Store, perm: "agent_portal.view", agentOnly: true },
  { label: "فروش", href: "/agent-portal/sell", icon: ShoppingCart, perm: "agent_portal.sell", agentOnly: true },
  { label: "صورتحساب", href: "/agent-portal/statement", icon: FileSpreadsheet, perm: "agent_portal.view", agentOnly: true },
  { label: "پروفایل", href: "/profile", icon: UserCircle, perm: null },
];

export interface NavViewer {
  permissions: string[];
  agent: unknown | null;
}

/** آیا این آیتم منو برای کاربر فعلی نمایش داده شود؟ */
export function canSeeNavItem(item: NavItem, viewer: NavViewer): boolean {
  const isAgent = !!viewer.agent;
  if (item.agentOnly && !isAgent) return false;
  if (item.hideForAgent && isAgent) return false;
  return !item.perm || viewer.permissions.includes(item.perm);
}

const ALL_HREFS = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));

/** فعال بودن لینک: تطابق دقیق یا طولانی‌ترین پیشوند (برای صفحات جزئیات مثل /agents/[id]) */
export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/" || !pathname.startsWith(`${href}/`)) return false;
  return !ALL_HREFS.some(
    (h) => h !== href && h.length > href.length && (pathname === h || pathname.startsWith(`${h}/`)),
  );
}
