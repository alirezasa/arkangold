"use client";
// admin/app/components/livechat/useOperatorSocket.ts
//
// اتصال بلادرنگ میز کار: برای هر بار اتصال (و اتصال مجدد) یک بلیت یک‌بارمصرف کوتاه‌عمر از REST
// پنل گرفته می‌شود؛ توکن نشست ادمین هرگز به مرورگر/سوکت نمی‌رسد.
import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import axios from "axios";

const SOCKET_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN ||
  (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

type Handler = (data: never) => void;

export function useOperatorSocket(handlers: Record<string, Handler>, enabled = true) {
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const socket = io(`${SOCKET_ORIGIN}/livechat`, {
      autoConnect: false,
      reconnectionDelayMax: 15_000,
      auth: (cb) => {
        axios
          .post<{ ticket: string }>("/api/admin/livechat/socket-ticket")
          .then((r) => cb({ ticket: r.data.ticket }))
          .catch(() => cb({ ticket: "" }));
      },
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      setAuthError(null);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("auth:error", (e: { message?: string }) => setAuthError(e?.message ?? "اتصال رد شد"));
    // نشست پنل قفل یا منقضی شد؛ پس از بازگشایی، اتصال دوباره برقرار می‌شود
    socket.on("auth:expired", () => setAuthError("نشست پنل منقضی یا قفل شد"));
    socket.onAny((event: string, data: unknown) => {
      const h = handlersRef.current[event] as ((d: unknown) => void) | undefined;
      h?.(data);
    });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  // پس از قطع به‌علت نشست (قفل عدم فعالیت)، با بازگشت فعالیت کاربر دوباره وصل می‌شود
  useEffect(() => {
    if (!authError) return;
    const retry = () => {
      const s = socketRef.current;
      if (s && !s.connected) s.connect();
    };
    const t = window.setInterval(retry, 20_000);
    window.addEventListener("focus", retry);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", retry);
    };
  }, [authError]);

  const emit = (event: string, data: unknown) => socketRef.current?.emit(event, data);
  return { connected, authError, emit };
}
