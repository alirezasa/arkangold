'use client';

import { useState } from 'react';
import useSWR from 'swr';
import axios from 'axios';
import {
  ScanLine,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  Gift,
  Inbox,
  X,
  User,
  CreditCard,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { jalaliToIsoDate } from '@/app/utils/jalali';

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

interface HologramOwnershipItem {
  id: string;
  fullName: string;
  nationalCode: string;
  ownershipStartAt: string;
  hologramCode: {
    id: string;
    code: string;
    weightGrams: string | null;
    purityKarat: 'K18' | 'K24' | null;
    factorySerialNumber: string | null;
    batch: { batchNumber: string };
  };
}

interface TransferRequestItem {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  transferType: 'INITIAL_PURCHASE' | 'GIFT_TRANSFER' | 'SALE_TRANSFER';
  requestedAt: string;
  expiresAt: string;
  hologramCode: {
    code: string;
    weightGrams: string | null;
    purityKarat: 'K18' | 'K24' | null;
    batch: { batchNumber: string };
  };
}

interface VerifyResult {
  status: 'INVALID_CODE' | 'VALID_UNASSIGNED' | 'VALID_ASSIGNED';
  message: string;
  product?: { weightGrams: string | null; purityKarat: string | null; batchNumber: string };
  owner?: { fullName: string; nationalCode: string; ownershipStartAt: string } | null;
}

const TABS = [
  { key: 'mine', label: 'شمش‌های من' },
  { key: 'verify', label: 'استعلام کد' },
  { key: 'incoming', label: 'تأیید و انتقال مالکیت' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">{title}</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────── شمش‌های من ───────────────────────────

function TransferInitiateModal({
  hologramCodeId,
  code,
  onClose,
  onDone,
}: {
  hologramCodeId: string;
  code: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!/^09\d{9}$/.test(phone)) return setError('شماره موبایل گیرنده معتبر نیست');
    setLoading(true);
    setError(null);
    try {
      await axios.post(
        '/api/user/hologram/transfer-requests',
        { hologramCodeId, recipientPhoneNumber: phone },
        { headers: { 'idempotency-key': crypto.randomUUID?.() ?? String(Date.now()) } },
      );
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'خطا در آغاز انتقال مالکیت'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`انتقال مالکیت شمش ${code}`} onClose={onClose}>
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        گیرنده باید ظرف مهلت تعیین‌شده، از پنل کاربری خود، انتقال را با احراز هویت تأیید کند؛ در غیر این‌صورت انتقال منقضی و شمش نزد شما باقی می‌ماند.
      </p>
      <input
        type="tel"
        dir="ltr"
        placeholder="شماره موبایل گیرنده"
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        maxLength={11}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
      />
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: 'var(--color-emerald)' }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'ارسال درخواست انتقال'}
      </button>
    </Modal>
  );
}

function MyHologramsTab() {
  const { data, isLoading, mutate } = useSWR<{ data: HologramOwnershipItem[] }>(
    '/api/user/hologram/my-holograms',
    fetcher,
  );
  const [transferTarget, setTransferTarget] = useState<HologramOwnershipItem | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!data?.data?.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <ScanLine className="w-10 h-10 text-gray-200" />
        <p className="text-[13px] text-gray-400">هنوز شمشی به نام شما ثبت نشده است</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.data.map((o) => (
        <div
          key={o.id}
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span dir="ltr" className="text-[16px] font-black text-gray-900">
              {o.hologramCode.code}
            </span>
            <span className="text-[11px] text-gray-400">دسته {o.hologramCode.batch.batchNumber}</span>
          </div>
          {o.hologramCode.weightGrams && (
            <p className="text-[13px] text-gray-600">
              {Number(o.hologramCode.weightGrams).toLocaleString('fa-IR')} گرم
              {o.hologramCode.purityKarat && ` — عیار ${o.hologramCode.purityKarat === 'K18' ? '۱۸' : '۲۴'}`}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            تاریخ مالکیت: {new Date(o.ownershipStartAt).toLocaleDateString('fa-IR')}
          </p>
          <button
            onClick={() => setTransferTarget(o)}
            className="flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-[12px] font-bold border-2 border-gray-200 text-gray-700"
          >
            <Gift className="w-3.5 h-3.5" /> انتقال مالکیت
          </button>
        </div>
      ))}

      {transferTarget && (
        <TransferInitiateModal
          hologramCodeId={transferTarget.hologramCode.id}
          code={transferTarget.hologramCode.code}
          onClose={() => setTransferTarget(null)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}

// ─────────────────────────── استعلام کد ───────────────────────────

function VerifyTab() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const submit = async () => {
    if (!/^\d{8}$/.test(code)) return setError('کد هولوگرام باید دقیقاً ۸ رقم باشد');
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post('/api/user/hologram/verify', { code });
      setResult(res.data as VerifyResult);
    } catch (err) {
      setError(getErrorMessage(err, 'خطا در استعلام'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <input
          type="tel"
          dir="ltr"
          inputMode="numeric"
          maxLength={8}
          placeholder="12345678"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full px-4 py-3.5 rounded-xl text-center text-[18px] font-black tracking-[0.3em] border border-gray-200 outline-none focus:border-gold-500"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-emerald)' }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'استعلام اصالت'}
        </button>
      </div>

      {result && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {result.status === 'VALID_ASSIGNED' && (
            <>
              <ShieldCheck className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-[15px] font-black text-gray-900 mb-1">اصالت تأیید شد</h2>
              <div className="text-right space-y-1.5 text-[13px] text-gray-600 bg-gray-50 rounded-xl p-4 mt-3">
                {result.product?.weightGrams && (
                  <p>وزن: <b>{Number(result.product.weightGrams).toLocaleString('fa-IR')} گرم</b></p>
                )}
                {result.owner && (
                  <>
                    <p>مالک: <b>{result.owner.fullName}</b></p>
                    <p dir="ltr" className="text-left">کدملی: <b>{result.owner.nationalCode}</b></p>
                  </>
                )}
              </div>
            </>
          )}
          {result.status === 'VALID_UNASSIGNED' && (
            <>
              <ShieldQuestion className="w-14 h-14 text-gray-400 mx-auto mb-3" />
              <h2 className="text-[15px] font-black text-gray-900">تخصیص‌نیافته</h2>
            </>
          )}
          {result.status === 'INVALID_CODE' && (
            <>
              <ShieldAlert className="w-14 h-14 text-red-500 mx-auto mb-3" />
              <h2 className="text-[15px] font-black text-gray-900">کد نامعتبر</h2>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── تأیید و انتقال مالکیت ───────────────────────────

function ConfirmTransferModal({
  request,
  onClose,
  onDone,
}: {
  request: TransferRequestItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    nationalCode: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const set = (key: keyof typeof form, value: string) => {
    const numeric = ['nationalCode', 'birthYear', 'birthMonth', 'birthDay'];
    setForm((prev) => ({ ...prev, [key]: numeric.includes(key) ? value.replace(/\D/g, '') : value }));
  };

  const submit = async () => {
    if (form.nationalCode.length !== 10) return setError('کد ملی باید ۱۰ رقم باشد');
    if (!form.birthYear || !form.birthMonth || !form.birthDay) return setError('تاریخ تولد را کامل وارد کنید');
    setLoading(true);
    setError(null);
    try {
      const birthDate = jalaliToIsoDate(Number(form.birthYear), Number(form.birthMonth), Number(form.birthDay));
      await axios.post(`/api/user/hologram/transfer-requests/${request.id}/confirm`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        nationalCode: form.nationalCode,
        birthDate,
      });
      setSuccess(true);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, 'خطا در تأیید انتقال — احراز هویت ناموفق بود'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Modal title="تأیید شد" onClose={onClose}>
        <div className="text-center py-4">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
          <p className="text-[13px] text-gray-600">
            انتقال مالکیت شمش {request.hologramCode.code} با موفقیت تأیید شد و اکنون در «شمش‌های من» قابل مشاهده است.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`تأیید مالکیت شمش ${request.hologramCode.code}`} onClose={onClose}>
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        برای تأیید مالکیت، اطلاعات هویتی خود را دقیقاً مطابق کارت ملی وارد کنید.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="نام"
          value={form.firstName}
          onChange={(e) => set('firstName', e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
        />
        <input
          placeholder="نام‌خانوادگی"
          value={form.lastName}
          onChange={(e) => set('lastName', e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
          <CreditCard className="w-3.5 h-3.5" /> کد ملی
        </label>
        <input
          dir="ltr"
          maxLength={10}
          value={form.nationalCode}
          onChange={(e) => set('nationalCode', e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" /> تاریخ تولد (شمسی)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <input
            placeholder="روز"
            maxLength={2}
            value={form.birthDay}
            onChange={(e) => set('birthDay', e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm text-center"
          />
          <input
            placeholder="ماه"
            maxLength={2}
            value={form.birthMonth}
            onChange={(e) => set('birthMonth', e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm text-center"
          />
          <input
            placeholder="سال"
            maxLength={4}
            value={form.birthYear}
            onChange={(e) => set('birthYear', e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm text-center"
          />
        </div>
      </div>
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--color-emerald)' }}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (<><User className="w-4 h-4" /> تأیید و دریافت مالکیت</>)}
      </button>
    </Modal>
  );
}

function IncomingTab() {
  const { data, isLoading, mutate } = useSWR<TransferRequestItem[]>(
    '/api/user/hologram/transfer-requests/incoming',
    fetcher,
  );
  const [confirmTarget, setConfirmTarget] = useState<TransferRequestItem | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const reject = async (id: string) => {
    if (!confirm('آیا از رد این درخواست انتقال مطمئنید؟')) return;
    setRejectingId(id);
    try {
      await axios.post(`/api/user/hologram/transfer-requests/${id}/reject`, {});
      mutate();
    } finally {
      setRejectingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Inbox className="w-10 h-10 text-gray-200" />
        <p className="text-[13px] text-gray-400">درخواست انتقال در انتظاری برای شما وجود ندارد</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <div
          key={r.id}
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span dir="ltr" className="text-[15px] font-black text-gray-900">
              {r.hologramCode.code}
            </span>
            <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>
              در انتظار تأیید شما
            </span>
          </div>
          {r.hologramCode.weightGrams && (
            <p className="text-[12px] text-gray-600">
              {Number(r.hologramCode.weightGrams).toLocaleString('fa-IR')} گرم
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            مهلت تأیید: {new Date(r.expiresAt).toLocaleString('fa-IR')}
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setConfirmTarget(r)}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-black text-white"
              style={{ backgroundColor: 'var(--color-emerald)' }}
            >
              تأیید و دریافت مالکیت
            </button>
            <button
              onClick={() => reject(r.id)}
              disabled={rejectingId === r.id}
              className="px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-red-100 text-red-600 disabled:opacity-60"
            >
              {rejectingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'رد کردن'}
            </button>
          </div>
        </div>
      ))}

      {confirmTarget && (
        <ConfirmTransferModal
          request={confirmTarget}
          onClose={() => setConfirmTarget(null)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}

// ─────────────────────────── صفحه اصلی ───────────────────────────

export default function HologramDashboardPage() {
  const [tab, setTab] = useState<TabKey>('mine');

  return (
    <div className="max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-emerald-light)' }}
        >
          <ScanLine className="w-5 h-5" style={{ color: 'var(--color-emerald)' }} />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">اصالت‌سنجی و مالکیت شمش</h1>
          <p className="text-xs text-gray-400 mt-0.5">مدیریت شمش‌های طلای شما</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap"
            style={
              tab === t.key
                ? { backgroundColor: 'var(--color-emerald)', color: '#fff' }
                : { backgroundColor: 'var(--color-surface)', color: '#6b7280', border: '1px solid var(--color-border)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mine' && <MyHologramsTab />}
      {tab === 'verify' && <VerifyTab />}
      {tab === 'incoming' && <IncomingTab />}
    </div>
  );
}
