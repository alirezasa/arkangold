'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  User,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { useIdentity } from '@/app/hooks/useIdentity';

export default function IdentityPage() {
  const router = useRouter();
  const { loading, error, setError, resultStatus, resultMessage, submitIdentity } =
    useIdentity();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    nationalCode: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
  });

  const handleChange = (key: keyof typeof form, value: string) => {
    const numericFields = ['nationalCode', 'birthYear', 'birthMonth', 'birthDay'];
    const val = numericFields.includes(key) ? value.replace(/\D/g, '') : value;
    setForm((prev) => ({ ...prev, [key]: val }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // اعتبارسنجی کلاینت
    if (form.nationalCode.length !== 10)
      return setError('کد ملی باید ۱۰ رقم باشد');
    if (!form.birthYear || !form.birthMonth || !form.birthDay)
      return setError('تاریخ تولد را کامل وارد کنید');

    // تبدیل تاریخ شمسی به میلادی (ساده)
    const jYear = parseInt(form.birthYear);
    const jMonth = parseInt(form.birthMonth);
    const jDay = parseInt(form.birthDay);

    if (jYear < 1300 || jYear > 1420) return setError('سال تولد معتبر نیست');
    if (jMonth < 1 || jMonth > 12) return setError('ماه تولد معتبر نیست');
    if (jDay < 1 || jDay > 31) return setError('روز تولد معتبر نیست');

    // تبدیل ساده شمسی به میلادی
    const gYear = jYear + 621;
    const birthDate = `${gYear}-${String(jMonth).padStart(2, '0')}-${String(jDay).padStart(2, '0')}`;

    await submitIdentity({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      nationalCode: form.nationalCode,
      birthDate,
    });
  };

  // نتیجه نهایی
  if (resultStatus) {
    return (
      <div className="max-w-md mx-auto mt-8" dir="rtl">
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          {resultStatus === 'VERIFIED' ? (
            <>
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-xl font-black text-gray-900 mb-2">
                احراز هویت تایید شد
              </h2>
            </>
          ) : (
            <>
              <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-black text-gray-900 mb-2">
                در حال بررسی
              </h2>
            </>
          )}
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            {resultMessage}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--color-emerald)' }}
          >
            بازگشت به داشبورد
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-emerald-light)' }}
        >
          <ShieldCheck
            className="w-5 h-5"
            style={{ color: 'var(--color-emerald)' }}
          />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">احراز هویت</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            اطلاعات هویتی خود را وارد کنید
          </p>
        </div>
      </div>

      {/* نوتیس */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl mb-6 text-sm"
        style={{
          backgroundColor: '#fefce8',
          border: '1px solid #fef08a',
          color: '#854d0e',
        }}
      >
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          اطلاعات وارد شده با سامانه ثبت احوال کشور تطبیق داده می‌شود. لطفاً
          دقیقاً مطابق کارت ملی وارد کنید.
        </p>
      </div>

      {/* فرم */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl p-6 space-y-5"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm font-bold text-red-600 bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* نام و نام‌خانوادگی */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> نام
            </label>
            <input
              type="text"
              placeholder="علی"
              value={form.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl text-sm font-medium border border-gray-200 outline-none focus:border-gold-500 transition-all bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> نام‌خانوادگی
            </label>
            <input
              type="text"
              placeholder="محمدی"
              value={form.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              required
              className="w-full px-3 py-3 rounded-xl text-sm font-medium border border-gray-200 outline-none focus:border-gold-500 transition-all bg-white"
            />
          </div>
        </div>

        {/* کد ملی */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" /> کد ملی
          </label>
          <input
            type="tel"
            dir="ltr"
            placeholder="0012345678"
            maxLength={10}
            value={form.nationalCode}
            onChange={(e) => handleChange('nationalCode', e.target.value)}
            required
            className="w-full px-3 py-3 rounded-xl text-sm font-medium border border-gray-200 outline-none focus:border-gold-500 transition-all bg-white text-left tracking-widest"
          />
          <p className="text-[11px] text-gray-400">۱۰ رقم، بدون خط تیره</p>
        </div>

        {/* تاریخ تولد */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> تاریخ تولد (شمسی)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="tel"
                placeholder="روز"
                maxLength={2}
                value={form.birthDay}
                onChange={(e) => handleChange('birthDay', e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm font-medium border border-gray-200 outline-none focus:border-gold-500 transition-all bg-white text-center"
              />
              <p className="text-[10px] text-gray-400 text-center mt-1">روز</p>
            </div>
            <div>
              <input
                type="tel"
                placeholder="ماه"
                maxLength={2}
                value={form.birthMonth}
                onChange={(e) => handleChange('birthMonth', e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm font-medium border border-gray-200 outline-none focus:border-gold-500 transition-all bg-white text-center"
              />
              <p className="text-[10px] text-gray-400 text-center mt-1">ماه</p>
            </div>
            <div>
              <input
                type="tel"
                placeholder="سال"
                maxLength={4}
                value={form.birthYear}
                onChange={(e) => handleChange('birthYear', e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm font-medium border border-gray-200 outline-none focus:border-gold-500 transition-all bg-white text-center"
              />
              <p className="text-[10px] text-gray-400 text-center mt-1">سال</p>
            </div>
          </div>
        </div>

        {/* دکمه ارسال */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-emerald)' }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              تایید و ارسال اطلاعات
            </>
          )}
        </button>

        {/* لینک بعداً */}
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="w-full py-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
        >
          بعداً این کار را انجام می‌دهم
        </button>
      </form>
    </div>
  );
}
