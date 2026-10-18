"use client";
// قفل نشست پس از عدم فعالیت: اگر کاربر به مدت session.admin.timeout_minutes با پنل کار نکند
// (کلیک، تایپ، اسکرول)، صفحه قفل و رمز عبور خواسته می‌شود؛ رمز نادرست = خروج کامل.
// کنترل قطعی در API است (پاسخ 401 با کد SESSION_LOCKED)؛ این مؤلفه فعالیت واقعی را به سرور
// گزارش می‌کند (حداکثر هر ۳۰ ثانیه) تا درخواست‌های خودکار پس‌زمینه نشست را باز نگه ندارند.
// فعالیت بین تب‌ها از طریق localStorage مشترک است.
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useSWRConfig } from "swr";
import { Loader2, Lock, LogOut } from "lucide-react";
import { SESSION_LOCKED_EVENT } from "@/app/core/api";
import { logoutAndWipe } from "@/app/utils/session-cleanup";

const LAST_ACTIVITY_KEY = "arkan-admin-last-activity";
const PING_EVERY_MS = 30_000;
const CHECK_EVERY_MS = 5_000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeShared(t: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(t));
  } catch {
    // حالت خصوصی و ...
  }
}

const isLockedError = (e: unknown) =>
  axios.isAxiosError(e) &&
  e.response?.status === 401 &&
  (e.response.data as { code?: string } | undefined)?.code === "SESSION_LOCKED";

export default function IdleLock({
  idleTimeoutSeconds,
  initiallyLocked = false,
  displayName,
  onUnlocked,
}: {
  idleTimeoutSeconds: number;
  initiallyLocked?: boolean;
  displayName?: string;
  onUnlocked?: () => void;
}) {
  const { mutate } = useSWRConfig();
  const [locked, setLocked] = useState(initiallyLocked);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastActivity = useRef(0);
  const lastPing = useRef(0);
  const lockedRef = useRef(initiallyLocked);

  const lock = useCallback(() => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
    setPassword("");
    setError(null);
  }, []);

  // ثبت فعالیت واقعی کاربر
  useEffect(() => {
    const now = Date.now();
    lastActivity.current = Math.max(readShared(), now);
    writeShared(lastActivity.current);
    let lastWrite = now;
    const onActivity = () => {
      if (lockedRef.current) return;
      const t = Date.now();
      lastActivity.current = t;
      if (t - lastWrite > 5_000) {
        lastWrite = t;
        writeShared(t);
      }
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
  }, []);

  // پاسخ قفل از هر درخواست (adminApi رویداد می‌فرستد؛ axios پیش‌فرض با interceptor)
  useEffect(() => {
    window.addEventListener(SESSION_LOCKED_EVENT, lock);
    const id = axios.interceptors.response.use(undefined, (err: unknown) => {
      if (isLockedError(err)) lock();
      return Promise.reject(err);
    });
    return () => {
      window.removeEventListener(SESSION_LOCKED_EVENT, lock);
      axios.interceptors.response.eject(id);
    };
  }, [lock]);

  // گزارش فعالیت به سرور و بررسی زمان عدم فعالیت
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (lockedRef.current) return;
      const now = Date.now();
      const last = Math.max(lastActivity.current, readShared());
      if (now - last >= idleTimeoutSeconds * 1000) {
        lock();
        return;
      }
      if (last > lastPing.current && now - lastPing.current >= PING_EVERY_MS) {
        lastPing.current = now;
        writeShared(last);
        void axios.post("/api/admin-auth/session/ping").catch(() => undefined);
      }
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [idleTimeoutSeconds, lock]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return setError("رمز عبور را وارد کنید");
    setBusy(true);
    setError(null);
    try {
      await axios.post("/api/admin-auth/session/unlock", { password });
      const t = Date.now();
      lastActivity.current = t;
      lastPing.current = t;
      writeShared(t);
      lockedRef.current = false;
      setLocked(false);
      setPassword("");
      // داده‌هایی که در زمان قفل دریافت نشدند دوباره خوانده می‌شوند
      void mutate(() => true);
      onUnlocked?.();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        // رمز نادرست → نشست در سرور باطل شد؛ خروج کامل
        await logoutAndWipe("/api/admin-auth/logout");
        return;
      }
      const m = axios.isAxiosError(err) ? err.response?.data?.message : null;
      setError(m || "بررسی رمز عبور ناموفق بود؛ دوباره تلاش کنید");
    } finally {
      setBusy(false);
    }
  };

  if (!locked) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-xl"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
    >
      <form
        onSubmit={unlock}
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl"
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Lock className="h-7 w-7" style={{ color: "var(--color-gold-500)" }} />
        </div>
        <h2 id="idle-lock-title" className="text-[16px] font-black text-gray-900">
          نشست قفل شد
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
          {displayName ? `${displayName}، ` : ""}به دلیل{" "}
          {Math.round(idleTimeoutSeconds / 60).toLocaleString("fa-IR")} دقیقه عدم فعالیت، برای ادامه
          رمز عبور خود را وارد کنید. ورود رمز نادرست باعث خروج از پنل می‌شود.
        </p>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          dir="ltr"
          maxLength={256}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          placeholder="رمز عبور"
          aria-label="رمز عبور"
          className="mt-5 w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-[14px] outline-none focus:border-gold-500"
        />
        {error && <p className="mt-2 text-[12px] font-bold text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ادامه"}
        </button>
        <button
          type="button"
          onClick={() => void logoutAndWipe("/api/admin-auth/logout")}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-gray-500 hover:text-gray-800"
        >
          <LogOut className="h-4 w-4" />
          خروج از پنل
        </button>
      </form>
    </div>
  );
}
