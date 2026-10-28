"use client";
// admin/app/components/livechat/LivechatAlert.tsx
// اعلان چت آنلاین در سایر صفحات پنل: گفتگوی جدید در صف، پیام آفلاین یا پیام خوانده‌نشده در
// گفتگوهای خود کارشناس ← دکمه‌ی شناور با شمارنده و صدای اعلان (در خود میز کار نمایش داده نمی‌شود)
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { MessagesSquare } from "lucide-react";
import { playChatSound, unlockChatSound } from "./sound";
import type { Counts } from "./types";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);
const SOUND_KEY = "arkan-admin-livechat-sound";

export default function LivechatAlert() {
  const pathname = usePathname() ?? "";
  const onConsole = pathname === "/livechat";
  const { data } = useSWR<Counts>(onConsole ? null : "/api/admin/livechat/counts", fetcher, {
    refreshInterval: 20_000,
    shouldRetryOnError: false,
  });
  const prev = useRef<number | null>(null);
  const total = (data?.queue ?? 0) + (data?.offline ?? 0) + (data?.unreadMine ?? 0);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockChatSound, { once: true });
    return () => window.removeEventListener("pointerdown", unlockChatSound);
  }, []);

  useEffect(() => {
    if (!data) return;
    let soundOn = true;
    try {
      soundOn = window.localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      // ignore
    }
    if (prev.current !== null && total > prev.current && soundOn) playChatSound("queue");
    prev.current = total;
  }, [data, total]);

  if (onConsole || !data || total === 0) return null;
  return (
    <Link
      href="/livechat"
      className="fixed bottom-24 left-4 z-40 flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-black text-white shadow-xl lg:bottom-6"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <MessagesSquare className="h-4.5 w-4.5" />
      چت آنلاین
      <span className="rounded-full bg-red-500 px-2 text-[11px]">{total.toLocaleString("fa-IR")}</span>
    </Link>
  );
}
