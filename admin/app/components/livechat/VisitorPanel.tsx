"use client";
// admin/app/components/livechat/VisitorPanel.tsx — مشخصات بازدیدکننده و گفتگوهای قبلی
import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Ban, ExternalLink, Globe, Loader2, Monitor, Save, ShieldCheck, Tag, X } from "lucide-react";
import type { ConversationDetail, VisitorProfile } from "./types";
import { STATUS_META } from "./types";
import { relTime } from "./ConversationList";

function deviceOf(ua: string | null) {
  if (!ua) return "—";
  const os = /Android/i.test(ua)
    ? "اندروید"
    : /iPhone|iPad|iOS/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "ویندوز"
        : /Mac OS/i.test(ua)
          ? "مک"
          : /Linux/i.test(ua)
            ? "لینوکس"
            : "نامشخص";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  return `${os}${browser ? ` · ${browser}` : ""}${/Mobile/i.test(ua) ? " · موبایل" : ""}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[12px]">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 text-left font-bold text-gray-700">{children}</span>
    </div>
  );
}

interface Props {
  detail: ConversationDetail;
  onClose: () => void;
  onOpenConversation: (id: string) => void;
  onVisitorChange: (v: VisitorProfile) => void;
  onTagsChange: (tags: string[]) => Promise<void>;
}

export default function VisitorPanel({ detail, onClose, onOpenConversation, onVisitorChange, onTagsChange }: Props) {
  const v = detail.visitor;
  const c = detail.conversation;
  const [form, setForm] = useState({ name: v.name ?? "", phone: v.phone ?? "", email: v.email ?? "", notes: v.notes ?? "" });
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [prevId, setPrevId] = useState(v.id);
  if (prevId !== v.id) {
    setPrevId(v.id);
    setForm({ name: v.name ?? "", phone: v.phone ?? "", email: v.email ?? "", notes: v.notes ?? "" });
    setMsg(null);
  }

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3000);
    return () => window.clearTimeout(t);
  }, [msg]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setMsg(axios.isAxiosError(e) ? ((e.response?.data as { message?: string })?.message ?? "خطا") : "خطا");
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run("save", async () => {
      const res = await axios.patch(`/api/admin/livechat/visitors/${v.id}`, {
        name: form.name || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      });
      onVisitorChange(res.data as VisitorProfile);
      setMsg("ذخیره شد");
    });

  const toggleBan = () => {
    const reason = v.isBanned ? undefined : window.prompt("دلیل مسدود کردن این بازدیدکننده:");
    if (!v.isBanned && reason === null) return;
    void run("ban", async () => {
      const res = await axios.post(`/api/admin/livechat/visitors/${v.id}/ban`, { banned: !v.isBanned, reason: reason || undefined });
      onVisitorChange(res.data as VisitorProfile);
    });
  };

  const input = "w-full rounded-lg border bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-gray-400";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-[13px] font-black text-gray-800">مشخصات بازدیدکننده</p>
        <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100" aria-label="بستن">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {v.user ? (
          <div className="rounded-xl bg-blue-50 p-3">
            <p className="flex items-center gap-1 text-[12px] font-black text-blue-800">
              <ShieldCheck className="h-4 w-4" /> کاربر عضو آرکان گلد
            </p>
            <Row label="نام">{v.user.fullName ?? "—"}</Row>
            <Row label="موبایل">
              <span dir="ltr">{v.user.phone}</span>
            </Row>
            <Row label="وضعیت">{v.user.status}</Row>
            <Link href={`/users/${v.user.id}`} target="_blank" className="mt-1 flex items-center gap-1 text-[11.5px] font-bold text-blue-700 hover:underline">
              پرونده‌ی کاربر <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <p className="rounded-xl bg-gray-50 p-2.5 text-[11.5px] text-gray-500">مهمان (وارد حساب کاربری نشده)</p>
        )}

        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-gray-500">
            نام
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} style={{ borderColor: "var(--color-border)" }} />
          </label>
          <label className="block text-[11px] font-bold text-gray-500">
            موبایل
            <input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} style={{ borderColor: "var(--color-border)" }} />
          </label>
          <label className="block text-[11px] font-bold text-gray-500">
            ایمیل
            <input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} style={{ borderColor: "var(--color-border)" }} />
          </label>
          <label className="block text-[11px] font-bold text-gray-500">
            یادداشت (فقط کارشناسان)
            <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} style={{ borderColor: "var(--color-border)" }} />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!!busy}
            className="flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[12px] font-black text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره
          </button>
          {msg && <p className="text-center text-[11.5px] font-bold text-gray-600">{msg}</p>}
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-gray-500">
            <Tag className="h-3.5 w-3.5" /> برچسب‌های گفتگو
          </p>
          <div className="flex flex-wrap gap-1">
            {c.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                {t}
                <button type="button" onClick={() => onTagsChange(c.tags.filter((x) => x !== t))} aria-label="حذف">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-1.5 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const t = tag.trim();
              if (t && !c.tags.includes(t)) void onTagsChange([...c.tags, t]);
              setTag("");
            }}
          >
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="برچسب جدید" className={input} style={{ borderColor: "var(--color-border)" }} maxLength={40} />
            <button type="submit" className="rounded-lg border px-2 text-[11px] font-bold" style={{ borderColor: "var(--color-border)" }}>
              افزودن
            </button>
          </form>
        </div>

        <div className="rounded-xl border p-2.5" style={{ borderColor: "var(--color-border)" }}>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-gray-500">
            <Globe className="h-3.5 w-3.5" /> بازدید
          </p>
          <Row label="وضعیت">{v.online ? "🟢 آنلاین" : `آخرین بازدید ${relTime(v.lastSeenAt)}`}</Row>
          {v.currentUrl && (
            <Row label="صفحه‌ی فعلی">
              {/* نشانی از مرورگر بازدیدکننده می‌آید؛ فقط http(s) قابل کلیک است */}
              {/^https?:\/\//i.test(v.currentUrl) ? (
                <a href={v.currentUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-700 hover:underline" dir="ltr" title={v.currentUrl}>
                  {v.currentTitle || v.currentUrl}
                </a>
              ) : (
                <span className="block truncate" dir="ltr">
                  {v.currentTitle || v.currentUrl}
                </span>
              )}
            </Row>
          )}
          {detail.extra.startUrl && (
            <Row label="شروع گفتگو از">
              <span className="block max-w-[180px] truncate" dir="ltr" title={detail.extra.startUrl}>
                {detail.extra.startUrl.replace(/^https?:\/\/[^/]+/, "")}
              </span>
            </Row>
          )}
          {v.referrer && (
            <Row label="ورودی از">
              <span className="block max-w-[180px] truncate" dir="ltr">
                {v.referrer}
              </span>
            </Row>
          )}
          <Row label="تعداد بازدید">{v.visitsCount.toLocaleString("fa-IR")}</Row>
          <Row label="اولین بازدید">{new Date(v.firstSeenAt).toLocaleDateString("fa-IR")}</Row>
          <Row label="دستگاه">
            <span className="flex items-center gap-1">
              <Monitor className="h-3.5 w-3.5" />
              {deviceOf(v.userAgent)}
            </span>
          </Row>
          <Row label="IP">
            <span dir="ltr">{v.lastIp ?? "—"}</span>
          </Row>
        </div>

        {detail.extra.ratingComment && (
          <div className="rounded-xl bg-amber-50 p-2.5 text-[12px] text-amber-900">
            نظر بازدیدکننده: «{detail.extra.ratingComment}»
          </div>
        )}

        <div>
          <p className="mb-1 text-[11px] font-bold text-gray-500">
            گفتگوهای این بازدیدکننده ({v.conversationsCount.toLocaleString("fa-IR")})
          </p>
          <div className="space-y-1">
            {v.previousConversations.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenConversation(p.id)}
                className={`block w-full rounded-lg border px-2.5 py-1.5 text-right text-[11.5px] hover:bg-gray-50 ${p.id === c.id ? "bg-amber-50" : ""}`}
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-gray-700">#{p.number.toLocaleString("fa-IR")}</span>
                  <span className="rounded px-1 text-[9.5px] font-bold" style={{ background: STATUS_META[p.status].bg, color: STATUS_META[p.status].color }}>
                    {STATUS_META[p.status].label}
                  </span>
                  {p.rating && <span className="text-amber-500">{"★".repeat(p.rating)}</span>}
                  <span className="mr-auto text-[10px] text-gray-400">{relTime(p.createdAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-gray-500">{p.subject ?? p.lastMessagePreview ?? "—"}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={toggleBan}
          disabled={!!busy}
          className={`flex w-full items-center justify-center gap-1 rounded-lg border py-1.5 text-[12px] font-bold disabled:opacity-50 ${
            v.isBanned ? "border-emerald-200 text-emerald-700" : "border-red-100 text-red-600"
          }`}
        >
          {busy === "ban" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          {v.isBanned ? "رفع مسدودی" : "مسدود کردن بازدیدکننده"}
        </button>
        {v.isBanned && v.bannedReason && <p className="text-center text-[11px] text-red-500">دلیل: {v.bannedReason}</p>}
      </div>
    </div>
  );
}
