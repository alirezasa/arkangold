# استقرار آرکان گلد روی لیارا

سه برنامه‌ی Node.js در لیارا، هر کدام با دامنه‌ی خودش و همه در **یک شبکه‌ی خصوصی مشترک**:

| برنامه (شناسه‌ی پیشنهادی) | دامنه | فایل پیکربندی | `APP_SERVICE` |
| --- | --- | --- | --- |
| `arkan-api` | `api.arkan.gold` | `liara.api.json` | `api` |
| `arkan-app` | `app.arkan.gold` | `liara.app.json` | `app` |
| `arkan-admin` | `admin.arkan.gold` | `liara.admin.json` | `admin` |

اگر شناسه‌های بالا در لیارا آزاد نبود، شناسه‌ی دیگری انتخاب کنید و مقدار `app` در فایل
`liara.*.json` مربوطه و آدرس `http://arkan-api:3000` در متغیرهای app و admin را هم عوض کنید.

## ساختار استقرار

هر سه برنامه کل مونوریپو را دریافت می‌کنند و `APP_SERVICE` تعیین می‌کند کدام بسته اجرا شود
(`scripts/deploy/run.mjs`؛ همان روند `npm install` → `npm run build` → `npm start` لیارا).

- **ارتباط app و admin با API از شبکه‌ی خصوصی**: route handlerهای Next.js در سمت سرور مستقیماً به
  `http://arkan-api:3000` وصل می‌شوند؛ نه از اینترنت و نه وابسته به DNS دامنه. مرورگر کاربر همچنان از
  `https://api.arkan.gold` استفاده می‌کند (متغیرهای `NEXT_PUBLIC_*`).
- **دیسک**: فایل‌سیستم برنامه‌های Node.js لیارا فقط‌خواندنی است؛ فایل‌های آپلودی API روی دیسک
  `uploads` که به `api/uploads` متصل می‌شود ذخیره می‌شوند (در `liara.api.json` تعریف شده).

## مراحل

1. **شبکه‌ی خصوصی و دیتابیس‌ها**: یک PostgreSQL و یک Redis بسازید و هر دو را در یک شبکه‌ی خصوصی
   جدید (مثلاً `arkan`) قرار دهید.
2. **ذخیره‌سازی ابری**: یک باکت بسازید و کلیدهای دسترسی آن را بردارید.
3. **سه برنامه‌ی NodeJS** با شناسه‌های جدول بالا بسازید، همه در همان شبکه‌ی خصوصی.
4. **دیسک**: در برنامه‌ی `arkan-api` بخش دیسک‌ها، یک دیسک با نام `uploads` بسازید.
5. **متغیرهای محیطی**: فایل‌های [`api.env.example`](./api.env.example)،
   [`app.env.example`](./app.env.example) و [`admin.env.example`](./admin.env.example) را کامل کنید و
   در تنظیمات هر برنامه ← متغیرها ← «آپلود فایل .env» بارگذاری کنید.
6. **فایل‌سیستم app و admin**: در تنظیمات این دو برنامه گزینه‌ی «فایل‌سیستم Read Only» را غیرفعال
   کنید (Next.js کش تصاویر را در `.next/cache` می‌نویسد).
7. **استقرار** از ریشه‌ی مونوریپو:
   ```bash
   npm i -g @liara/cli
   liara login
   liara deploy --liara-json liara.api.json
   liara deploy --liara-json liara.app.json
   liara deploy --liara-json liara.admin.json
   ```
8. **ساخت اولین ادمین** (کنسول برنامه‌ی api، یا `liara shell --app arkan-api`):
   ```bash
   cd api && npx tsx scripts/create-first-admin.ts
   ```
9. **دامنه‌ها**: در هر برنامه ← دامنه‌ها ← افزودن دامنه (`api.arkan.gold` و ...) و ثبت رکوردهایی که لیارا
   نشان می‌دهد در DNS دامنه؛ سپس فعال‌سازی SSL.
10. در پنل مدیریت ← تنظیمات سیستم، `payment.gateway.callback_base_url` را روی `https://api.arkan.gold`
    بگذارید.

## نکات

- اگر نصب پکیج‌ها در build خطای دانلود داد، به فایل `liara.*.json` مربوطه
  `"build": { "location": "germany" }` اضافه کنید.
- اگر لیارا متغیرهای محیطی را در زمان build در اختیار نگذارد، اسکریپت هر سه سرویس را می‌سازد و
  `APP_SERVICE` در زمان اجرا تعیین می‌کند کدام اجرا شود (build طولانی‌تر می‌شود ولی کار می‌کند).
- برای انتقال داده از دیتابیس قبلی: `pg_dump` از دیتابیس قبلی و `pg_restore` / `psql` روی دیتابیس لیارا،
  و فایل‌های `api/uploads` با FTP دیسک به دیسک `uploads`.
