"use client";
import { useState, useRef } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  ImagePlus,
  Star,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertCircle,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (data?.message)
      return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

const NEST_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN || "http://localhost:5000";

export default function ProductImagesManager({
  productId,
}: {
  productId: string;
}) {
  const { data, isLoading, mutate } = useSWR<ProductImage[]>(
    `/api/admin/shop/products/${productId}/images`,
    fetcher,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      await axios.post(
        `/api/admin/shop/products/${productId}/images`,
        formData,
      );
      await mutate();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در آپلود تصاویر"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const setPrimary = async (imageId: string) => {
    setBusyId(imageId);
    setError(null);
    try {
      await axios.patch(`/api/admin/shop/images/${imageId}/primary`);
      await mutate();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تنظیم تصویر اصلی"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (imageId: string) => {
    if (!confirm("این تصویر حذف شود؟")) return;
    setBusyId(imageId);
    setError(null);
    try {
      await axios.delete(`/api/admin/shop/images/${imageId}`);
      await mutate();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در حذف تصویر"));
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!data) return;
    const target = index + direction;
    if (target < 0 || target >= data.length) return;

    const reordered = [...data];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    const orderedIds = reordered.map((img) => img.id);

    try {
      await axios.post(`/api/admin/shop/images/reorder/${productId}`, {
        orderedIds,
      });
      await mutate();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تغییر ترتیب"));
    }
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-black text-gray-700">
          گالری تصاویر محصول
        </h2>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-[12px] font-bold disabled:opacity-60"
          style={{ color: "var(--color-emerald)" }}
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ImagePlus className="w-3.5 h-3.5" />
          )}
          افزودن تصویر
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFilesSelected}
          className="hidden"
        />
      </div>

      <p className="text-[11px] text-gray-400 -mt-2">
        فرمت مجاز: JPEG، PNG، WEBP — حداکثر ۵ مگابایت هر فایل. اولین تصویر
        به‌طور خودکار «تصویر اصلی» می‌شود.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center gap-2 py-10 text-gray-300">
          <ImagePlus className="w-8 h-8" />
          <p className="text-[12px] text-gray-400">
            هنوز تصویری آپلود نشده است
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.map((img, index) => (
            <div
              key={img.id}
              className="relative group rounded-xl overflow-hidden aspect-square"
              style={{ backgroundColor: "var(--color-bg-page)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${NEST_ORIGIN}${img.url}`}
                alt={img.altText ?? ""}
                className="w-full h-full object-cover"
              />

              {img.isPrimary && (
                <span
                  className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  <Star className="w-2.5 h-2.5 fill-white" /> اصلی
                </span>
              )}

              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
                {!img.isPrimary && (
                  <button
                    type="button"
                    onClick={() => setPrimary(img.id)}
                    disabled={busyId === img.id}
                    className="w-full px-2 py-1.5 rounded-lg bg-white/90 text-[10px] font-bold text-gray-800 flex items-center justify-center gap-1"
                  >
                    <Star className="w-3 h-3" /> تصویر اصلی
                  </button>
                )}
                <div className="flex gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="flex-1 h-7 rounded-lg bg-white/90 text-gray-700 flex items-center justify-center disabled:opacity-40"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === data.length - 1}
                    className="flex-1 h-7 rounded-lg bg-white/90 text-gray-700 flex items-center justify-center disabled:opacity-40"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(img.id)}
                    disabled={busyId === img.id}
                    className="flex-1 h-7 rounded-lg bg-red-500 text-white flex items-center justify-center"
                  >
                    {busyId === img.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
