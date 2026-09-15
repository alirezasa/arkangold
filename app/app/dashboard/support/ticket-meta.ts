// app/app/dashboard/support/ticket-meta.ts
// نگاشت رنگ/آیکون/برچسب مشترک بین صفحات لیست، جزئیات و ثبت تیکت — هماهنگ با
// الگوی CATEGORY_STYLE/StatusBadge در app/dashboard/transactions/page.tsx.

import {
  CircleDot,
  Clock,
  MessageCircle,
  CheckCircle2,
  Lock,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  bg: string; // پس‌زمینه دایره آیکون
  color: string; // رنگ آیکون / متن
  badgeClass: string; // کلاس بج Tailwind (bg/text/border روشن)
}

export const STATUS_META: Record<string, StatusMeta> = {
  OPEN: {
    label: "باز",
    icon: CircleDot,
    bg: "#dbeafe",
    color: "#2563eb",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  IN_PROGRESS: {
    label: "در حال بررسی",
    icon: Clock,
    bg: "#fef3c7",
    color: "#b45309",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  WAITING_FOR_USER: {
    label: "در انتظار پاسخ شما",
    icon: MessageCircle,
    bg: "#ede9fe",
    color: "#7c3aed",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  RESOLVED: {
    label: "حل شده",
    icon: CheckCircle2,
    bg: "#dcfce7",
    color: "#16a34a",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
  },
  CLOSED: {
    label: "بسته شده",
    icon: Lock,
    bg: "#f3f4f6",
    color: "#6b7280",
    badgeClass: "bg-gray-100 text-gray-500 border-gray-200",
  },
  REOPENED: {
    label: "بازگشایی شده",
    icon: RotateCcw,
    bg: "#fee2e2",
    color: "#dc2626",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
};

export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW: { label: "کم", color: "#6b7280" },
  NORMAL: { label: "عادی", color: "#2563eb" },
  HIGH: { label: "بالا", color: "#b45309" },
  URGENT: { label: "فوری", color: "#dc2626" },
};
