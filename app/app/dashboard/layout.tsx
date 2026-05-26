"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, TrendingUp, History, Settings, Plus, User, Bell, Search, LogOut } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#f3f4f0] flex flex-col md:flex-row font-sans" dir="rtl">
      {/* سایدبار دسکتاپ */}
      <aside className="hidden md:flex flex-col w-[260px] bg-emerald-900 text-white shrink-0 relative overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-black">آرکان <span className="text-gold">گلد</span></h1>
          <p className="text-xs text-white/50 mt-1">پلتفرم طلای آب‌شده</p>
        </div>
        
        {/* منو */}
        <nav className="flex-1 mt-4 px-3 space-y-1">
          <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${pathname === '/dashboard' ? 'bg-gold text-white' : 'text-white/65 hover:bg-white/10'}`}>
            <LayoutDashboard size={20} /> پیشخوان
          </Link>
          <Link href="/wallet" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/65 hover:bg-white/10">
            <Wallet size={20} /> کیف پول
          </Link>
          {/* سایر لینک‌ها */}
        </nav>

        {/* فوتر سایدبار */}
        <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 bg-white/10 p-3 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-gold flex items-center justify-center font-bold text-emerald-900">ع</div>
                <div className="flex-1 overflow-hidden">
                    <div className="text-sm font-bold truncate">علی محمدی</div>
                </div>
                <LogOut size={16} className="text-white/40 cursor-pointer" />
            </div>
        </div>
      </aside>

      {/* محتوای اصلی */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8">
            <div className="font-black text-lg">پیشخوان <span className="text-gold">کاربری</span></div>
            <div className="flex gap-4">
                <div className="w-10 h-10 border rounded-xl flex items-center justify-center"><Bell size={20} /></div>
            </div>
        </header>
        <div className="p-6 overflow-y-auto">{children}</div>
      </main>

      {/* نویگیشن موبایل (فقط در موبایل نمایش داده می‌شود) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around p-3 z-50">
        <div className="flex flex-col items-center gap-1 text-emerald-900"><LayoutDashboard size={24} /> <span className="text-[10px]">پیشخوان</span></div>
        <div className="flex flex-col items-center gap-1 text-gray-400"><Wallet size={24} /> <span className="text-[10px]">کیف پول</span></div>
        <div className="bg-emerald-900 text-white rounded-full p-4 -mt-8 shadow-lg"><Plus size={24} /></div>
        <div className="flex flex-col items-center gap-1 text-gray-400"><History size={24} /> <span className="text-[10px]">تراکنش‌ها</span></div>
        <div className="flex flex-col items-center gap-1 text-gray-400"><User size={24} /> <span className="text-[10px]">حساب</span></div>
      </nav>
    </div>
  );
}