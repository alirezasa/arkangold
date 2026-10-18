"use client";
// لوگو، مهر و امضای شرکت — لوگو روی صفحات ورود/پنل‌ها و اسناد؛ مهر و امضا روی فاکتور و پیش‌فاکتور
import { useRef, useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { adminApi } from "@/app/core/api";
import { Loader2, Upload, Trash2, ImageIcon } from "lucide-react";

type Kind = "logo" | "seal" | "signature";
type Preview = Record<Kind, string | null>;

const ITEMS: { kind: Kind; title: string; hint: string }[] = [
  { kind: "logo", title: "لوگو", hint: "صفحات ورود، منوی پنل‌ها و سربرگ اسناد" },
  { kind: "seal", title: "مهر شرکت", hint: "پایین فاکتور و پیش‌فاکتور — PNG با پس‌زمینه‌ی شفاف" },
  { kind: "signature", title: "امضای صاحب امضای مجاز", hint: "روی مهر در فاکتور و پیش‌فاکتور — PNG شفاف" },
];

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

export default function BrandingSettings({ canEdit }: { canEdit: boolean }) {
  const { data, mutate, isLoading } = useSWR<Preview>("/api/admin/branding", fetcher);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<Kind, HTMLInputElement | null>>({ logo: null, seal: null, signature: null });

  const upload = async (kind: Kind, file: File) => {
    setBusy(kind);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await axios.post(`/api/admin/branding/${kind}`, form);
      await mutate();
    } catch (e) {
      setError(
        axios.isAxiosError(e) ? (e.response?.data?.message ?? "بارگذاری ناموفق بود") : "بارگذاری ناموفق بود",
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = async (kind: Kind) => {
    setBusy(kind);
    setError(null);
    try {
      await adminApi.delete(`/api/admin/branding/${kind}`);
      await mutate();
    } catch {
      setError("حذف تصویر ناموفق بود");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 mb-2">
      <p className="text-[12px] font-black text-gray-600 mb-2">لوگو، مهر و امضا</p>
      {error && <p className="mb-2 text-[12px] font-bold text-red-600">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ITEMS.map(({ kind, title, hint }) => {
          const src = data?.[kind] ?? null;
          return (
            <div key={kind} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 flex flex-col">
              <p className="text-[12.5px] font-black text-gray-800">{title}</p>
              <p className="text-[10.5px] text-gray-400 mb-2 leading-relaxed">{hint}</p>
              <div
                className="flex h-28 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white"
                style={{ backgroundImage: "repeating-conic-gradient(#f3f4f6 0 25%, transparent 0 50%)", backgroundSize: "14px 14px" }}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
                ) : src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={title} className="max-h-24 max-w-full object-contain" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-gray-300" />
                )}
              </div>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <input
                    ref={(el) => {
                      inputs.current[kind] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload(kind, f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => inputs.current[kind]?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11.5px] font-black text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-emerald)" }}
                  >
                    {busy === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {src ? "تغییر" : "بارگذاری"}
                  </button>
                  {src && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void remove(kind)}
                      aria-label={`حذف ${title}`}
                      className="flex items-center justify-center rounded-lg border border-red-200 px-2.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10.5px] text-gray-400 leading-relaxed">
        فرمت‌های مجاز: PNG، JPG، WEBP تا ۲ مگابایت. مهر و امضای هر سند در لحظه‌ی صدور ثبت می‌شود و
        تغییر بعدی روی اسناد صادرشده اثری ندارد.
      </p>
    </div>
  );
}
