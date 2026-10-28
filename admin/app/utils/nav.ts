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
  Vault,
  ClipboardList,
  Landmark,
  Handshake,
  ReceiptText,
  FileText,
  CalendarRange,
  ShieldCheck as ShieldCheck2,
  LineChart,
  Warehouse,
  MessageSquareText,
  Truck,
  FileSignature,
  CreditCard,
  Printer,
  Siren,
  SearchCheck,
  LayoutGrid,
  MapPinned,
  Eye,
  MessagesSquare,
  Bot,
  BrainCircuit,
  Zap,
  Megaphone,
  SlidersHorizontal,
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
  icon: typeof LayoutDashboard;
  items: NavItem[];
  /** آیتم‌ها همیشه باز و بدون سرتیتر نمایش داده شوند (مثل داشبورد) */
  flat?: boolean;
}

// بخش‌ها بر اساس موضوع کار گروه‌بندی شده‌اند تا آیتم‌های مرتبط کنار هم باشند؛
// در منوی کناری هر بخش جمع است و با کلیک روی عنوانش زیربخش‌ها باز می‌شوند.
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "کلی",
    icon: LayoutDashboard,
    flat: true,
    items: [
      { label: "داشبورد", href: "/", icon: LayoutDashboard, perm: null, hideForAgent: true },
      { label: "دسترسی سریع", href: "/modules", icon: LayoutGrid, perm: null, hideForAgent: true },
    ],
  },
  {
    title: "پرتال نماینده",
    icon: Store,
    flat: true,
    items: [
      { label: "داشبورد نمایندگی", href: "/agent-portal", icon: Store, perm: "agent_portal.view", agentOnly: true },
    ],
  },
  {
    title: "خرید و فروش شمش",
    icon: ShoppingBag,
    items: [
      { label: "خرید شمش از شرکت", href: "/agent-portal/purchase", icon: ShoppingBag, perm: "agent_portal.view", agentOnly: true },
      { label: "ثبت فروش و اصالت", href: "/agent-portal/sell", icon: ShoppingCart, perm: "agent_portal.sell", agentOnly: true },
      { label: "فروش شمش به شرکت", href: "/agent-portal/buyback", icon: HandCoins, perm: "agent_portal.view", agentOnly: true },
      { label: "فروش‌های من", href: "/agent-portal/sales", icon: Receipt, perm: "agent_portal.view", agentOnly: true },
      { label: "موجودی شمش", href: "/agent-portal/inventory", icon: Boxes, perm: "agent_portal.view", agentOnly: true },
      { label: "استعلام شمش", href: "/agent-portal/inquiry", icon: SearchCheck, perm: "agent_portal.view", agentOnly: true },
    ],
  },
  {
    title: "مالی نمایندگی",
    icon: Wallet,
    items: [
      { label: "کیف پول و حساب بانکی", href: "/agent-portal/wallet", icon: Wallet, perm: "agent_portal.view", agentOnly: true },
      { label: "صورتحساب‌های شرکت", href: "/agent-portal/invoices", icon: ReceiptText, perm: "agent_portal.view", agentOnly: true },
      { label: "تسویه بدهی", href: "/agent-portal/settlements", icon: Coins, perm: "agent_portal.view", agentOnly: true },
      { label: "صورتحساب (معین)", href: "/agent-portal/statement", icon: FileSpreadsheet, perm: "agent_portal.view", agentOnly: true },
      { label: "قراردادها", href: "/agent-portal/contracts", icon: FileSignature, perm: "agent_portal.view", agentOnly: true },
    ],
  },
  {
    title: "کاربران",
    icon: Users,
    items: [
      { label: "لیست کاربران", href: "/users", icon: Users, perm: "users.view" },
      { label: "پروفایل‌های حقوقی", href: "/legal-profiles", icon: Building2, perm: "legal_profile.view" },
      { label: "کارت‌های بانکی کاربران", href: "/bank-accounts", icon: CreditCard, perm: "bank_account.view" },
      { label: "دعوت از دوستان", href: "/referrals", icon: Gift, perm: "referral.view" },
    ],
  },
  {
    title: "واریز و برداشت",
    icon: Wallet,
    items: [
      { label: "درخواست‌های واریز", href: "/deposits", icon: Wallet, perm: "deposit.view" },
      { label: "درخواست‌های برداشت", href: "/withdrawals", icon: Wallet, perm: "withdrawal.view" },
      { label: "تراکنش‌های کاربران", href: "/transactions", icon: Wallet, perm: "transactions.view" },
      { label: "پی‌رول (شارژ دستی)", href: "/payroll", icon: Wallet, perm: "payroll.view" },
      { label: "گزارش واریز و برداشت", href: "/finance-report", icon: BarChart3, perm: "withdrawal.view" },
    ],
  },
  {
    title: "حسابداری",
    icon: BookOpen,
    items: [
      { label: "داشبورد مالی", href: "/accounting", icon: LineChart, perm: "accounting.view" },
      { label: "سرفصل حساب‌ها", href: "/accounting/chart-of-accounts", icon: BookOpen, perm: "accounting.view" },
      { label: "دفتر روزنامه", href: "/accounting/journal", icon: FileText, perm: "accounting.view" },
      { label: "اسناد دستی و هزینه‌ها", href: "/accounting/vouchers", icon: FileText, perm: "accounting.view" },
      { label: "تراز آزمایشی", href: "/accounting/trial-balance", icon: Scale, perm: "accounting.view" },
      { label: "صورت‌های مالی", href: "/accounting/reports", icon: BarChart3, perm: "accounting.view" },
      { label: "مغایرت‌گیری", href: "/accounting/reconciliation", icon: ShieldCheck2, perm: "accounting.view" },
      { label: "مغایرت‌گیری بانکی", href: "/accounting/bank-reconciliation", icon: Landmark, perm: "accounting.view" },
      { label: "سال مالی و قفل دوره", href: "/accounting/fiscal-years", icon: CalendarRange, perm: "accounting.view" },
    ],
  },
  {
    title: "خزانه و موجودی شمش",
    icon: Vault,
    items: [
      { label: "پوشش و خرید طلا", href: "/treasury", icon: Vault, perm: "treasury.view" },
      { label: "سفارش‌های خزانه", href: "/treasury/orders", icon: ClipboardList, perm: "treasury.view" },
      { label: "تأمین‌کنندگان", href: "/treasury/suppliers", icon: Landmark, perm: "treasury.view" },
      { label: "شمارش خزانه", href: "/treasury/vault-counts", icon: Scale, perm: "treasury.view" },
      { label: "موجودی شمش", href: "/inventory/bullion", icon: Warehouse, perm: "inventory.view" },
      { label: "بازخرید شمش از کاربران", href: "/buyback", icon: HandCoins, perm: "buyback.view" },
    ],
  },
  {
    title: "اصالت‌سنجی شمش",
    icon: ScanLine,
    items: [
      { label: "اصالت‌سنجی هولوگرام", href: "/holograms", icon: ScanLine, perm: "hologram.code.view" },
      { label: "گزارش سرقت و مفقودی شمش", href: "/holograms/incidents", icon: Siren, perm: "hologram.incident.view" },
    ],
  },
  {
    title: "فروشگاه",
    icon: Package,
    items: [
      { label: "محصولات", href: "/shop/products", icon: Package, perm: "shop.manage" },
      { label: "دسته‌بندی‌ها", href: "/shop/categories", icon: FolderTree, perm: "shop.manage" },
      { label: "بسته‌بندی ارسال", href: "/shop/packaging", icon: Box, perm: "shop.manage" },
      { label: "کدهای تخفیف", href: "/discount-codes", icon: TicketPercent, perm: "discount.view" },
    ],
  },
  {
    title: "سفارش‌ها و ارسال",
    icon: Truck,
    items: [
      { label: "سفارشات فروشگاه", href: "/shop-orders", icon: ShoppingBag, perm: "shop.view" },
      { label: "تحویل فیزیکی طلا", href: "/physical-deliveries", icon: Package, perm: "physical_delivery.view" },
      { label: "مراجع ارسال", href: "/shop/shipping-methods", icon: Truck, perm: "shop.view" },
      { label: "مناطق و تعرفه‌های ارسال", href: "/shop/shipping-zones", icon: MapPinned, perm: "shop.view" },
      { label: "برچسب و لیبل پرینتر", href: "/shop/labels", icon: Printer, perm: "shop.label.manage" },
    ],
  },
  {
    title: "نمایندگان فروش",
    icon: Store,
    items: [
      { label: "نمایندگان", href: "/agents", icon: Store, perm: "agent.view" },
      { label: "کارتابل خرید و فروش نمایندگان", href: "/agents/trading", icon: ClipboardList, perm: "agent.view" },
      { label: "فروش‌های نمایندگان", href: "/agents/sales", icon: Coins, perm: "agent.view" },
      { label: "تسویه‌های نمایندگان", href: "/agents/settlements", icon: HandCoins, perm: "agent.view" },
      { label: "قراردادهای نمایندگان", href: "/agents/contracts", icon: FileSignature, perm: "agent.view" },
      { label: "گزارش عملکرد", href: "/agents/reports", icon: BarChart3, perm: "agent.view" },
    ],
  },
  {
    title: "شرکای فروش (اقساطی)",
    icon: Handshake,
    items: [
      { label: "شرکا", href: "/partners", icon: Handshake, perm: "partner.view" },
      { label: "سفارش‌ها و قراردادها", href: "/partners/orders", icon: ReceiptText, perm: "partner.view" },
      { label: "تسویه‌ها", href: "/partners/settlements", icon: HandCoins, perm: "partner.view" },
      { label: "گزارش و مطالبات", href: "/partners/report", icon: BarChart3, perm: "partner.view" },
    ],
  },
  {
    title: "چت آنلاین",
    icon: MessagesSquare,
    items: [
      { label: "میز کار چت", href: "/livechat", icon: MessagesSquare, perm: "livechat.view" },
      { label: "پاسخ‌های سریع", href: "/livechat/canned", icon: Zap, perm: "livechat.view" },
      { label: "منوی ربات و پاسخ‌های آماده", href: "/livechat/bot", icon: Bot, perm: "livechat.manage" },
      { label: "پایگاه دانش (حالت هوشمند)", href: "/livechat/knowledge", icon: BrainCircuit, perm: "livechat.manage" },
      { label: "کارشناسان و دپارتمان‌ها", href: "/livechat/team", icon: Users, perm: "livechat.manage" },
      { label: "پیام‌های خودکار", href: "/livechat/triggers", icon: Megaphone, perm: "livechat.manage" },
      { label: "گزارش‌های چت", href: "/livechat/reports", icon: BarChart3, perm: "livechat.reports" },
      { label: "تنظیمات چت", href: "/livechat/settings", icon: SlidersHorizontal, perm: "livechat.manage" },
    ],
  },
  {
    title: "پشتیبانی و اطلاع‌رسانی",
    icon: Headset,
    items: [
      { label: "تیکت‌ها", href: "/tickets", icon: Headset, perm: "tickets.view" },
      { label: "دسته‌بندی تیکت‌ها", href: "/tickets/categories", icon: Tags, perm: "tickets.manage_categories" },
      { label: "اعلان‌های کاربران", href: "/notifications", icon: Bell, perm: "notifications.view" },
      { label: "مرکز پیامک", href: "/sms", icon: MessageSquareText, perm: "sms.view" },
    ],
  },
  {
    title: "تنظیمات و اتصالات",
    icon: Settings2,
    items: [
      { label: "تنظیمات سیستم", href: "/system-config", icon: Settings2, perm: "system_config.view" },
      { label: "یکپارچه‌سازی‌ها (KYC/فینوتک)", href: "/integrations", icon: Plug, perm: "integrations.view" },
      { label: "سامانه ناظر طلا (زر پایش)", href: "/zarpayesh", icon: Eye, perm: "zarpayesh.view" },
    ],
  },
  {
    title: "مدیریت پنل و امنیت",
    icon: ShieldCheck,
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
  { label: "دسترسی سریع", href: "/modules", icon: LayoutGrid, perm: null, hideForAgent: true },
  { label: "برداشت‌ها", href: "/withdrawals", icon: Wallet, perm: "withdrawal.view" },
  { label: "سفارشات", href: "/shop-orders", icon: ShoppingBag, perm: "shop.view" },
  { label: "نمایندگی", href: "/agent-portal", icon: Store, perm: "agent_portal.view", agentOnly: true },
  { label: "خرید", href: "/agent-portal/purchase", icon: ShoppingBag, perm: "agent_portal.view", agentOnly: true },
  { label: "فروش", href: "/agent-portal/sell", icon: ShoppingCart, perm: "agent_portal.sell", agentOnly: true },
  { label: "کیف پول", href: "/agent-portal/wallet", icon: Wallet, perm: "agent_portal.view", agentOnly: true },
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

/**
 * دسترسی لازم برای باز کردن یک مسیر: آیتم منو با طولانی‌ترین پیشوند منطبق (صفحات جزئیات مثل
 * /deposits/[id] همان دسترسی فهرست را می‌خواهند). مسیرِ بیرون از منو (مثل /profile) آزاد است.
 */
export function navItemForPath(pathname: string): NavItem | null {
  let best: NavItem | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const match =
        item.href === "/"
          ? pathname === "/"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (match && (!best || item.href.length > best.href.length)) best = item;
    }
  }
  return best;
}

/** آیا ادمین فعلی اجازه‌ی باز کردن این مسیر را دارد؟ (کنترل قطعی در API است) */
export function canOpenPath(pathname: string, viewer: NavViewer): boolean {
  const item = navItemForPath(pathname);
  return !item || canSeeNavItem(item, viewer);
}

/** بررسی یک دسترسی برای نمایش/پنهان کردن دکمه‌های عملیاتی */
export function hasPermission(viewer: Pick<NavViewer, "permissions"> | null | undefined, perm: string): boolean {
  return !!viewer?.permissions.includes(perm);
}
