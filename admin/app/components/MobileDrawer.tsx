// admin/app/components/MobileDrawer.tsx
"use client";
import { X } from "lucide-react";
import type { AdminMe } from "@/app/hooks/useAdminMe";
import UserMenuCard from "./UserMenuCard";
import NavMenu from "./NavMenu";

export default function MobileDrawer({
  open,
  onClose,
  me,
}: {
  open: boolean;
  onClose: () => void;
  me: AdminMe;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 lg:hidden" dir="rtl">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed top-0 right-0 h-full w-72 max-w-[85vw] flex flex-col"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <h2 className="text-white font-black text-[15px]">منو</h2>
          <button onClick={onClose} className="p-1.5 text-white/90!" aria-label="بستن منو">
            <X className="w-5 h-5" />
          </button>
        </div>
        <NavMenu me={me} onNavigate={onClose} />
        <UserMenuCard me={me} onNavigate={onClose} />
      </div>
    </div>
  );
}
