// app/app/dashboard/components/documents/document.utils.tsx
import React from "react";

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function fa(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA[Number(d)]);
}

export function faGrouped(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return fa(String(value));
  return fa(Math.round(n).toLocaleString("en-US"));
}

/** ریال → تومان، فقط برای نمایش کمکی در پرانتز */
export function rialToToman(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return faGrouped(Math.round(n / 10));
}

/**
 * هر مقدار عددی/لاتین باید داخل این بپیچد.
 *
 * ایراد شماره ۶ نمونه پیوستی: شبا به‌صورت «۹۱۰۷…۵۸۶۴IR» رندر شده بود
 * چون موتور Bidi پیشوند IR را به انتهای رشته برد. isolate این را حل می‌کند.
 */
export function Num({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <bdi
      dir="ltr"
      className={className}
      style={{ unicodeBidi: "isolate", display: "inline-block" }}
    >
      {children}
    </bdi>
  );
}

/** IR91 0780 7201 1081 0707 0758 64 — گروه‌بندی چهارتایی برای خوانایی */
export function formatSheba(sheba: string): string {
  const clean = sheba.replace(/\s/g, "").toUpperCase();
  const prefix = clean.startsWith("IR") ? "IR" : "";
  const digits = clean.replace(/^IR/, "");
  return `${prefix}${digits.replace(/(.{4})/g, "$1 ").trim()}`;
}

/** ۱۰۲۳ ۰۰۰۴ ۵۱۰۰ ۰۱۲۷ — چهارتایی، برای کاهش خطای تایپ در فرم بانک */
export function formatTrackingId(id: string): string {
  return fa(id.replace(/(.{4})/g, "$1 ").trim());
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
