// app/app/dashboard/support/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, Lock, Unlock, Star } from "lucide-react";

const STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  WAITING_FOR_USER: "در انتظار پاسخ شما",
  RESOLVED: "حل شده",
  CLOSED: "بسته شده",
  REOPENED: "بازگشایی شده",
};

const PRIORITY_FA: Record<string, string> = {
  LOW: "کم",
  NORMAL: "عادی",
  HIGH: "بالا",
  URGENT: "فوری",
};

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
interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  category: { name: string };
  assignedAdmin: { name: string } | null;
  createdAt: string;
  messages: Message[];
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate, isLoading } = useSWR<TicketDetail>(
    id ? `/api/support/tickets/${id}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );

  const [reply, setReply] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  const isClosed = data.status === "CLOSED";

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

  return (
    <div dir="rtl" className="max-w-2xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-base font-black text-gray-900">{data.subject}</h1>
            <p className="text-[11px] text-gray-400 mt-1" dir="ltr">
              {data.ticketNumber} · {data.category?.name}
            </p>
          </div>
          <button
            onClick={toggleClose}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600"
          >
            {isClosed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isClosed ? "بازگشایی تیکت" : "بستن تیکت"}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-gray-500">
          <span>وضعیت: {STATUS_FA[data.status] ?? data.status}</span>
          <span>اولویت: {PRIORITY_FA[data.priority] ?? data.priority}</span>
          <span>کارشناس: {data.assignedAdmin?.name ?? "هنوز اختصاص نیافته"}</span>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] ${
              m.senderType === "USER"
                ? "self-end bg-emerald-600 text-white rounded-bl-md"
                : "self-start bg-gray-100 text-gray-900 rounded-br-md"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.message}</p>
            {m.attachments?.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {m.attachments.map((a) => (
                  <span key={a.id} className="flex items-center gap-1 text-[11px] opacity-80">
                    <Paperclip className="w-3 h-3" />
                    {a.originalFilename}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] opacity-60 mt-1">
              {new Date(m.createdAt).toLocaleTimeString("fa-IR")}
            </p>
          </div>
        ))}
      </div>

      {/* Reply box */}
      {!isClosed ? (
        <div className="border-t border-gray-100 pt-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="پاسخ خود را بنویسید..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-emerald-500 resize-none"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-emerald-600 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              ارسال
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-gray-100 pt-3 text-center text-[12px] text-gray-400">
          این تیکت بسته شده است. برای پاسخ جدید، آن را بازگشایی کنید.
        </div>
      )}
    </div>
  );
}
