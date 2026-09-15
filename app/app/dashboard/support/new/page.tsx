// app/app/dashboard/support/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { ChevronRight, Loader2, AlertCircle, Send } from "lucide-react";
import { PRIORITY_META } from "../ticket-meta";

interface Category {
  id: string;
  name: string;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function NewTicketPage() {
  const router = useRouter();
  const { data: categories } = useSWR<Category[]>("/api/support/categories", fetcher);

  const [categoryId, setCategoryId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!categoryId || subject.trim().length < 3 || description.trim().length < 5) {
      setError("لطفاً همه فیلدها را کامل پر کنید");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await axios.post("/api/support/tickets", {
        categoryId,
        subject,
        description,
        priority,
      });
      const ticketId = res.data?.data?.ticket?.id ?? res.data?.ticket?.id;
      if (ticketId) router.push(`/dashboard/support/${ticketId}`);
      else router.push("/dashboard/support");
    } catch {
      setError("خطا در ثبت تیکت، دوباره تلاش کنید");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push("/dashboard/support")}
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">ثبت تیکت جدید</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            پس از ثبت می‌توانید فایل هم ضمیمه کنید
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl p-4 flex flex-col gap-4"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">دسته‌بندی</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-gold-500"
          >
            <option value="">انتخاب کنید...</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">موضوع</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-gold-500"
            placeholder="مثلاً: مشکل در ثبت سفارش"
          />
        </div>

        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">شرح درخواست</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={10000}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-gold-500 resize-none"
            placeholder="مشکل خود را با جزئیات شرح دهید..."
          />
        </div>

        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">اولویت</label>
          <div className="flex gap-2">
            {Object.entries(PRIORITY_META).map(([key, m]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPriority(key)}
                className="flex-1 py-2 rounded-xl text-[12px] font-bold border transition-colors"
                style={
                  priority === key
                    ? { backgroundColor: `${m.color}15`, borderColor: m.color, color: m.color }
                    : { borderColor: "var(--color-border)", color: "#6b7280" }
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          ثبت تیکت
        </button>
      </div>
    </div>
  );
}
