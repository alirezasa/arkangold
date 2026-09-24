// admin/app/(dashboard)/notifications/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Bell,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  Eye,
  Users,
  Globe,
  Link2,
} from "lucide-react";
import UserPicker, { type UserSearchItem } from "@/app/components/UserPicker";

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

type Level = "INFO" | "SUCCESS" | "WARNING" | "PROMO";
type Audience = "ALL" | "SELECTED";

interface Announcement {
  id: string;
  title: string;
  body: string;
  link: string | null;
  level: Level;
  audience: Audience;
  isActive: boolean;
  publishedAt: string;
  expiresAt: string | null;
  createdBy: { id: string; fullName: string } | null;
  recipients: { userId: string; user: { id: string; phone: string } }[];
  readCount: number;
  recipientCount: number;
}

const LEVEL_META: Record<Level, { label: string; bg: string; color: string }> = {
  INFO: { label: "اطلاع‌رسانی", bg: "#dbeafe", color: "#1d4ed8" },
  SUCCESS: { label: "خبر خوب", bg: "#dcfce7", color: "#15803d" },
  WARNING: { label: "هشدار", bg: "#fef3c7", color: "#b45309" },
  PROMO: { label: "پیشنهاد ویژه", bg: "#fbf8eb", color: "#8c703b" },
};

function isExpired(a: Announcement) {
  return a.expiresAt !== null && new Date(a.expiresAt) <= new Date();
}

function CreateAnnouncementModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [level, setLevel] = useState<Level>("INFO");
  const [audience, setAudience] = useState<Audience>("ALL");
  const [users, setUsers] = useState<UserSearchItem[]>([]);
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (title.trim().length < 2) return setError("عنوان اعلان را وارد کنید");
    if (body.trim().length < 2) return setError("متن اعلان را وارد کنید");
    if (audience === "SELECTED" && users.length === 0)
      return setError("حداقل یک کاربر دریافت‌کننده انتخاب کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/admin/announcements", {
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        level,
        audience,
        userIds: audience === "SELECTED" ? users.map((u) => u.id) : undefined,
        // پایان روز انتخاب‌شده
        expiresAt: expiresAt
          ? new Date(`${expiresAt}T23:59:59`).toISOString()
          : undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در درج اعلان"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">درج اعلان جدید</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">عنوان</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            placeholder="مثلا: کاهش کارمزد خرید طلا"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">متن اعلان</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            لینک (اختیاری)
          </label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/dashboard/wallet یا https://..."
            dir="ltr"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-bold text-gray-500 mb-1 block">نوع</label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as Level)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
            >
              {(Object.keys(LEVEL_META) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_META[l].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-bold text-gray-500 mb-1 block">
              تاریخ انقضا (اختیاری)
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
              dir="ltr"
            />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">مخاطبان</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: "ALL", label: "همه کاربران", icon: Globe },
                { key: "SELECTED", label: "کاربران انتخابی", icon: Users },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setAudience(opt.key)}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold border"
                style={
                  audience === opt.key
                    ? {
                        backgroundColor: "var(--color-emerald)",
                        borderColor: "var(--color-emerald)",
                        color: "#fff",
                      }
                    : { borderColor: "#e5e7eb", color: "#4b5563" }
                }
              >
                <opt.icon className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
          {audience === "SELECTED" && (
            <div className="mt-3">
              <UserPicker
                selected={users}
                onAdd={(u) => setUsers((prev) => [...prev, u])}
                onRemove={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
              />
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "انتشار اعلان"}
        </button>
      </div>
    </div>
  );
}

function AnnouncementCard({
  item,
  onChanged,
}: {
  item: Announcement;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = LEVEL_META[item.level];
  const expired = isExpired(item);

  const toggleActive = async () => {
    setBusy(true);
    setError(null);
    try {
      await axios.patch(`/api/admin/announcements/${item.id}`, {
        isActive: !item.isActive,
      });
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تغییر وضعیت"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("این اعلان برای همیشه حذف شود؟")) return;
    setBusy(true);
    setError(null);
    try {
      await axios.delete(`/api/admin/announcements/${item.id}`);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در حذف اعلان"));
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        opacity: item.isActive && !expired ? 1 : 0.7,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
            <span
              className="badge"
              style={
                expired
                  ? { background: "#f3f4f6", color: "#6b7280" }
                  : item.isActive
                    ? { background: "#dcfce7", color: "#16a34a" }
                    : { background: "#fee2e2", color: "#dc2626" }
              }
            >
              {expired ? "منقضی شده" : item.isActive ? "فعال" : "غیرفعال"}
            </span>
          </div>
          <p className="text-[14px] font-black text-gray-900">{item.title}</p>
          <p className="text-[12px] text-gray-500 mt-1 whitespace-pre-line leading-relaxed">
            {item.body}
          </p>
          {item.link && (
            <p className="flex items-center gap-1 text-[11px] text-gray-400 mt-1" dir="ltr">
              <Link2 className="w-3 h-3" />
              {item.link}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-gray-400">
        <span className="flex items-center gap-1">
          {item.audience === "ALL" ? (
            <>
              <Globe className="w-3.5 h-3.5" /> همه کاربران
            </>
          ) : (
            <>
              <Users className="w-3.5 h-3.5" /> {item.recipientCount.toLocaleString("fa-IR")} کاربر
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          <Eye className="w-3.5 h-3.5" /> {item.readCount.toLocaleString("fa-IR")} بار خوانده شده
        </span>
        <span>انتشار: {new Date(item.publishedAt).toLocaleDateString("fa-IR")}</span>
        {item.expiresAt && (
          <span>انقضا: {new Date(item.expiresAt).toLocaleDateString("fa-IR")}</span>
        )}
        {item.createdBy && <span>توسط {item.createdBy.fullName}</span>}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold mt-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={toggleActive}
          disabled={busy}
          className="px-3 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600 disabled:opacity-50"
        >
          {item.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
        </button>
        <button
          onClick={remove}
          disabled={busy}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold border border-red-100 text-red-600 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          حذف
        </button>
      </div>
    </div>
  );
}

export default function NotificationsAdminPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, error, mutate } = useSWR<Announcement[]>(
    "/api/admin/announcements",
    fetcher,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-400" />
          اعلان‌های کاربران
        </h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          اعلان جدید
        </button>
      </div>
      <p className="text-[12px] text-gray-400 mb-5">
        اعلان‌های فعال در زنگوله اعلان‌های اپلیکیشن کاربران نمایش داده می‌شوند.
      </p>

      {error && (
        <div className="flex items-center gap-2 p-4 mb-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4" />
          {getErrorMessage(error, "خطا در دریافت اعلان‌ها")}
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Bell className="w-8 h-8 text-gray-200" />
            <p className="text-[12px] text-gray-400">هنوز اعلانی درج نشده است</p>
          </div>
        ) : (
          data.map((item) => (
            <AnnouncementCard key={item.id} item={item} onChanged={() => mutate()} />
          ))
        )}
      </div>

      {createOpen && (
        <CreateAnnouncementModal
          onClose={() => setCreateOpen(false)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}
