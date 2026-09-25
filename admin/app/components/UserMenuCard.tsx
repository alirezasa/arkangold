// admin/app/components/UserMenuCard.tsx
"use client";
import Link from "next/link";
import { LogOut, Loader2, UserCircle, Store } from "lucide-react";
import type { AdminMe } from "@/app/hooks/useAdminMe";
import { useLogout } from "@/app/hooks/useLogout";

/** کارت کاربر در پایین منوی کناری/کشویی: پروفایل + خروج */
export default function UserMenuCard({
  me,
  onNavigate,
}: {
  me: AdminMe;
  onNavigate?: () => void;
}) {
  const { logout, loggingOut } = useLogout();

  return (
    <div className="border-t border-white/10 p-3 space-y-2">
      <Link
        href="/profile"
        onClick={onNavigate}
        className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[14px] font-black"
          style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" }}
        >
          {me.fullName?.charAt(0) ?? "؟"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white! text-[12px] font-black truncate">{me.fullName}</p>
          <p className="text-white/50! text-[10px] truncate flex items-center gap-1">
            {me.agent ? <Store className="w-3 h-3 shrink-0" /> : null}
            {me.agent ? `${me.agent.name} (${me.agent.code})` : me.role.name}
          </p>
        </div>
        <UserCircle className="w-4 h-4 text-white/60! shrink-0" />
      </Link>
      <button
        type="button"
        onClick={() => void logout()}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[12px] font-bold bg-white/10 hover:bg-white/15 text-white! disabled:opacity-60"
      >
        {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        خروج از پنل
      </button>
    </div>
  );
}
