// admin/app/components/MobileHeader.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, LogOut, UserCircle, Loader2 } from "lucide-react";
import type { AdminMe } from "@/app/hooks/useAdminMe";
import { useLogout } from "@/app/hooks/useLogout";

export default function MobileHeader({ onMenuOpen, me }: { onMenuOpen: () => void; me: AdminMe }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { logout, loggingOut } = useLogout();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <header
      className="lg:hidden flex items-center justify-between px-4 py-3.5 sticky top-0 z-30"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <button onClick={onMenuOpen} className="p-1.5 text-white/90" aria-label="باز کردن منو">
        <Menu className="w-6 h-6" />
      </button>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2"
          aria-label="منوی حساب کاربری"
        >
          <span className="text-white! text-[13px] font-bold">{me.fullName}</span>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-black"
            style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" }}
          >
            {me.fullName?.charAt(0) ?? "؟"}
          </div>
        </button>
        {open && (
          <div
            className="absolute left-0 mt-2 w-56 rounded-2xl shadow-lg overflow-hidden"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-[13px] font-black text-gray-900 truncate">{me.fullName}</p>
              <p className="text-[11px] text-gray-400 truncate">
                {me.agent ? `${me.agent.name} (${me.agent.code})` : me.role.name}
              </p>
            </div>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-gray-700 hover:bg-gray-50"
            >
              <UserCircle className="w-4 h-4" /> پروفایل کاربری
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={loggingOut}
              className="w-full flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              خروج از پنل
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
