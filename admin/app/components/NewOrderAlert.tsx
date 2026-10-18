"use client";
// اعلان صوتی سفارش جدید فروشگاه: هر ۲۰ ثانیه خلاصه‌ی سفارش‌ها خوانده می‌شود و با ثبت سفارش
// پرداخت‌شده‌ی جدید، صدای اعلان پخش و کارت اعلان نمایش داده می‌شود. صدا با Web Audio ساخته
// می‌شود (بدون فایل) و پس از اولین تعامل کاربر با صفحه فعال می‌شود (سیاست autoplay مرورگرها).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import { BellRing, Volume2, VolumeX, X } from "lucide-react";

interface AlertSummary {
  pendingCount: number;
  latest: { id: string; orderNumber: string | null; paidAt: string } | null;
}

const SEEN_KEY = "arkan-admin-last-order-paid-at";
const SOUND_KEY = "arkan-admin-order-sound";
const POLL_MS = 20_000;

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

function readLS(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // حالت خصوصی و ...
  }
}

export default function NewOrderAlert() {
  // این مؤلفه فقط پس از بارگذاری سمت کلاینت (پس از دریافت مشخصات ادمین) رندر می‌شود
  const [soundOn, setSoundOn] = useState(() => readLS(SOUND_KEY) !== "off");
  const [toast, setToast] = useState<AlertSummary["latest"]>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(soundOn);

  useEffect(() => {
    // AudioContext فقط پس از تعامل کاربر اجازه‌ی پخش دارد
    const unlock = () => {
      if (!audioRef.current) {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) audioRef.current = new Ctx();
      }
      void audioRef.current?.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const chime = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx) return;
    void ctx.resume();
    const now = ctx.currentTime;
    // دو نت کوتاه (می ← سی) با حجم ملایم
    [
      { f: 659.25, t: 0 },
      { f: 987.77, t: 0.18 },
      { f: 659.25, t: 0.5 },
      { f: 987.77, t: 0.68 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.32);
    });
  }, []);

  const { data } = useSWR<AlertSummary>("/api/admin/shop-orders/alerts/summary", fetcher, {
    refreshInterval: POLL_MS,
    refreshWhenHidden: true,
    revalidateOnFocus: true,
    shouldRetryOnError: false,
    onSuccess: (summary) => {
      const latest = summary.latest;
      if (!latest) return;
      const seen = readLS(SEEN_KEY);
      writeLS(SEEN_KEY, latest.paidAt);
      // بار اول فقط مبنا ثبت می‌شود؛ صدا فقط برای سفارش‌هایی که بعد از آن پرداخت شوند
      if (!seen || new Date(latest.paidAt) <= new Date(seen)) return;
      setToast(latest);
      if (soundOnRef.current) chime();
    },
  });

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundOnRef.current = next;
    writeLS(SOUND_KEY, next ? "on" : "off");
    if (next) chime();
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleSound}
        title={soundOn ? "صدای اعلان سفارش: روشن" : "صدای اعلان سفارش: خاموش"}
        aria-label={soundOn ? "خاموش کردن صدای اعلان سفارش" : "روشن کردن صدای اعلان سفارش"}
        className="fixed bottom-24 left-4 z-40 flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[11px] font-bold text-gray-600 shadow-sm hover:text-gray-900 lg:bottom-4 print:hidden"
      >
        {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {data && data.pendingCount > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">
            {data.pendingCount.toLocaleString("fa-IR")}
          </span>
        )}
      </button>

      {toast && (
        <div
          role="alert"
          className="fixed bottom-36 left-4 z-50 w-72 rounded-2xl border border-gold-500/40 bg-white p-4 shadow-xl lg:bottom-16 print:hidden"
          dir="rtl"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-50">
              <BellRing className="h-5 w-5 text-emerald" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-black text-gray-900">سفارش جدید فروشگاه</p>
              <p className="mt-0.5 text-[11.5px] text-gray-500">
                {toast.orderNumber ? `سفارش ${toast.orderNumber} پرداخت شد` : "یک سفارش جدید پرداخت شد"}
              </p>
              <Link
                href="/shop-orders"
                onClick={() => setToast(null)}
                className="mt-2 inline-block text-[12px] font-black text-emerald hover:underline"
              >
                مشاهده‌ی سفارشات ←
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="بستن"
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
