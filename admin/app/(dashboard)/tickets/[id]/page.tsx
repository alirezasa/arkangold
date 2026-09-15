// admin/app/(dashboard)/tickets/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, Send, EyeOff, Star, Paperclip } from "lucide-react";
import { STATUS_META, PRIORITY_META, NEXT_STATUS_OPTIONS } from "../ticket-meta";

interface Attachment {
  id: string;
  originalFilename: string;
}
interface Message {
  id: string;
  message: string;
  senderType: "USER" | "ADMIN" | "SYSTEM";
  isInternal: boolean;
  createdAt: string;
  attachments: Attachment[];
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
  attachments: Attachment[];
  rating: { rating: number; comment: string | null } | null;
}

interface AdminItem {
  id: string;
  fullName: string;
  username: string;
  isActive: boolean;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      <p className="text-[11px] font-bold text-gray-400 mb-2">{title}</p>
      {children}
    </div>
  );
}

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate, isLoading } = useSWR<TicketDetail>(
    id ? `/api/admin/tickets/${id}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
  const { data: admins } = useSWR<AdminItem[]>("/api/admin/admins", fetcher);

  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [assignAdminId, setAssignAdminId] = useState("");
  const [sending, setSending] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-gold-500)" }} />
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

  const changePriority = async (newPriority: string) => {
    await axios.patch(`/api/admin/tickets/${id}/priority`, { priority: newPriority });
    await mutate();
  };

  const assign = async () => {
    if (!assignAdminId) return;
    await axios.post(`/api/admin/tickets/${id}/assign`, { adminId: assignAdminId });
    setAssignAdminId("");
    await mutate();
  };

  const openAttachment = async (attachmentId: string) => {
    const res = await axios.get(
      `/api/admin/tickets/${id}/attachments/${attachmentId}/download-url`,
    );
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  };

  const activeAdmins = admins?.filter((a) => a.isActive) ?? [];
  const standaloneAttachments = data.attachments.filter(
    (a) => !data.messages.some((m) => m.attachments.some((ma) => ma.id === a.id)),
  );
  const statusMeta = STATUS_META[data.status] ?? STATUS_META.OPEN;
  const priorityMeta = PRIORITY_META[data.priority] ?? PRIORITY_META.NORMAL;

  return (
    <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ستون اصلی: گفتگو */}
      <div className="lg:col-span-2">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-black text-gray-900">{data.subject}</h1>
            <span className="badge" style={{ background: statusMeta.bg, color: statusMeta.color }}>
              {statusMeta.label}
            </span>
          </div>
          <p className="text-[11px] text-gray-400" dir="ltr">
            {data.ticketNumber} · {data.user?.phone}
          </p>
          <p
            className="text-[13px] text-gray-600 mt-3 rounded-xl p-3"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            {data.description}
          </p>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {data.messages.map((m) => (
            <div
              key={m.id}
              className="px-4 py-2.5 rounded-xl text-[13px]"
              style={
                m.isInternal
                  ? { background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e" }
                  : m.senderType === "ADMIN"
                    ? { background: "var(--color-emerald-light)", color: "var(--color-emerald)" }
                    : { background: "var(--color-bg-page)", color: "#111827" }
              }
            >
              {m.isInternal && (
                <span className="flex items-center gap-1 text-[10px] font-bold mb-1">
                  <EyeOff className="w-3 h-3" /> یادداشت داخلی
                </span>
              )}
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
                {new Date(m.createdAt).toLocaleString("fa-IR")}
              </p>
            </div>
          ))}
        </div>

        {standaloneAttachments.length > 0 && (
          <div className="mb-4 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-[11px] font-bold text-gray-400 mb-2">پیوست‌های تیکت</p>
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

        <div className="border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="پاسخ یا یادداشت داخلی..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-gold-500 resize-none"
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
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              ارسال
            </button>
          </div>
        </div>
      </div>

      {/* سایدبار: وضعیت / ارجاع */}
      <div className="flex flex-col gap-4">
        <SidebarCard title="وضعیت فعلی">
          <div
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
            style={{ background: statusMeta.bg }}
          >
            <statusMeta.icon className="w-4 h-4" style={{ color: statusMeta.color }} />
            <p className="text-[13px] font-bold" style={{ color: statusMeta.color }}>
              {statusMeta.label}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {(NEXT_STATUS_OPTIONS[data.status] ?? []).map((s) => {
              const meta = STATUS_META[s];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className="flex items-center gap-2 text-[12px] font-bold text-right px-3 py-2 rounded-lg border transition-colors"
                  style={{ borderColor: "var(--color-border)", color: meta.color }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  تغییر به: {meta.label}
                </button>
              );
            })}
          </div>
        </SidebarCard>

        <SidebarCard title="اولویت">
          <p className="text-[13px] font-bold mb-3" style={{ color: priorityMeta.color }}>
            {priorityMeta.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRIORITY_META)
              .filter(([k]) => k !== data.priority)
              .map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => changePriority(k)}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                  style={{ color: v.color }}
                >
                  {v.label}
                </button>
              ))}
          </div>
        </SidebarCard>

        <SidebarCard title="کارشناس مسئول">
          <p className="text-[13px] mb-3 text-gray-900 font-bold">
            {data.assignedAdmin?.fullName ?? "اختصاص نیافته"}
          </p>
          <div className="flex gap-2">
            <select
              value={assignAdminId}
              onChange={(e) => setAssignAdminId(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] outline-none focus:border-gold-500"
            >
              <option value="">انتخاب کارشناس...</option>
              {activeAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
            <button
              onClick={assign}
              disabled={!assignAdminId}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-40"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              ارجاع
            </button>
          </div>
        </SidebarCard>

        {data.rating && (
          <SidebarCard title="امتیاز کاربر">
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
              <p className="text-[12px] text-gray-600 mt-2">{data.rating.comment}</p>
            )}
          </SidebarCard>
        )}
      </div>
    </div>
  );
}
