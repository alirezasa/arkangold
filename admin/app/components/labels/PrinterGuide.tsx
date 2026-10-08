// admin/app/components/labels/PrinterGuide.tsx
//
// راهنمای تنظیم دستگاه لیبل پرینتر حرارتی (اینوورس و مدل‌های مشابه با درایور ویندوز) برای چاپ از مرورگر.
export function PrinterGuide({ widthMm, heightMm, dpi }: { widthMm?: number; heightMm?: number; dpi?: number }) {
  const size = widthMm && heightMm ? `${widthMm}×${heightMm} میلی‌متر` : "رول برچسب (مثلاً ۱۰۰×۱۰۰ میلی‌متر)";
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-[12px] leading-6 text-amber-950 space-y-2">
      <p className="font-black">تنظیم یک‌باره‌ی دستگاه لیبل پرینتر (اینوورس و مشابه)</p>
      <ol className="list-decimal pr-5 space-y-0.5">
        <li>درایور ویندوز دستگاه را از CD یا سایت فروشنده نصب و دستگاه را با USB/شبکه وصل کنید.</li>
        <li>
          در «Printing Preferences» درایور، یک اندازه‌ی کاغذ (Stock / Page Size) به ابعاد <b>{size}</b> بسازید، نوع رسانه را «Label with
          gaps» (برچسب با فاصله) بگذارید و دقت را روی {dpi ?? "۲۰۳ یا ۳۰۰"} DPI (مطابق دستگاه) نگه دارید.
        </li>
        <li>پس از تعویض رول، کالیبره کنید (معمولاً نگه‌داشتن دکمه‌ی Feed تا یکی دو برچسب بیرون بیاید) تا چاپ از ابتدای هر برچسب شروع شود.</li>
        <li>اگر بارکد کم‌رنگ است، Darkness را بیشتر و Speed را کمتر کنید.</li>
      </ol>
      <p className="font-black">در پنجره‌ی چاپ مرورگر (کروم/اج)</p>
      <ul className="list-disc pr-5 space-y-0.5">
        <li>مقصد: دستگاه لیبل پرینتر — اندازه‌ی کاغذ: همان {size}</li>
        <li>حاشیه (Margins): «هیچ / None» — مقیاس: «پیش‌فرض / 100%»</li>
        <li>تیک «سرصفحه و پاصفحه» برداشته و «گرافیک پس‌زمینه» روشن باشد (برای متن سفید روی زمینه‌ی مشکی).</li>
      </ul>
      <p className="text-amber-800">
        برای چاپ بدون پنجره‌ی تأیید: دستگاه را چاپگر پیش‌فرض ویندوز کنید و میان‌بر کروم را با گزینه‌ی <span dir="ltr">--kiosk-printing</span> اجرا
        کنید؛ دکمه‌ی چاپ مستقیم برچسب را می‌فرستد.
      </p>
    </div>
  );
}
