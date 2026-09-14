// app/app/dashboard/support/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import { Loader2 } from "lucide-react";

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
    } catch (e) {
      setError("خطا در ثبت تیکت، دوباره تلاش کنید");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-lg font-black text-gray-900 mb-5">ثبت تیکت جدید</h1>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">دسته‌بندی</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-emerald-500"
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
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-emerald-500"
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
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-emerald-500 resize-none"
            placeholder="مشکل خود را با جزئیات شرح دهید..."
          />
        </div>

        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1.5 block">اولویت</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-emerald-500"
          >
            <option value="LOW">کم</option>
            <option value="NORMAL">عادی</option>
            <option value="HIGH">بالا</option>
            <option value="URGENT">فوری</option>
          </select>
        </div>

        {error && <p className="text-[12px] text-red-500 font-bold">{error}</p>}

        <button
          onClick={submit}
          disabled={submitting}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[13px] font-bold text-white bg-emerald-600 disabled:opacity-60"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          ثبت تیکت
        </button>
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        پس از ثبت تیکت، در همان صفحه می‌توانید فایل ضمیمه کنید.
      </p>
    </div>
  );
}
