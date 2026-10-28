"use client";
// admin/app/(dashboard)/livechat/reports/page.tsx — گزارش‌های چت آنلاین
import { useState } from "react";
import useSWR from "swr";
import { BarChart3, Loader2 } from "lucide-react";
import { DateRange, PageHeader, monthStartIso, todayIso } from "@/app/components/finance/ui";
import { cardStyle, fetcher } from "@/app/components/agents/ui";

interface Report {
  totals: {
    total: number;
    botOnly: number;
    withOperator: number;
    missed: number;
    offline: number;
    rated: number;
    avgRating: number | null;
    avgWaitSeconds: number | null;
    avgFirstResponseSeconds: number | null;
    avgDurationSeconds: number | null;
  };
  daily: { day: string; total: number; withOperator: number; missed: number }[];
  hourly: { hour: number; total: number }[];
  perOperator: { operatorId: string; name: string; conversations: number; messages: number; rated: number; avgRating: number | null; avgFirstResponseSeconds: number | null }[];
  ratingDistribution: Record<string, number>;
  topNodes: { id: string; label: string; hits: number }[];
  topKnowledge: { id: string; question: string; hits: number; helpful: number; notHelpful: number }[];
  unansweredOpen: number;
}

const fa = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("fa-IR", { maximumFractionDigits: d }));

function duration(sec: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${fa(sec)} ثانیه`;
  if (sec < 3600) return `${fa(Math.round(sec / 60))} دقیقه`;
  return `${fa(sec / 3600, 1)} ساعت`;
}

/** روزهای بدون گفتگو هم (با صفر) در نمودار می‌آیند تا محور زمان پیوسته باشد */
function fillDays(from: string, to: string, rows: Report["daily"]) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (!(days >= 0 && days <= 180)) return rows;
  return Array.from({ length: days + 1 }, (_, i) => {
    const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, total: 0, withOperator: 0, missed: 0 };
  });
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl p-4" style={cardStyle}>
      <p className="text-[11.5px] font-bold text-gray-500">{label}</p>
      <p className="mt-1 text-[22px] font-black text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-[10.5px] text-gray-400">{hint}</p>}
    </div>
  );
}

/** نمودار ستونی تک‌سری با راهنمای شناور (بدون کتابخانه) */
function Bars({ data, label }: { data: { key: string; label: string; value: number; detail?: string }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="relative" dir="ltr" role="img" aria-label={label}>
      <div className="flex h-44 items-end gap-[2px] border-b border-gray-200">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="relative flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="mx-auto w-full max-w-7 rounded-t-[4px] transition-opacity"
              style={{
                height: `${(d.value / max) * 100}%`,
                minHeight: d.value ? 2 : 0,
                backgroundColor: "var(--color-emerald)",
                opacity: hover == null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      {hover != null && data[hover] && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white shadow-lg"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
          dir="rtl"
        >
          <b>{data[hover].label}</b>: {fa(data[hover].value)} گفتگو
          {data[hover].detail && <span className="block opacity-80">{data[hover].detail}</span>}
        </div>
      )}
    </div>
  );
}

export default function LivechatReportsPage() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  // مرز روزها به وقت تهران
  const iso = (d: string, time: string) => {
    const v = new Date(`${d}T${time}+03:30`);
    return Number.isNaN(v.getTime()) ? null : v.toISOString();
  };
  const fromIso = iso(from, "00:00:00");
  const toIso = iso(to, "23:59:59");
  const { data, isLoading } = useSWR<Report>(
    fromIso && toIso ? `/api/admin/livechat/reports?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}` : null,
    fetcher,
  );

  const t = data?.totals;
  const ratingTotal = data ? Object.values(data.ratingDistribution).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader icon={BarChart3} title="گزارش‌های چت آنلاین" subtitle="حجم گفتگو، سرعت پاسخ، رضایت بازدیدکنندگان، عملکرد کارشناسان و پرکاربردترین پاسخ‌های ربات." />
      <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />

      {isLoading || !data || !t ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="کل گفتگوها" value={fa(t.total)} hint={`${fa(t.withOperator)} با کارشناس · ${fa(t.botOnly)} فقط ربات`} />
            <Tile label="میانگین انتظار در صف" value={duration(t.avgWaitSeconds)} />
            <Tile label="میانگین اولین پاسخ کارشناس" value={duration(t.avgFirstResponseSeconds)} />
            <Tile label="رضایت" value={t.avgRating ? `${fa(t.avgRating, 2)} از ۵` : "—"} hint={`${fa(t.rated)} امتیاز ثبت‌شده`} />
            <Tile label="پیام‌های آفلاین" value={fa(t.offline)} />
            <Tile label="گفتگوهای از دست‌رفته" value={fa(t.missed)} hint="بسته‌شده بدون پاسخ کارشناس" />
            <Tile label="میانگین مدت گفتگو" value={duration(t.avgDurationSeconds)} />
            <Tile label="پرسش‌های بی‌پاسخ ربات" value={fa(data.unansweredOpen)} hint="در پایگاه دانش" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="rounded-2xl p-4" style={cardStyle}>
              <h2 className="mb-4 text-[13px] font-black text-gray-800">گفتگوها در هر روز</h2>
              {data.daily.length ? (
                <Bars
                  label="تعداد گفتگو در هر روز"
                  data={fillDays(from, to, data.daily).map((d) => ({
                    key: d.day,
                    label: new Date(`${d.day}T12:00:00`).toLocaleDateString("fa-IR", { month: "short", day: "numeric" }),
                    value: d.total,
                    detail: `${fa(d.withOperator)} با کارشناس · ${fa(d.missed)} از دست‌رفته`,
                  }))}
                />
              ) : (
                <p className="py-10 text-center text-[12px] text-gray-400">داده‌ای نیست</p>
              )}
            </section>
            <section className="rounded-2xl p-4" style={cardStyle}>
              <h2 className="mb-4 text-[13px] font-black text-gray-800">ساعت‌های پرمراجعه (وقت تهران)</h2>
              <Bars
                label="تعداد گفتگو در هر ساعت شبانه‌روز"
                data={Array.from({ length: 24 }, (_, h) => ({
                  key: String(h),
                  label: `ساعت ${fa(h)}`,
                  value: data.hourly.find((x) => x.hour === h)?.total ?? 0,
                }))}
              />
            </section>
          </div>

          <section className="rounded-2xl p-4" style={cardStyle}>
            <h2 className="mb-3 text-[13px] font-black text-gray-800">عملکرد کارشناسان</h2>
            <div className="overflow-x-auto">
              <table className="admin-table w-full text-[12px]">
                <thead>
                  <tr>
                    <th>کارشناس</th>
                    <th>گفتگو</th>
                    <th>پیام</th>
                    <th>میانگین اولین پاسخ</th>
                    <th>رضایت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perOperator.map((o) => (
                    <tr key={o.operatorId}>
                      <td className="font-bold">{o.name}</td>
                      <td>{fa(o.conversations)}</td>
                      <td>{fa(o.messages)}</td>
                      <td>{duration(o.avgFirstResponseSeconds)}</td>
                      <td>{o.avgRating ? `${fa(o.avgRating, 2)} (${fa(o.rated)} رأی)` : "—"}</td>
                    </tr>
                  ))}
                  {!data.perOperator.length && (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-400">
                        داده‌ای نیست
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="rounded-2xl p-4" style={cardStyle}>
              <h2 className="mb-3 text-[13px] font-black text-gray-800">توزیع امتیازها</h2>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((r) => {
                  const n = data.ratingDistribution[String(r)] ?? 0;
                  return (
                    <div key={r} className="flex items-center gap-2 text-[12px]">
                      <span className="w-12 text-amber-500">{"★".repeat(r)}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${ratingTotal ? (n / ratingTotal) * 100 : 0}%`, backgroundColor: "var(--color-gold-500)" }} />
                      </div>
                      <span className="w-8 text-left font-bold text-gray-700">{fa(n)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="rounded-2xl p-4" style={cardStyle}>
              <h2 className="mb-3 text-[13px] font-black text-gray-800">پرکاربردترین گزینه‌های منو</h2>
              <ol className="space-y-1.5 text-[12px]">
                {data.topNodes.map((n) => (
                  <li key={n.id} className="flex justify-between gap-2">
                    <span className="truncate text-gray-700">{n.label}</span>
                    <b>{fa(n.hits)}</b>
                  </li>
                ))}
                {!data.topNodes.length && <li className="text-gray-400">—</li>}
              </ol>
            </section>
            <section className="rounded-2xl p-4" style={cardStyle}>
              <h2 className="mb-3 text-[13px] font-black text-gray-800">پرکاربردترین پاسخ‌های هوشمند</h2>
              <ol className="space-y-1.5 text-[12px]">
                {data.topKnowledge.map((k) => (
                  <li key={k.id} className="flex justify-between gap-2">
                    <span className="truncate text-gray-700">{k.question}</span>
                    <b title={`مفید: ${k.helpful} · نامفید: ${k.notHelpful}`}>{fa(k.hits)}</b>
                  </li>
                ))}
                {!data.topKnowledge.length && <li className="text-gray-400">—</li>}
              </ol>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
