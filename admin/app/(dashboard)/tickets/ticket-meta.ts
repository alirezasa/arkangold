// admin/app/(dashboard)/tickets/ticket-meta.ts
// نگاشت‌های رنگ/برچسب/آیکون مشترک بین صفحات لیست و جزئیات تیکت — هماهنگ با پالت
// STATUS_META/PRIORITY_META که در بقیه پنل ادمین (withdrawals، users و ...) استفاده می‌شود.

import {
  CircleDot,
  Clock,
  MessageCircle,
  CheckCircle2,
  Lock,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

export const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string; icon: LucideIcon }
> = {
  OPEN: { label: "باز", bg: "#dbeafe", color: "#2563eb", icon: CircleDot },
  IN_PROGRESS: { label: "در حال بررسی", bg: "#fef3c7", color: "#b45309", icon: Clock },
  WAITING_FOR_USER: { label: "منتظر کاربر", bg: "#ede9fe", color: "#7c3aed", icon: MessageCircle },
  RESOLVED: { label: "حل شده", bg: "#dcfce7", color: "#16a34a", icon: CheckCircle2 },
  CLOSED: { label: "بسته", bg: "#f3f4f6", color: "#6b7280", icon: Lock },
  REOPENED: { label: "بازگشایی‌شده", bg: "#fee2e2", color: "#dc2626", icon: RotateCcw },
};

export const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW: { label: "کم", color: "#6b7280" },
  NORMAL: { label: "عادی", color: "#2563eb" },
  HIGH: { label: "بالا", color: "#b45309" },
  URGENT: { label: "فوری", color: "#dc2626" },
};

// گذارهای مجاز — باید با TICKET_STATUS_TRANSITIONS در packages/shared هماهنگ بماند
export const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "OPEN"],
  WAITING_FOR_USER: ["IN_PROGRESS", "OPEN"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "OPEN"],
};
