"use client";
// app/app/components/livechat/LiveChatMessages.tsx — نمایش پیام‌ها، دکمه‌های ربات، فرم‌ها و امتیاز
import { Fragment, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RotateCw,
  Star,
} from "lucide-react";
import type { BotOption, ChatMessage, FormField } from "./types";
import type { LivechatApi } from "./useLivechat";

const timeFmt = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long" });

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?»)\]])/g;

/** متن ساده با پیوندهای قابل کلیک (بدون HTML خام) */
export function RichText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="underline break-all" dir="ltr">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function formatSize(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} مگابایت` : `${Math.ceil(n / 1024)} کیلوبایت`;
}

function Attachment({ m, api }: { m: ChatMessage; api: LivechatApi }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const isImage = !!m.attachment?.isImage && !m.local;
  useEffect(() => {
    if (!isImage) return;
    let revoked = false;
    let objectUrl: string | null = null;
    api
      .fetchAttachment(m.id)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setError(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, isImage, m.id]);

  const download = async () => {
    try {
      const blob = await api.fetchAttachment(m.id);
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = m.attachment?.name ?? "file";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch {
      setError(true);
    }
  };

  if (isImage && url) {
    return (
      <button type="button" onClick={() => window.open(url, "_blank", "noopener")} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- تصویر خصوصی از blob */}
        <img src={url} alt={m.attachment?.name ?? "تصویر"} className="max-h-56 max-w-full rounded-xl object-cover" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={download}
      disabled={!!m.local}
      className="flex items-center gap-2 text-right"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/5">
        {m.local === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-bold" dir="auto">
          {m.attachment?.name ?? "فایل"}
        </span>
        <span className="flex items-center gap-1 text-[10.5px] opacity-70">
          {error ? "دریافت ناموفق" : formatSize(m.attachment?.size ?? null)}
          {!m.local && !error && <Download className="h-3 w-3" />}
        </span>
      </span>
    </button>
  );
}

function OptionButtons({
  options,
  disabled,
  onSelect,
  primary,
}: {
  options: BotOption[];
  disabled: boolean;
  onSelect: (o: BotOption) => void;
  primary: string;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {options.map((o) => {
        const footer = o.kind === "main" || o.kind === "back" || o.kind === "operator";
        if (o.kind === "link" && o.url) {
          const external = /^https?:\/\//.test(o.url);
          return (
            <a
              key={o.id}
              href={o.url}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              onClick={(e) => {
                if (!external) {
                  e.preventDefault();
                  onSelect(o);
                }
              }}
              className="flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-[12.5px] font-bold transition hover:shadow-sm"
              style={{ borderColor: `${primary}33`, color: primary }}
            >
              <span>{o.label}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          );
        }
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(o)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-right text-[12.5px] font-bold transition enabled:hover:shadow-sm disabled:opacity-50 ${
              footer ? "bg-transparent" : "bg-white"
            }`}
            style={
              o.kind === "operator"
                ? { borderColor: primary, color: "#fff", backgroundColor: primary }
                : { borderColor: `${primary}33`, color: primary }
            }
          >
            {o.icon && <span aria-hidden>{o.icon}</span>}
            <span className="flex-1">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FormCard({ m, api, primary }: { m: ChatMessage; api: LivechatApi; primary: string }) {
  const fields = m.payload?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitted = !!m.payload?.submitted;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.submitForm(m.id, values);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = (f: FormField) => {
    const common =
      "lc-input w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-gray-400";
    if (f.name === "department") {
      return (
        <select
          required={f.required}
          value={values.department ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, department: e.target.value }))}
          className={common}
        >
          <option value="">انتخاب کنید</option>
          {(m.payload?.departments ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      );
    }
    if (f.name === "message") {
      return (
        <textarea
          rows={3}
          required={f.required}
          value={values.message ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
          className={common}
        />
      );
    }
    return (
      <input
        type={f.name === "phone" ? "tel" : f.name === "email" ? "email" : "text"}
        inputMode={f.name === "phone" ? "tel" : undefined}
        dir={f.name === "phone" || f.name === "email" ? "ltr" : "rtl"}
        autoComplete={f.name === "phone" ? "tel" : f.name === "name" ? "name" : f.name}
        placeholder={f.name === "phone" ? "09xxxxxxxxx" : undefined}
        required={f.required}
        maxLength={f.name === "phone" ? 16 : 120}
        value={values[f.name] ?? ""}
        onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
        className={common}
      />
    );
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <p className="mb-2 whitespace-pre-wrap text-[12.5px] leading-6 text-gray-700">{m.body}</p>
      {submitted ? (
        <p className="flex items-center gap-1 text-[12px] font-bold text-emerald-700">
          <Check className="h-4 w-4" /> ثبت شد
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          {fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-[11.5px] font-bold text-gray-500">
              <span>
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              {input(f)}
            </label>
          ))}
          {error && <p className="text-[11.5px] font-bold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg py-2 text-[12.5px] font-black text-white disabled:opacity-60"
            style={{ backgroundColor: primary }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            ثبت و ادامه
          </button>
        </form>
      )}
    </div>
  );
}

function RatingCard({ m, api, primary, thanks }: { m: ChatMessage; api: LivechatApi; primary: string; thanks: string }) {
  const rated = m.payload?.rated ?? null;
  const [hover, setHover] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: number) => {
    setBusy(true);
    setError(null);
    try {
      await api.rate(m.id, value, comment.trim() || undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const shown = rated ?? (hover || stars);
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
      <p className="text-[12.5px] font-bold text-gray-700">{m.body}</p>
      <div className="my-2 flex justify-center gap-1" dir="ltr" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={rated != null || busy}
            aria-label={`${n} ستاره`}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              setStars(n);
              if (!m.payload?.askComment) void submit(n);
            }}
          >
            <Star
              className="h-7 w-7 transition"
              style={{ color: n <= shown ? "#f5b301" : "#d1d5db", fill: n <= shown ? "#f5b301" : "transparent" }}
            />
          </button>
        ))}
      </div>
      {rated != null ? (
        <p className="text-[12px] font-bold" style={{ color: primary }}>
          {thanks}
        </p>
      ) : (
        m.payload?.askComment &&
        stars > 0 && (
          <div className="flex flex-col gap-2">
            <textarea
              rows={2}
              maxLength={1000}
              placeholder="نظر شما (اختیاری)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="lc-input w-full rounded-lg border border-gray-200 px-3 py-2 text-[12.5px] outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(stars)}
              className="rounded-lg py-2 text-[12.5px] font-black text-white disabled:opacity-60"
              style={{ backgroundColor: primary }}
            >
              ثبت امتیاز
            </button>
          </div>
        )
      )}
      {error && <p className="mt-1 text-[11.5px] font-bold text-red-600">{error}</p>}
    </div>
  );
}

function Avatar({ name, url, primary }: { name: string; url?: string | null; primary: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- آواتار اپراتور از نشانی تنظیم‌شده
    return <img src={url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
      style={{ backgroundColor: primary }}
      aria-hidden
    >
      {name.trim().charAt(0) || "؟"}
    </span>
  );
}

interface Props {
  api: LivechatApi;
  messages: ChatMessage[];
  primary: string;
  accent: string;
  showAvatar: boolean;
  ratingThanks: string;
  /** آخرین پیام دارای دکمه که هنوز قابل انتخاب است */
  activeOptionsId: string | null;
  onOption: (o: BotOption) => void;
}

export default function LiveChatMessages({
  api,
  messages,
  primary,
  accent,
  showAvatar,
  ratingThanks,
  activeOptionsId,
  onOption,
}: Props) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
        const dayLabel = newDay ? (
          <div className="my-2 flex justify-center">
            <span className="rounded-full bg-white/80 px-3 py-0.5 text-[10.5px] font-bold text-gray-500 shadow-sm">
              {dayFmt.format(new Date(m.createdAt))}
            </span>
          </div>
        ) : null;

        if (m.type === "EVENT") {
          return (
            <Fragment key={m.id}>
              {dayLabel}
              <div className="my-1 flex justify-center">
                <span className="rounded-full bg-black/5 px-3 py-1 text-center text-[11px] font-bold text-gray-500">
                  {m.body}
                </span>
              </div>
            </Fragment>
          );
        }
        if (m.type === "FORM") {
          return (
            <Fragment key={m.id}>
              {dayLabel}
              <div className="max-w-[88%]">
                <FormCard m={m} api={api} primary={primary} />
              </div>
            </Fragment>
          );
        }
        if (m.type === "RATING") {
          return (
            <Fragment key={m.id}>
              {dayLabel}
              <RatingCard m={m} api={api} primary={primary} thanks={ratingThanks} />
            </Fragment>
          );
        }

        const mine = m.senderType === "VISITOR";
        const sameSender = prev && prev.senderType === m.senderType && !newDay && prev.type !== "EVENT";
        const name = m.operator?.displayName ?? (m.senderType === "BOT" ? "دستیار آرکان گلد" : "");
        const options = m.payload?.options ?? [];
        return (
          <Fragment key={m.id}>
            {dayLabel}
            <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""} ${sameSender ? "mt-0.5" : "mt-2"}`}>
              {!mine && showAvatar && (
                <span className="w-7 shrink-0">
                  {!sameSender && <Avatar name={name} url={m.operator?.avatarUrl} primary={accent} />}
                </span>
              )}
              {/* در چیدمان راست‌به‌چپ پیام بازدیدکننده سمت چپ و پاسخ پشتیبانی سمت راست است */}
              <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && !sameSender && name && (
                  <span className="mb-0.5 px-1 text-[10.5px] font-bold text-gray-500">{name}</span>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 text-[13px] leading-6 shadow-sm ${
                    mine ? "rounded-bl-md text-white" : "rounded-br-md bg-white text-gray-800"
                  } ${m.local === "failed" ? "opacity-70" : ""}`}
                  style={mine ? { backgroundColor: primary } : undefined}
                >
                  {m.type === "FILE" ? (
                    <Attachment m={m} api={api} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words" dir="auto">
                      <RichText text={m.body} />
                    </p>
                  )}
                  {options.length > 0 && (
                    <OptionButtons
                      options={options}
                      primary={primary}
                      disabled={m.id !== activeOptionsId}
                      onSelect={onOption}
                    />
                  )}
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-gray-400">
                  {m.local === "failed" ? (
                    <button
                      type="button"
                      onClick={() => (m.type === "TEXT" ? api.sendText(m.body, null, m) : undefined)}
                      className="flex items-center gap-1 font-bold text-red-500"
                      title={m.localError}
                    >
                      <AlertCircle className="h-3 w-3" />
                      {m.localError ?? "ارسال نشد"}
                      {m.type === "TEXT" && <RotateCw className="h-3 w-3" />}
                    </button>
                  ) : m.local === "sending" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      {timeFmt.format(new Date(m.createdAt))}
                      {mine &&
                        (m.seenAt ? (
                          <CheckCheck className="h-3.5 w-3.5" style={{ color: accent }} aria-label="خوانده شد" />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-label="ارسال شد" />
                        ))}
                    </>
                  )}
                </span>
              </div>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
