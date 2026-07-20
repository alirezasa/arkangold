// admin/app/components/OfflineBanner.tsx
"use client";
import { usePWA } from "@/app/hooks/usePWA";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
  const { isOffline } = usePWA();
  if (!isOffline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-9999 flex items-center justify-center gap-2 py-2 px-4 text-[12px] font-bold text-white"
      style={{ background: "#dc2626" }}
    >
      <WifiOff className="w-4 h-4" />
      اتصال اینترنت قطع است
    </div>
  );
}