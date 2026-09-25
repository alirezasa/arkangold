// admin/app/(dashboard)/accounting/fiscal-years/page.tsx — سال مالی، قفل دوره و قطعی‌سازی
"use client";
import { useState } from "react";
import useSWR from "swr";
import { CalendarRange, Lock, Plus } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  Field,
  Modal,
  PageHeader,
  Spinner,
  Table,
  api,
  cardStyle,
  faDate,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

interface Years {
  lockedUntil: string | null;
  data: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    status: string;
    closedAt: string | null;
    journalCount: number;
    finalizedCount: number;
  }[];
}

const STATUS = {
  OPEN: { label: "باز", cls: "bg-green-50 text-green-700" },
  CLOSED: { label: "بسته‌شده", cls: "bg-gray-100 text-gray-500" },
};

export default function FiscalYearsPage() {
  const can = usePerm();
  const { data, isLoading, mutate } = useSWR<Years>("/api/admin/accounting/fiscal-years", fetcher);
  const act = useAction();
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [lock, setLock] = useState("");
  const [finalizeTo, setFinalizeTo] = useState("");
  const manage = can("accounting.period.manage");

  const create = async () => {
    const ok = await act.run(() => api.post("/api/admin/accounting/fiscal-years", { title, startDate: start, endDate: end }));
    if (ok) {
      setModal(false);
      void mutate();
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CalendarRange}
        title="سال مالی و قفل دوره"
        subtitle="تعریف سال مالی، قفل کردن دوره‌های گذشته، قطعی‌سازی اسناد (شماره‌ی دائم ترتیبی و بدون فاصله) و بستن حساب‌های موقت در پایان سال"
        actions={
          manage && (
            <ActionButton onClick={() => setModal(true)}>
              <Plus className="w-4 h-4" /> سال مالی جدید
            </ActionButton>
          )
        }
      />
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <p className="font-black text-[13px] flex items-center gap-2">
                <Lock className="w-4 h-4" /> قفل دوره
              </p>
              <p className="text-[12px] text-gray-500">
                وضعیت فعلی: {data.lockedUntil ? `ثبت سند دستی تا پایان ${faDate(data.lockedUntil)} ممنوع است` : "بدون قفل"}
              </p>
              {manage && (
                <div className="flex flex-wrap items-end gap-2">
                  <input type="date" value={lock} onChange={(e) => setLock(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" dir="ltr" />
                  <ActionButton
                    variant="secondary"
                    busy={act.busy}
                    onClick={() => void act.run(() => api.post("/api/admin/accounting/lock-date", { date: lock || null }), lock ? `دوره تا ${lock} قفل شود؟` : "قفل برداشته شود؟").then(() => mutate())}
                  >
                    {lock ? "قفل تا این تاریخ" : "برداشتن قفل"}
                  </ActionButton>
                </div>
              )}
            </div>
            <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <p className="font-black text-[13px]">قطعی‌سازی اسناد</p>
              <p className="text-[12px] text-gray-500">
                به اسناد تا تاریخ انتخابی به ترتیب تاریخ، شماره‌ی قطعی داده و دوره تا همان تاریخ قفل می‌شود (مطابق الزام دفاتر قانونی).
              </p>
              {manage && (
                <div className="flex flex-wrap items-end gap-2">
                  <input type="date" value={finalizeTo} onChange={(e) => setFinalizeTo(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" dir="ltr" />
                  <ActionButton
                    variant="secondary"
                    busy={act.busy}
                    disabled={!finalizeTo}
                    onClick={() =>
                      void act
                        .run(() => api.post("/api/admin/accounting/finalize", { upTo: finalizeTo }), `اسناد تا ${finalizeTo} قطعی و دوره قفل شود؟ این عمل برگشت‌پذیر نیست.`)
                        .then(() => mutate())
                    }
                  >
                    قطعی‌سازی
                  </ActionButton>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}>
            <Table>
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>از</th>
                  <th>تا</th>
                  <th>اسناد</th>
                  <th>قطعی‌شده</th>
                  <th>وضعیت</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((y) => (
                  <tr key={y.id}>
                    <td className="font-bold">{y.title}</td>
                    <td>{faDate(y.startDate)}</td>
                    <td>{faDate(y.endDate)}</td>
                    <td>{y.journalCount.toLocaleString("fa-IR")}</td>
                    <td>{y.finalizedCount.toLocaleString("fa-IR")}</td>
                    <td>
                      <Badge map={STATUS} value={y.status} />
                    </td>
                    <td>
                      {manage && y.status === "OPEN" && new Date(y.endDate) < new Date() && (
                        <button
                          type="button"
                          className="text-[11px] font-bold text-purple-700"
                          onClick={() =>
                            void act
                              .run(
                                () => api.post(`/api/admin/accounting/fiscal-years/${y.id}/close`),
                                `سال مالی «${y.title}» بسته شود؟ مانده‌ی درآمدها و هزینه‌ها به سود (زیان) انباشته منتقل و دوره قفل می‌شود. پیشنهاد: ابتدا ارزیابی طلا را ثبت کنید.`,
                              )
                              .then(() => mutate())
                          }
                        >
                          بستن سال
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!data.data.length && <p className="text-center text-[12px] text-gray-400 py-6">هنوز سال مالی تعریف نشده است</p>}
          </div>
        </>
      )}
      {modal && (
        <Modal title="تعریف سال مالی" onClose={() => setModal(false)}>
          <Field label="عنوان">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="سال مالی ۱۴۰۵" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاریخ شروع" hint="مثلاً ۱ فروردین = 2026-03-21">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="تاریخ پایان">
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} dir="ltr" />
            </Field>
          </div>
          {act.error && <Alert kind="error" text={act.error} />}
          <ActionButton onClick={create} busy={act.busy} disabled={!title || !start || !end}>
            ثبت
          </ActionButton>
        </Modal>
      )}
    </div>
  );
}
