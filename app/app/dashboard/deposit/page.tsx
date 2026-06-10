'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownCircle, Building2, Info, AlertCircle,
  CheckCircle2, Copy, ChevronRight, Loader2,
  CreditCard, ShieldAlert, ArrowLeft,
} from 'lucide-react';
import { useShebaDepositInfo, useDepositActions } from '@/app/hooks/useDeposit';
import { useLimitsGuide } from '@/app/hooks/useWallet';

// ── کامپوننت کپی ──
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
      style={{
        backgroundColor: copied ? '#dcfce7' : 'var(--color-bg-page)',
        color: copied ? '#16a34a' : 'var(--color-emerald)',
        border: `1px solid ${copied ? '#bbf7d0' : 'var(--color-border)'}`,
      }}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'کپی شد' : 'کپی'}
    </button>
  );
}

// ── تب واریز درگاه ──
function GatewayDepositTab() {
  const { limits, loading: limitsLoading } = useLimitsGuide();
  const { loading, error, setError, validateResult, validateAmount } = useDepositActions();

  const [rawAmount, setRawAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const numericAmount = Number(rawAmount.replace(/\D/g, ''));

  // اعتبارسنجی real-time
  const gatewayMin = limits?.deposit.gateway.min ?? 5000;
  const gatewayMax = limits?.deposit.gateway.max ?? 400_000_000;

  const amountError =
    rawAmount && numericAmount < gatewayMin
      ? `حداقل مبلغ ${gatewayMin.toLocaleString('fa-IR')} تومان است`
      : rawAmount && numericAmount > gatewayMax
      ? `سقف واریز درگاه ${gatewayMax.toLocaleString('fa-IR')} تومان است`
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numericAmount || amountError) return;
    const result = await validateAmount(numericAmount);
    if (result) setConfirmed(true);
  };

  if (limitsLoading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--color-emerald)' }} />
    </div>
  );

  if (confirmed && validateResult) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-emerald-light)' }}
        >
          <ArrowDownCircle className="w-8 h-8" style={{ color: 'var(--color-emerald)' }} />
        </div>
        <div>
          <h3 className="text-[17px] font-black text-gray-800">در حال اتصال به درگاه</h3>
          <p className="text-[13px] text-gray-500 mt-1">
            مبلغ {validateResult.amountFormatted} تومان
          </p>
        </div>
        <div className="w-full rounded-2xl p-4 bg-amber-50 border border-amber-100 text-right">
          <p className="text-[12px] font-bold text-amber-800 mb-2">⚠️ قبل از پرداخت توجه کنید:</p>
          <ul className="space-y-1.5">
            {limits?.deposit.gateway.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        </div>
        <button
          className="w-full py-4 rounded-2xl font-black text-white text-[14px]"
          style={{ backgroundColor: 'var(--color-emerald)' }}
          onClick={() => {
            // TODO: redirect به درگاه واقعی
            alert('اتصال به درگاه پرداخت — به زودی فعال می‌شود');
          }}
        >
          ورود به درگاه پرداخت
        </button>
        <button
          onClick={() => { setConfirmed(false); setRawAmount(''); }}
          className="text-[13px] font-bold text-gray-400 hover:text-gray-600"
        >
          ویرایش مبلغ
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* سقف‌ها */}
      {limits && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 bg-green-50 border border-green-100">
            <p className="text-[11px] font-bold text-green-600 mb-1">حداقل واریز</p>
            <p className="text-[16px] font-black text-green-800">
              {limits.deposit.gateway.minFormatted}
              <span className="text-[11px] mr-1 font-bold">تومان</span>
            </p>
          </div>
          <div className="rounded-2xl p-4 bg-blue-50 border border-blue-100">
            <p className="text-[11px] font-bold text-blue-600 mb-1">سقف واریز</p>
            <p className="text-[16px] font-black text-blue-800">
              {limits.deposit.gateway.maxFormatted}
              <span className="text-[11px] mr-1 font-bold">تومان</span>
            </p>
          </div>
        </div>
      )}

      {/* ورودی مبلغ */}
      <div className="space-y-2">
        <label className="text-[13px] font-black text-gray-700">مبلغ واریز (تومان)</label>
        <div className="relative">
          <input
            ref={inputRef}
            type="tel"
            dir="ltr"
            placeholder="مثلاً ۱,۰۰۰,۰۰۰"
            value={numericAmount ? numericAmount.toLocaleString('fa-IR') : ''}
            onChange={(e) => {
              setRawAmount(e.target.value.replace(/\D/g, ''));
              if (error) setError(null);
            }}
            className={`w-full px-4 py-4 rounded-2xl text-[18px] font-black border-2 outline-none transition-all text-left bg-white ${
              amountError
                ? 'border-red-300 focus:border-red-400'
                : rawAmount && !amountError
                ? 'border-green-300 focus:border-green-400'
                : 'border-gray-100 focus:border-[#c5a059]'
            }`}
          />
          {rawAmount && !amountError && (
            <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
          )}
          {amountError && (
            <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-400" />
          )}
        </div>

        {/* خطا یا راهنما */}
        {amountError ? (
          <p className="text-[12px] font-bold text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {amountError}
          </p>
        ) : rawAmount && numericAmount > 0 ? (
          <p className="text-[12px] font-bold text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            مبلغ معتبر است
          </p>
        ) : (
          <p className="text-[12px] text-gray-400">
            مبلغ را به تومان وارد کنید
          </p>
        )}
      </div>

      {/* مبالغ پیشنهادی */}
      <div className="space-y-2">
        <p className="text-[12px] font-bold text-gray-400">مبالغ پیشنهادی</p>
        <div className="grid grid-cols-3 gap-2">
          {[500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 50_000_000].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => {
                setRawAmount(String(amt));
                if (error) setError(null);
              }}
              className={`py-2.5 rounded-xl text-[12px] font-bold transition-all border ${
                numericAmount === amt
                  ? 'border-[#c5a059] text-white'
                  : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'
              }`}
              style={numericAmount === amt ? { backgroundColor: 'var(--color-emerald)' } : {}}
            >
              {(amt / 1_000_000) >= 1
                ? `${amt / 1_000_000}م`
                : `${amt / 1000}ه`}
            </button>
          ))}
        </div>
      </div>

      {/* خطای API */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-[13px] font-bold text-red-600 bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* نکات */}
      {limits && (
        <div className="rounded-xl p-4 bg-amber-50 border border-amber-100">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-amber-600" />
            <p className="text-[12px] font-black text-amber-800">نکات مهم</p>
          </div>
          <ul className="space-y-1.5">
            {limits.deposit.gateway.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-amber-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !!amountError || !numericAmount}
        className="w-full py-4 rounded-2xl font-black text-white text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        style={{ backgroundColor: 'var(--color-emerald)' }}
      >
        {loading
          ? <Loader2 className="w-5 h-5 animate-spin" />
          : <><ArrowDownCircle className="w-5 h-5" /> ادامه و ورود به درگاه</>}
      </button>
    </form>
  );
}

// ── تب واریز شبا ──
function ShebaDepositTab() {
  const { info, loading, error } = useShebaDepositInfo();
  const [shebaVisible, setShebaVisible] = useState(false);
  const [warningsAccepted, setWarningsAccepted] = useState(false);

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--color-emerald)' }} />
    </div>
  );

  if (error || !info) return (
    <div className="text-center py-12 text-red-500 font-bold">{error}</div>
  );

  return (
    <div className="space-y-4">
      {/* چک کارت ثبت‌شده */}
      {!info.hasVerifiedCard && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
          <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-black text-red-700">کارت بانکی تایید‌شده ندارید</p>
            <p className="text-[12px] text-red-600 mt-1">
              برای واریز شبا باید حداقل یک کارت بانکی تایید‌شده داشته باشید.
            </p>
          </div>
        </div>
      )}

      {/* کارت‌های ثبت‌شده */}
      {info.hasVerifiedCard && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-[12px] font-black text-gray-700 mb-3">کارت‌های مجاز برای واریز</p>
          <div className="space-y-2">
            {info.verifiedCards.map((card) => (
              <div key={card.id} className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-xl">
                <CreditCard className="w-4 h-4 text-green-600 shrink-0" />
                <div>
                  <p className="text-[13px] font-bold text-gray-800">{card.bankName}</p>
                  <p className="text-[11px] text-gray-500 font-mono" dir="ltr">**** {card.cardLast4}</p>
                </div>
                {card.isDefault && (
                  <span className="mr-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#fdf6e7', color: '#c5a059' }}>
                    پیش‌فرض
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* مراحل */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-[13px] font-black text-gray-800 mb-4">مراحل واریز مستقیم</p>
        <div className="space-y-4">
          {info.instructions.map((inst) => (
            <div key={inst.step} className="flex items-start gap-3">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black shrink-0"
                style={{
                  backgroundColor: 'var(--color-emerald-light)',
                  color: 'var(--color-emerald)',
                }}
              >
                {inst.step}
              </span>
              <p className="text-[13px] text-gray-600 font-medium leading-relaxed pt-1">
                {inst.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* هشدارها + تیک قبول */}
      <div className="rounded-2xl p-4 bg-red-50 border border-red-100 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-[13px] font-black text-red-700">قوانین مهم</p>
        </div>
        <ul className="space-y-2">
          {info.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px] text-red-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={warningsAccepted}
            onChange={(e) => setWarningsAccepted(e.target.checked)}
            className="w-4 h-4 rounded accent-emerald-700"
          />
          <span className="text-[12px] font-bold text-red-700">
            تمامی موارد بالا را خوانده‌ام و قبول می‌کنم
          </span>
        </label>
      </div>

      {/* نمایش شبا */}
      {!shebaVisible ? (
        <button
          disabled={!warningsAccepted || !info.hasVerifiedCard}
          onClick={() => setShebaVisible(true)}
          className="w-full py-4 rounded-2xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          style={{ backgroundColor: 'var(--color-emerald)' }}
        >
          <Building2 className="w-5 h-5" />
          نمایش اطلاعات حساب مقصد
        </button>
      ) : (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ backgroundColor: 'var(--color-surface)', border: '2px solid var(--color-gold-500)' }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <p className="text-[14px] font-black text-gray-800">اطلاعات حساب مقصد</p>
          </div>

          {/* نام بانک */}
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ backgroundColor: 'var(--color-bg-page)' }}>
            <div>
              <p className="text-[11px] text-gray-400 font-bold mb-0.5">نام بانک</p>
              <p className="text-[15px] font-black text-gray-800">{info.platformBankName}</p>
            </div>
          </div>

          {/* شبا */}
          <div className="flex items-center justify-between p-3 rounded-xl"
            style={{ backgroundColor: 'var(--color-bg-page)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 font-bold mb-0.5">شماره شبا</p>
              <p className="text-[14px] font-black text-gray-800 font-mono tracking-wider" dir="ltr">
                {info.platformSheba}
              </p>
            </div>
            <CopyBtn text={info.platformSheba} />
          </div>

          {/* حداقل مبلغ */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-[12px] text-blue-700 font-medium">
              حداقل مبلغ واریز از این روش:{' '}
              <span className="font-black">{info.minAmountFormatted} تومان</span>
            </p>
          </div>

          <p className="text-[11px] text-gray-400 text-center">
            پس از واریز، موجودی شما تا یک روز کاری شارژ می‌شود
          </p>
        </div>
      )}
    </div>
  );
}

// ── صفحه اصلی ──
export default function DepositPage() {
  const router = useRouter();
  const [method, setMethod] = useState<'gateway' | 'sheba'>('gateway');

  return (
    <div className="max-w-lg mx-auto space-y-5" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/wallet')}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors"
          style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-emerald-light)' }}
          >
            <ArrowDownCircle className="w-5 h-5" style={{ color: 'var(--color-emerald)' }} />
          </div>
          <div>
            <h1 className="text-[17px] font-black text-gray-900">افزایش موجودی</h1>
            <p className="text-[11px] text-gray-400">واریز ریال به کیف پول</p>
          </div>
        </div>
      </div>

      {/* انتخاب روش */}
      <div
        className="flex p-1.5 rounded-2xl gap-1"
        style={{ backgroundColor: 'var(--color-bg-page)' }}
      >
        <button
          onClick={() => setMethod('gateway')}
          className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
            method === 'gateway' ? 'text-white shadow-sm' : 'text-gray-500'
          }`}
          style={method === 'gateway' ? { backgroundColor: 'var(--color-emerald)' } : {}}
        >
          <CreditCard className="w-4 h-4" />
          درگاه پرداخت
        </button>
        <button
          onClick={() => setMethod('sheba')}
          className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
            method === 'sheba' ? 'text-white shadow-sm' : 'text-gray-500'
          }`}
          style={method === 'sheba' ? { backgroundColor: 'var(--color-emerald)' } : {}}
        >
          <Building2 className="w-4 h-4" />
          واریز با شبا
        </button>
      </div>

      {/* محتوا */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {method === 'gateway' ? <GatewayDepositTab /> : <ShebaDepositTab />}
      </div>

      {/* لینک به کیف پول */}
      <button
        onClick={() => router.push('/dashboard/wallet')}
        className="w-full flex items-center justify-between p-4 rounded-2xl text-[13px] font-bold text-gray-500 hover:text-gray-700 transition-colors"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <span>بازگشت به کیف پول</span>
        <ArrowLeft className="w-4 h-4" />
      </button>
    </div>
  );
}