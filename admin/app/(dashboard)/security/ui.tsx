// admin/app/(dashboard)/security/ui.tsx
// اجزای مشترک صفحه‌ی «امنیت» (بخش‌های رمزنگاری و احراز هویت)
"use client";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import axios from "axios";

export const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export const fa = (n: number) => n.toLocaleString("fa-IR");

export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message || fallback;
  return fallback;
}

/** شناسه‌ی فنی (نام الگوریتم، متغیر، kid) — فونت پنل ارقام را فارسی می‌کند؛ این‌ها باید لاتین بمانند */
export function Tech({ children }: { children: React.ReactNode }) {
  return (
    <bdi dir="ltr" className="font-mono text-[0.92em]">
      {children}
    </bdi>
  );
}

export function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span className="badge" style={{ background: bg, color }}>
      {children}
    </span>
  );
}

export const OK = { bg: "var(--color-emerald-light)", color: "var(--color-emerald)" };
export const WARN = { bg: "#fef3c7", color: "#b45309" };
export const BAD = { bg: "#fee2e2", color: "#dc2626" };

export function Card({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 min-w-0">
          <Icon className="w-5 h-5 mt-0.5 text-gray-700 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-black text-[14px] text-gray-900">{title}</h2>
            {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone: "ok" | "warn" | "bad" }) {
  const t = tone === "ok" ? OK : tone === "warn" ? WARN : BAD;
  return (
    <div
      className="rounded-2xl p-3"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className="font-black text-[15px]" style={{ color: t.color }}>
        {value}
      </p>
    </div>
  );
}

export function ActionButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

