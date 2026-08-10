import type {
  StatCard,
  Transaction,
  GoldHolding,
  ChartBar,
  NavItem,
  GoldPrice,
} from "@/app/utils/types";

export const GOLD_PRICES: GoldPrice[] = [
  { type: "۱۸ عیار", price: 3210000, change: 1.1 },
  { type: "۲۴ عیار", price: 4280000, change: 1.2 },
  { type: "آب‌شده", price: 4150000, change: 1.0 },
];

export const STAT_CARDS: StatCard[] = [
  {
    label: "موجودی طلا (گرم)",
    value: "۱۲.۵۴",
    subLabel: "این ماه",
    change: "↑ ۰.۳۲ گرم",
    changeType: "up",
    variant: "gold",
    icon: "ti-coins",
  },
  {
    label: "ارزش کل دارایی",
    value: "۵۳.۷م",
    subLabel: "هفته جاری",
    change: "↑ ۴.۲٪",
    changeType: "up",
    variant: "green",
    icon: "ti-trending-up",
  },
  {
    label: "موجودی نقدی",
    value: "۱۲.۳م",
    subLabel: "واریز انتظار",
    change: "↓ ۲.۱م",
    changeType: "down",
    variant: "blue",
    icon: "ti-wallet",
  },
  {
    label: "سود / زیان کل",
    value: "+۸.۴م",
    subLabel: "از خرید",
    change: "↑ ۱۸.۶٪",
    changeType: "up",
    variant: "red",
    icon: "ti-chart-bar",
  },
];

export const TRANSACTIONS: Transaction[] = [
  {
    id: "1",
    type: "buy",
    title: "خرید طلا",
    date: "۱۴۰۴/۰۳/۰۵",
    time: "۱۴:۳۲",
    amount: "+۲.۵ گرم",
    amountType: "plus",
    value: "۱۰,۷۰۰,۰۰۰ ت",
  },
  {
    id: "2",
    type: "sell",
    title: "فروش طلا",
    date: "۱۴۰۴/۰۳/۰۳",
    time: "۱۰:۱۵",
    amount: "-۱.۰ گرم",
    amountType: "minus",
    value: "۴,۲۸۰,۰۰۰ ت",
  },
  {
    id: "3",
    type: "transfer",
    title: "واریز کیف پول",
    date: "۱۴۰۴/۰۳/۰۱",
    time: "۰۹:۰۰",
    amount: "+۵,۰۰۰,۰۰۰ ت",
    amountType: "plus",
    value: "کارت بانکی",
  },
  {
    id: "4",
    type: "buy",
    title: "خرید طلا",
    date: "۱۴۰۴/۰۲/۲۸",
    time: "۱۱:۴۵",
    amount: "+۱.۰ گرم",
    amountType: "plus",
    value: "۴,۱۵۰,۰۰۰ ت",
  },
];

export const GOLD_HOLDINGS: GoldHolding[] = [
  { label: "طلا ۱۸ عیار", emoji: "🥇", amount: "۸.۳۲ گرم" },
  { label: "طلا ۲۴ عیار", emoji: "⭐", amount: "۴.۲۲ گرم" },
];

export const CHART_DATA: ChartBar[] = [
  { day: "شنبه", value: 68, prevValue: 55 },
  { day: "یکشنبه", value: 74, prevValue: 62 },
  { day: "دوشنبه", value: 60, prevValue: 70 },
  { day: "سه شنبه", value: 82, prevValue: 58 },
  { day: "چهار شنبه", value: 79, prevValue: 72 },
  { day: "پنج شنبه", value: 91, prevValue: 65 },
  { day: "جمعه", value: 85, prevValue: 76 },
];

export const SIDEBAR_NAV: NavItem[] = [
  { name: "پیشخوان", icon: "ti-layout-dashboard", path: "/dashboard" },
  { name: "احراز هویت", icon: "ti-shield-check", path: "/dashboard/identity" },
  { name: "پروفایل", icon: "ti-user", path: "/dashboard/me" },
  { name: "کیف پول", icon: "ti-wallet", path: "/dashboard/wallet" },
  
  {
    name: "تراکنش‌ها",
    icon: "ti-history",
    path: "/dashboard/transactions",
    badge: 3,
  },
  {
    name: "سفارش‌های فروشگاه",
    icon: "ti-receipt",
    path: "/dashboard/shop/orders",
  }, // ← جدید
  {
    name: "تحویل فیزیکی طلا",
    icon: "ti-package",
    path: "/dashboard/wallet/physical-delivery",
  }, // ← جدید
  { name: "نمودار قیمت", icon: "ti-chart-candle", path: "/dashboard/chart" },
  { name: "محاسبه‌گر", icon: "ti-calculator", path: "/dashboard/calculator" },
  {
    name: "گواهی سرمایه",
    icon: "ti-certificate",
    path: "/dashboard/certificate",
  },
];
export const SIDEBAR_ACCOUNT_NAV: NavItem[] = [
  { name: "تنظیمات", icon: "ti-settings", path: "/dashboard/settings" },
  { name: "پشتیبانی", icon: "ti-help-circle", path: "/dashboard/support" },
];

export const BOTTOM_NAV: NavItem[] = [
  { name: "پیشخوان", icon: "ti-layout-dashboard", path: "/dashboard" },
  { name: "کیف پول", icon: "ti-wallet", path: "/dashboard/wallet" },
  { name: "خرید/فروش", icon: "ti-plus", path: "/dashboard/trade" },
  {
    name: "تراکنش‌ها",
    icon: "ti-history",
    path: "/dashboard/transactions",
    badge: 3,
  },
  { name: "پروفایل", icon: "ti-user", path: "/dashboard/profile" },
];
