// admin/app/(dashboard)/tickets/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, Send, EyeOff } from "lucide-react";

const STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  WAITING_FOR_USER: "منتظر کاربر",
  RESOLVED: "حل شده",
  CLOSED: "بسته",
  REOPENED: "بازگشایی‌شده",
};

// گذارهای مجاز — باید با TICKET_STATUS_TRANSITIONS در packages/shared هماهنگ بماند
const NEXT_STATUS_OPTIONS: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["WAITING_FOR_USER", "RESOLVED", "OPEN"],
  WAITING_FOR_USER: ["IN_PROGRESS", "OPEN"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "OPEN"],
};

interface Message {
  id: string;
  message: string;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  isInternal: boolean;
  createdAt: string;
}
interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: { name: string };
  user: { phone: string };
  assignedAdmin: { id: string; fullName: string } | null;
  messages: Message[];
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate, isLoading } = useSWR<TicketDetail>(
    id ? `/api/admin/tickets/${id}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [assignAdminId, setAssignAdminId] = useState("");
  const [sending, setSending] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await axios.post(`/api/admin/tickets/${id}/messages`, {
        message: reply.trim(),
        isInternal,
      });
      setReply("");
      await mutate();
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (newStatus: string) => {
    await axios.post(`/api/admin/tickets/${id}/status`, { status: newStatus });
    await mutate();
  };

  const assign = async () => {
    if (!assignAdminId.trim()) return;
    await axios.post(`/api/admin/tickets/${id}/assign`, { adminId: assignAdminId.trim() });
    setAssignAdminId("");
    await mutate();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto grid grid-cols-3 gap-6">
      {/* ستون اصلی: گفتگو */}
      <div className="col-span-2">
        <div className="mb-4">
          <h1 className="text-lg font-black text-gray-900">{data.subject}</h1>
          <p className="text-[11px] text-gray-400 mt-1" dir="ltr">
            {data.ticketNumber} · {data.user?.phone}
          </p>
          <p className="text-[13px] text-gray-600 mt-3 bg-gray-50 rounded-xl p-3">
            {data.description}
          </p>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {data.messages.map((m) => (
            <div
              key={m.id}
              className={`px-4 py-2.5 rounded-xl text-[13px] ${
                m.isInternal
                  ? "bg-amber-50 border border-amber-200 text-amber-900"
                  : m.senderType === "ADMIN"
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-gray-100 text-gray-900"
              }`}
            >
              {m.isInternal && (
                <span className="flex items-center gap-1 text-[10px] font-bold mb-1">
                  <EyeOff className="w-3 h-3" /> یادداشت داخلی
                </span>
              )}
              <p className="whitespace-pre-wrap">{m.message}</p>
              <p className="text-[10px] opacity-60 mt-1">
                {new Date(m.createdAt).toLocaleString("fa-IR")}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="پاسخ یا یادداشت داخلی..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
              />
              یادداشت داخلی (کاربر نمی‌بیند)
            </label>
            <button
              onClick={send}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-gray-900 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              ارسال
            </button>
          </div>
        </div>
      </div>

      {/* سایدبار: وضعیت / ارجاع */}
      <div className="flex flex-col gap-4">
        <div className="border border-gray-100 rounded-xl p-4">
          <p className="text-[11px] font-bold text-gray-400 mb-2">وضعیت فعلی</p>
          <p className="text-[13px] font-bold mb-3">{STATUS_FA[data.status] ?? data.status}</p>
          <div className="flex flex-col gap-1.5">
            {(NEXT_STATUS_OPTIONS[data.status] ?? []).map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className="text-[12px] text-right px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                تغییر به: {STATUS_FA[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-gray-100 rounded-xl p-4">
          <p className="text-[11px] font-bold text-gray-400 mb-2">کارشناس مسئول</p>
          <p className="text-[13px] mb-3">{data.assignedAdmin?.fullName ?? "اختصاص نیافته"}</p>
          <div className="flex gap-2">
            <input
              value={assignAdminId}
              onChange={(e) => setAssignAdminId(e.target.value)}
              placeholder="شناسه ادمین"
              className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[12px]"
            />
            <button
              onClick={assign}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white bg-gray-900"
            >
              ارجاع
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
