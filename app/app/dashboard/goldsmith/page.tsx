"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ChevronRight, 
  Upload, 
  Sparkles, 
  PenTool, 
  ClipboardList, 
  Hammer, 
  Truck,
  Image as ImageIcon
} from "lucide-react";

export default function GoldsmithPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    budget: "",
  });

  // هندلر ارسال فرم (در آینده به API شما متصل می‌شود)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // شبیه‌سازی درخواست به سرور
    setTimeout(() => {
      setIsSubmitting(false);
      alert("سفارش شما با موفقیت ثبت شد و در اسرع وقت بررسی می‌گردد.");
    }, 1500);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      
      {/* ── هدر صفحه ── */}
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/dashboard" 
          className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[20px] font-black text-gray-800">زرگری و ساخت سفارشی</h1>
          <p className="text-[12px] text-gray-500 mt-1">طراحی و ساخت جواهرات دقیقاً مطابق سلیقه شما</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── ستون اصلی: فرم ثبت سفارش ── */}
        <div className="lg:col-span-8">
          <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center">
                <PenTool className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-[15px] font-black text-gray-800">فرم درخواست طراحی</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">مشخصات طرح دلخواه خود را وارد کنید</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* عنوان طرح */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-700">عنوان طرح / نوع محصول</label>
                <input 
                  type="text"
                  placeholder="مثلا: انگشتر نامزدی با نگین برلیان"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10 rounded-xl px-4 py-3 text-[14px] font-medium text-gray-800 transition-all outline-none placeholder:text-gray-400"
                  required
                />
              </div>

              {/* توضیحات */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-700">توضیحات تکمیلی</label>
                <textarea 
                  rows={4}
                  placeholder="جزئیاتی مانند وزن تقریبی مدنظر، سایز، نوع طلا (زرد، سفید، رزگلد) و..."
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10 rounded-xl px-4 py-3 text-[14px] font-medium text-gray-800 transition-all outline-none placeholder:text-gray-400 resize-none"
                  required
                />
              </div>

              {/* آپلود تصویر (UI) */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-700">آپلود عکس یا اسکچ طرح (اختیاری)</label>
                <div className="border-2 border-dashed border-gray-200 hover:border-indigo-400 bg-gray-50 hover:bg-indigo-50/30 rounded-2xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer group">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 text-gray-400 group-hover:text-indigo-500 transition-colors">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <p className="text-[13px] font-bold text-gray-600 group-hover:text-indigo-600">برای آپلود تصویر کلیک کنید یا عکس را بکشید</p>
                  <p className="text-[11px] text-gray-400 mt-2">فرمت‌های مجاز: JPG, PNG, PDF (حداکثر ۵ مگابایت)</p>
                </div>
              </div>

              {/* بودجه تقریبی */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-700">بودجه تقریبی مدنظر (تومان)</label>
                <input 
                  type="text"
                  placeholder="مثلا: ۱۵,۰۰۰,۰۰۰"
                  value={formData.budget}
                  onChange={(e) => setFormData({...formData, budget: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/10 rounded-xl px-4 py-3 text-[14px] font-medium text-gray-800 transition-all outline-none placeholder:text-gray-400"
                  dir="ltr"
                />
              </div>

              {/* دکمه ارسال */}
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl text-[14px] font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
              >
                {isSubmitting ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    ثبت درخواست و برآورد قیمت
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ── ستون کناری: راهنما و مراحل ── */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="bg-indigo-50/50 rounded-[24px] p-6 border border-indigo-100/50">
            <h3 className="text-[15px] font-black text-indigo-900 mb-6">مراحل ساخت سفارشی</h3>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-indigo-200 before:to-transparent before:right-5">
              
              {/* مرحله 1 */}
              <div className="relative flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-200 flex items-center justify-center text-indigo-500 shadow-sm z-10 shrink-0">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-gray-800">ثبت درخواست</h4>
                  <p className="text-[11px] text-gray-500 mt-1">ارسال طرح، مشخصات و بودجه مدنظر</p>
                </div>
              </div>

              {/* مرحله 2 */}
              <div className="relative flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-200 flex items-center justify-center text-indigo-500 shadow-sm z-10 shrink-0">
                  <PenTool className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-gray-800">برآورد و طراحی سه‌بعدی</h4>
                  <p className="text-[11px] text-gray-500 mt-1">طراحی با نرم‌افزار و تایید نهایی شما</p>
                </div>
              </div>

              {/* مرحله 3 */}
              <div className="relative flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-200 flex items-center justify-center text-indigo-500 shadow-sm z-10 shrink-0">
                  <Hammer className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-gray-800">ساخت و مخراج‌کاری</h4>
                  <p className="text-[11px] text-gray-500 mt-1">ریخته‌گری و جای‌گذاری سنگ‌ها توسط استادکار</p>
                </div>
              </div>

              {/* مرحله 4 */}
              <div className="relative flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white border-2 border-indigo-200 flex items-center justify-center text-indigo-500 shadow-sm z-10 shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-gray-800">تحویل سفارش</h4>
                  <p className="text-[11px] text-gray-500 mt-1">صدور فاکتور رسمی و ارسال با بیمه</p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}