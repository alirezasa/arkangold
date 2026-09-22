'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  ScanLine,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  ArrowLeft,
} from 'lucide-react';

interface VerifyResult {
  status: 'INVALID_CODE' | 'VALID_UNASSIGNED' | 'VALID_ASSIGNED';
  message: string;
  product?: {
    weightGrams: string | null;
    purityKarat: string | null;
    factorySerialNumber: string | null;
    batchNumber: string;
  };
  owner?: {
    fullName: string;
    nationalCode: string;
    ownershipStartAt: string;
  } | null;
}

export default function PublicHologramVerifyPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{8}$/.test(code)) {
      setError('کد هولوگرام باید دقیقاً ۸ رقم باشد');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await axios.post('/api/public/hologram/verify', { code });
      setResult(res.data as VerifyResult);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined;
        setError(data?.message ?? 'خطا در استعلام. لطفاً دوباره تلاش کنید');
      } else {
        setError('خطای ناشناخته‌ای رخ داد');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-emerald-light)' }}
          >
            <ScanLine className="w-6 h-6" style={{ color: 'var(--color-emerald)' }} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-black text-gray-900">اصالت‌سنجی شمش طلا</h1>
            <p className="text-[11px] text-gray-400">آرکان گلد</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <label className="block text-xs font-bold text-gray-500">
            کد ۸ رقمی چاپ‌شده روی هولوگرام
          </label>
          <input
            type="tel"
            dir="ltr"
            inputMode="numeric"
            maxLength={8}
            placeholder="12345678"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-4 py-3.5 rounded-xl text-center text-[20px] font-black tracking-[0.3em] border border-gray-200 outline-none focus:border-gold-500 bg-white"
          />
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-[12px] font-bold text-red-600 bg-red-50 border border-red-100">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-emerald)' }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'استعلام اصالت'}
          </button>
        </form>

        {result && (
          <div
            className="mt-4 rounded-2xl p-6 text-center"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            {result.status === 'VALID_ASSIGNED' && (
              <>
                <ShieldCheck className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                <h2 className="text-[16px] font-black text-gray-900 mb-1">اصالت تأیید شد</h2>
                <p className="text-[12px] text-gray-400 mb-4">{result.message}</p>
                <div className="text-right space-y-1.5 text-[13px] text-gray-600 bg-gray-50 rounded-xl p-4">
                  {result.product?.weightGrams && (
                    <p>
                      وزن: <b>{Number(result.product.weightGrams).toLocaleString('fa-IR')} گرم</b>
                    </p>
                  )}
                  {result.product?.purityKarat && (
                    <p>
                      عیار: <b>{result.product.purityKarat === 'K18' ? '۱۸' : '۲۴'}</b>
                    </p>
                  )}
                  {result.owner && (
                    <>
                      <p>
                        مالک: <b>{result.owner.fullName}</b>
                      </p>
                      <p dir="ltr" className="text-left">
                        کدملی: <b>{result.owner.nationalCode}</b>
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
            {result.status === 'VALID_UNASSIGNED' && (
              <>
                <ShieldQuestion className="w-14 h-14 text-gray-400 mx-auto mb-3" />
                <h2 className="text-[16px] font-black text-gray-900 mb-1">تخصیص‌نیافته</h2>
                <p className="text-[12px] text-gray-400">{result.message}</p>
              </>
            )}
            {result.status === 'INVALID_CODE' && (
              <>
                <ShieldAlert className="w-14 h-14 text-red-500 mx-auto mb-3" />
                <h2 className="text-[16px] font-black text-gray-900 mb-1">کد نامعتبر</h2>
                <p className="text-[12px] text-gray-400">{result.message}</p>
              </>
            )}
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-gray-600"
          >
            ورود به پنل کاربری
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
