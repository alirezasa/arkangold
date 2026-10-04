// app/app/courier/[token]/page.tsx
//
// صفحه‌ی عمومی ثبت تحویل برای پیک: لینک یکتا با پیامک برای پیک ارسال می‌شود؛ پیک پس از
// تحویل مرسوله، کد تحویل را از مشتری می‌گیرد و این‌جا وارد می‌کند. بدون نیاز به ورود.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import { AlertCircle, CheckCircle2, Loader2, MapPin, Package, Phone, Truck } from "lucide-react";

interface CourierInfo {
  orderNumber: string;
  status: string;
  statusLabel: string;
  delivered: boolean;
  linkActive: boolean;
  method: string | null;
  courierName: string | null;
  receiverName: string;
  city: string;
  address: string;
  receiverPhone: string | null;
  itemCount: number;
  attemptsLeft: number;
  deliveredAt: string | null;
}

function errorMessage(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) {
    const m = (e.response?.data as { message?: string } | undefined)?.message;
    if (m) return m;
  }
  return fallback;
}

export default function CourierDeliveryPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<CourierInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [receiver, setReceiver] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get<CourierInfo>(`/api/public/delivery/${encodeURIComponent(token)}`);
      setInfo(res.data);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e, "لینک تحویل نامعتبر است"));
    }
  };

  useEffect(() => {
    let cancelled = false;
    axios
      .get<CourierInfo>(`/api/public/delivery/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled) setInfo(res.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(errorMessage(e, "لینک تحویل نامعتبر است"));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await axios.post(`/api/public/delivery/${encodeURIComponent(token)}/confirm`, {
        code: code.trim(),
        receivedByName: receiver.trim() || undefined,
      });
      setDone(true);
      await load();
    } catch (err) {
      setError(errorMessage(err, "ثبت تحویل ناموفق بود"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const card = { backgroundColor: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #e5e7eb)" };

  return (
    <div className="min-h-screen flex items-start justify-center p-4 pt-10 bg-gray-50" dir="rtl">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="w-6 h-6" style={{ color: "var(--color-emerald, #065f46)" }} />
          <h1 className="text-[17px] font-black text-gray-900">ثبت تحویل مرسوله</h1>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold flex gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {loadError}
          </div>
        )}

        {!info && !loadError && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        )}

        {info && (
          <>
            <div className="rounded-2xl p-5 space-y-2 text-[13px]" style={card}>
              <div className="flex justify-between">
                <span className="text-gray-500">شماره سفارش</span>
                <span className="font-black" dir="ltr">
                  {info.orderNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">وضعیت</span>
                <span className="font-bold">{info.statusLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">تعداد اقلام</span>
                <span className="font-bold flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" /> {info.itemCount.toLocaleString("fa-IR")}
                </span>
              </div>
              {info.linkActive && (
                <>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="font-bold">{info.receiverName}</p>
                    <p className="text-gray-600 flex items-start gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 mt-1 shrink-0" />
                      {info.city} — {info.address}
                    </p>
                    {info.receiverPhone && (
                      <a href={`tel:${info.receiverPhone}`} className="flex items-center gap-1 mt-1 font-bold" style={{ color: "var(--color-emerald, #065f46)" }}>
                        <Phone className="w-3.5 h-3.5" /> <span dir="ltr">{info.receiverPhone}</span>
                      </a>
                    )}
                  </div>
                </>
              )}
            </div>

            {info.delivered || done ? (
              <div className="rounded-2xl p-5 text-center space-y-2" style={card}>
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                <p className="font-black text-emerald-700">تحویل این سفارش ثبت شده است</p>
                {info.deliveredAt && (
                  <p className="text-[12px] text-gray-500">{new Date(info.deliveredAt).toLocaleString("fa-IR")}</p>
                )}
              </div>
            ) : !info.linkActive ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-[13px] font-bold">
                این لینک دیگر فعال نیست. برای ثبت تحویل با پشتیبانی تماس بگیرید.
              </div>
            ) : (
              <form onSubmit={submit} className="rounded-2xl p-5 space-y-3" style={card}>
                <p className="text-[12px] text-gray-600">
                  پس از تحویل مرسوله، کد تحویلی را که برای مشتری پیامک شده از او بگیرید و وارد کنید. بدون کد صحیح، تحویل ثبت نمی‌شود.
                </p>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="کد تحویل"
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 text-center text-xl font-black tracking-[0.4em] outline-none"
                  dir="ltr"
                />
                <input
                  value={receiver}
                  onChange={(e) => setReceiver(e.target.value)}
                  placeholder="نام تحویل‌گیرنده (اختیاری)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none"
                />
                {error && (
                  <div className="p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">{error}</div>
                )}
                <p className="text-[11px] text-gray-400">تلاش باقی‌مانده: {info.attemptsLeft.toLocaleString("fa-IR")}</p>
                <button
                  type="submit"
                  disabled={busy || code.trim().length < 4 || info.attemptsLeft === 0}
                  className="w-full py-3 rounded-xl font-black text-white disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-emerald, #065f46)" }}
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ثبت تحویل"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
