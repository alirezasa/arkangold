// app/app/dashboard/support/[id]/page.tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useRef, useState } from "react";
import { ChevronRight, Loader2, Paperclip, Send, Lock, Unlock, Star } from "lucide-react";
import { STATUS_META, PRIORITY_META } from "../ticket-meta";

interface Attachment {
  id: string;
  originalFilename: string;
}
interface Message {
  id: string;
  message: string;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  createdAt: string;
  attachments: Attachment[];
}
interface Rating {
  rating: number;
  comment: string | null;
}
interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: { name: string };
  assignedAdmin: { fullName: string } | null;
  createdAt: string;
  messages: Message[];
  attachments: Attachment[];
  rating: Rating | null;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, mutate, isLoading } = useSWR<TicketDetail>(
    id ? `/api/support/tickets/${id}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );

  const [reply, setReply] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-gold-500)" }} />
      </div>
    );
  }

  const isClosed = data.status === "CLOSED";
  const statusMeta = STATUS_META[data.status] ?? STATUS_META.OPEN;
  const priorityMeta = PRIORITY_META[data.priority] ?? PRIORITY_META.NORMAL;

  const sendReply = async () => {
    if (!reply.trim() && !file) return;
    setSending(true);
    try {
      if (reply.trim()) {
        await axios.post(`/api/support/tickets/${id}/messages`, { message: reply.trim() });
      }
      if (file) {
        const formData = new FormData();
        formData.append("files", file);
        await axios.post(`/api/support/tickets/${id}/attachments`, formData);
      }
      setReply("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await mutate();
    } finally {
      setSending(false);
    }
  };

  const toggleClose = async () => {
    if (isClosed) {
      await axios.post(`/api/support/tickets/${id}/reopen`);
    } else {
      await axios.post(`/api/support/tickets/${id}/close`, {});
    }
    await mutate();
  };

  const openAttachment = async (attachmentId: string) => {
    const res = await axios.get(
      `/api/support/tickets/${id}/attachments/${attachmentId}/download-url`,
    );
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  };

  const standaloneAttachments = data.attachments.filter(
    (a) => !data.messages.some((m) => m.attachments.some((ma) => ma.id === a.id)),
  );

  const canRate = data.status === "RESOLVED" || data.status === "CLOSED";

  const submitRating = async () => {
    if (ratingValue < 1) return;
    setSubmittingRating(true);
    try {
      await axios.post(`/api/support/tickets/${id}/rating`, {
        rating: ratingValue,
        comment: ratingComment.trim() || undefined,
      });
      await mutate();
    } finally {
      setSubmittingRating(false);
    }
  };

  return (
    <div dir="rtl" className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="mb-4 pb-4 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.push("/dashboard/support")}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-black text-gray-900 truncate">{data.subject}</h1>
            <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
              {data.ticketNumber} · {data.category?.name}
            </p>
          </div>
          <button
            onClick={toggleClose}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border shrink-0"
            style={{ borderColor: "var(--color-border)", color: "#6b7280" }}
          >
            {isClosed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isClosed ? "بازگشایی" : "بستن"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}
          >
            {statusMeta.label}
          </span>
          <span className="text-[11px] font-bold" style={{ color: priorityMeta.color }}>
            {priorityMeta.label}
          </span>
          <span className="text-[11px] text-gray-400">
            {data.assignedAdmin?.fullName ?? "هنوز اختصاص نیافته"}
          </span>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] ${
              m.senderType === "USER" ? "self-end text-white rounded-bl-md" : "self-start rounded-br-md"
            }`}
            style={
              m.senderType === "USER"
                ? { backgroundColor: "var(--color-emerald)" }
                : { backgroundColor: "var(--color-bg-page)", color: "#111827" }
            }
          >
            <p className="whitespace-pre-wrap">{m.message}</p>
            {m.attachments?.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {m.attachments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => openAttachment(a.id)}
                    className="flex items-center gap-1 text-[11px] opacity-80 hover:opacity-100 hover:underline"
                  >
                    <Paperclip className="w-3 h-3" />
                    {a.originalFilename}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] opacity-60 mt-1">
              {new Date(m.createdAt).toLocaleTimeString("fa-IR")}
            </p>
          </div>
        ))}
      </div>

      {/* Standalone attachments (not attached to a specific message) */}
      {standaloneAttachments.length > 0 && (
        <div className="border-t pt-3 pb-1" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-[11px] text-gray-400 mb-1.5">پیوست‌های تیکت</p>
          <div className="flex flex-col gap-1">
            {standaloneAttachments.map((a) => (
              <button
                key={a.id}
                onClick={() => openAttachment(a.id)}
                className="flex items-center gap-1.5 text-[12px] text-gray-600 hover:underline"
                style={{ color: "var(--color-emerald)" }}
              >
                <Paperclip className="w-3.5 h-3.5" />
                {a.originalFilename}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      {canRate && (
        <div className="border-t pt-3 pb-1 mb-2" style={{ borderColor: "var(--color-border)" }}>
          {data.rating ? (
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-[11px] text-gray-400">امتیاز شما به این تیکت</p>
              <div className="flex items-center gap-0.5" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="w-4 h-4"
                    style={
                      n <= data.rating!.rating
                        ? { fill: "var(--color-gold-500)", color: "var(--color-gold-500)" }
                        : { color: "#e5e7eb" }
                    }
                  />
                ))}
              </div>
              {data.rating.comment && (
                <p className="text-[12px] text-gray-600 mt-1">{data.rating.comment}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[12px] text-gray-500">این تیکت چقدر خوب حل شد؟</p>
              <div className="flex items-center gap-1" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRatingValue(n)}>
                    <Star
                      className="w-6 h-6"
                      style={
                        n <= ratingValue
                          ? { fill: "var(--color-gold-500)", color: "var(--color-gold-500)" }
                          : { color: "#e5e7eb" }
                      }
                    />
                  </button>
                ))}
              </div>
              {ratingValue > 0 && (
                <div className="w-full flex flex-col gap-2 items-center">
                  <input
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="نظر شما (اختیاری)"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[12px] outline-none focus:border-gold-500"
                  />
                  <button
                    onClick={submitRating}
                    disabled={submittingRating}
                    className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--color-emerald)" }}
                  >
                    {submittingRating ? "در حال ثبت..." : "ثبت امتیاز"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reply box */}
      {!isClosed ? (
        <div className="border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="پاسخ خود را بنویسید..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-gold-500 resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <Paperclip className="w-4 h-4" />
              {file ? file.name : "افزودن فایل"}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              onClick={sendReply}
              disabled={sending || (!reply.trim() && !file)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              ارسال
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t pt-3 text-center text-[12px] text-gray-400" style={{ borderColor: "var(--color-border)" }}>
          این تیکت بسته شده است. برای پاسخ جدید، آن را بازگشایی کنید.
        </div>
      )}
    </div>
  );
}
