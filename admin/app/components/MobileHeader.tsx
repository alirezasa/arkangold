// admin/app/components/MobileHeader.tsx
"use client";
import { Menu, ShieldCheck } from "lucide-react";

export default function MobileHeader({ onMenuOpen, fullName }: { onMenuOpen: () => void; fullName?: string }) {
  return (
    <header
      className="lg:hidden flex items-center justify-between px-4 py-3.5 sticky top-0 z-30"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <button onClick={onMenuOpen} className="p-1.5 text-white/90" aria-label="باز کردن منو">
        <Menu className="w-6 h-6" />
      </button>
      <div className="flex items-center gap-2">
        <span className="text-white! text-[13px] font-bold">{fullName ?? "پنل مدیریت"}</span>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "var(--color-gold-500)" }}
        >
          <ShieldCheck className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
        </div>
      </div>
    </header>
  );
}