// admin/app/components/zarpayesh/LogsTab.tsx
//
// لاگ کامل فراخوانی‌های سامانه ناظر و جدول کدهای خطای مستند
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Empty, Pagination, Spinner, Table, fetcher, inputCls } from "@/app/components/finance/ui";
import { API, METHODS, Section, useOverview } from "./shared";
import { LogItem } from "./TradesTab";

export default function LogsTab() {
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState("");
  const [success, setSuccess] = useState("");
  const [q, setQ] = useState("");
  const params = new URLSearchParams({ page: String(page), limit: "30" });
  if (method) params.set("method", method);
  if (success) params.set("success", success);
  if (q.trim()) params.set("q", q.trim());
  const { data } = useSWR<{ data: Parameters<typeof LogItem>[0]["log"][]; total: number; totalPages: number }>(
    `${API}/logs?${params}`,
    fetcher,
    { refreshInterval: 15000 },
  );
  return (
    <div className="space-y-4">
      <Section title={`لاگ فراخوانی‌ها${data ? ` (${data.total.toLocaleString("fa-IR")})` : ""}`}>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={inputCls} value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}>
            <option value="">همه‌ی متدها</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select className={inputCls} value={success} onChange={(e) => { setSuccess(e.target.value); setPage(1); }}>
            <option value="">موفق و ناموفق</option>
            <option value="true">فقط موفق</option>
            <option value="false">فقط ناموفق</option>
          </select>
          <input
            dir="ltr"
            className={inputCls}
            placeholder="srcTrackingNumber یا کد خطا (مثلاً TIMEOUT)"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <p className="text-[11px] text-gray-400">
          کد ملی و موبایل فقط پوشانده ذخیره می‌شوند؛ رمز عبور و توکن‌ها هرگز در لاگ ثبت نمی‌شوند. نگهداری: ۲ سال.
        </p>
        {!data ? (
          <Spinner />
        ) : data.data.length === 0 ? (
          <Empty text="فراخوانی‌ای ثبت نشده است" />
        ) : (
          <div className="space-y-1.5">
            {data.data.map((l) => (
              <LogItem key={l.id} log={l} />
            ))}
          </div>
        )}
        {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}
      </Section>
      <ErrorCodes />
    </div>
  );
}

function ErrorCodes() {
  const { data } = useOverview();
  const errors = Object.entries(data?.reference.errors ?? {});
  return (
    <Section title="کدهای خطای سامانه ناظر (مستند ۳.۰.۰.۴)">
      <Table>
        <thead>
          <tr>
            <th>کد</th>
            <th>شرح</th>
          </tr>
        </thead>
        <tbody>
          {errors.map(([code, text]) => (
            <tr key={code}>
              <td dir="ltr" className="font-mono">
                {code}
              </td>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Section>
  );
}
