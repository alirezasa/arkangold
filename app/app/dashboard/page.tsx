"use client";

export default function DashboardPage() {
  const chartData = [68, 74, 60, 82, 79, 91, 85]; // دیتای نمودار

  return (
    <div className="space-y-6">
      {/* کارت‌های آماری */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "موجودی طلا", val: "۱۲.۵۴", color: "gold" },
          { label: "ارزش کل", val: "۵۳.۷م", color: "emerald" },
          { label: "موجودی نقدی", val: "۱۲.۳م", color: "blue" },
          { label: "سود/زیان", val: "+۸.۴م", color: "red" }
        ].map((item, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border shadow-sm relative overflow-hidden">
            <div className="text-xs text-gray-500">{item.label}</div>
            <div className="text-2xl font-black mt-1">{item.val}</div>
          </div>
        ))}
      </div>

      {/* نمودار و کیف پول */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-6 rounded-2xl border shadow-sm">
            <h3 className="font-bold mb-4">نمودار ارزش دارایی</h3>
            <div className="flex items-end gap-2 h-40">
                {chartData.map((h, i) => (
                    <div key={i} className="flex-1 bg-emerald-100 rounded-t-lg hover:bg-gold transition-all" style={{height: `${h}%`}}></div>
                ))}
            </div>
        </div>
        
        <div className="bg-emerald-900 text-white p-6 rounded-2xl">
            <h3 className="mb-4">کیف پول</h3>
            <div className="text-3xl font-black">۱۲,۳۵۰,۰۰۰ <span className="text-sm">تومان</span></div>
            <button className="w-full mt-6 bg-gold py-3 rounded-xl font-bold">واریز</button>
        </div>
      </div>
    </div>
  );
}