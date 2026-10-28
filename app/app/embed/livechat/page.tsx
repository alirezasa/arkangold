"use client";
// app/app/embed/livechat/page.tsx
//
// صفحه‌ی جاسازی ویجت چت در سایت‌های دیگر آرکان گلد (arkan.gold با Astro، arkan.gold/mag با وردپرس).
// اسکریپت public/livechat-embed.js این صفحه را در یک iframe شفاف قرار می‌دهد. اجازه‌ی قاب شدن فقط
// برای دامنه‌های LIVECHAT_EMBED_ORIGINS است (CSP frame-ancestors در next.config.ts)، پس پیام‌های
// window.parent همیشه از یکی از همین سایت‌هاست.
import { useCallback, useEffect, useRef, useState } from "react";
import LiveChatWidget, { type HostPage } from "@/app/components/livechat/LiveChatWidget";

type Outgoing = Record<string, unknown>;

function sanitizeHost(d: Record<string, unknown>): HostPage | null {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  try {
    const u = new URL(str(d.url, 1000));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return {
      url: u.href,
      title: str(d.title, 300),
      referrer: str(d.referrer, 1000),
      pathname: u.pathname,
      search: u.search,
    };
  } catch {
    return null;
  }
}

export default function EmbedLivechatPage() {
  const [host, setHost] = useState<HostPage | null>(null);
  const [standalone, setStandalone] = useState(false);
  const parentOrigin = useRef<string | null>(null);
  const pending = useRef<Outgoing | null>(null);
  const openedFromLink = useRef(false);

  const post = useCallback((msg: Outgoing) => {
    if (!parentOrigin.current) {
      pending.current = msg; // تا شناخته شدن صفحه‌ی میزبان آخرین وضعیت نگه داشته می‌شود
      return;
    }
    window.parent.postMessage({ source: "arkan-chat", ...msg }, parentOrigin.current);
  }, []);

  useEffect(() => {
    if (window.parent === window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- فقط وقتی صفحه مستقیم (نه در iframe) باز شود
      setStandalone(true);
      return;
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d.source !== "arkan-chat-host") return;
      parentOrigin.current = e.origin;
      if (pending.current) {
        const msg = pending.current;
        pending.current = null;
        post(msg);
      }
      if (d.type === "host") {
        const h = sanitizeHost(d);
        if (!h) return;
        setHost(h);
        // پیوند پیامک پاسخ کارشناس (?chat=open) روی سایت میزبان هم پنجره را باز می‌کند
        if (!openedFromLink.current && new URLSearchParams(h.search).get("chat") === "open") {
          openedFromLink.current = true;
          window.dispatchEvent(new Event("arkan-livechat:open"));
        }
      } else if (d.type === "open") {
        window.dispatchEvent(new Event("arkan-livechat:open"));
      } else if (d.type === "close") {
        window.dispatchEvent(new Event("arkan-livechat:close"));
      }
    };
    window.addEventListener("message", onMessage);
    // پیام آماده بودن داده‌ای ندارد؛ پاسخ میزبان مبدأ آن را مشخص می‌کند
    window.parent.postMessage({ source: "arkan-chat", type: "ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  return (
    <>
      {/* پس‌زمینه‌ی شفاف تا فقط دکمه/پنجره‌ی چت روی سایت میزبان دیده شود */}
      <style>{`html,body{background:transparent!important;padding:0!important;min-height:0!important;overflow:hidden}.pwa-status-bar{display:none!important}`}</style>
      {standalone ? (
        <p className="p-6 text-center text-sm text-gray-500" dir="rtl">
          این صفحه برای نمایش چت آنلاین داخل سایت‌های آرکان گلد است.
        </p>
      ) : (
        <LiveChatWidget embed={{ host, post }} />
      )}
    </>
  );
}
