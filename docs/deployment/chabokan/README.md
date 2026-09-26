# استقرار آرکان گلد روی چابکان

سه سرویس Node.js مجزا در چابکان، هر کدام با دامنه‌ی خودش:

| سرویس چابکان | دامنه | بسته‌ی مونوریپو | `APP_SERVICE` |
| --- | --- | --- | --- |
| NestJS API | `api.arkan.gold` | `api/` (+ `packages/shared`) | `api` |
| Next.js کاربر | `app.arkan.gold` | `app/` | `app` |
| Next.js پنل مدیریت | `admin.arkan.gold` | `admin/` | `admin` |

## ساختار استقرار

هر سه سرویس **کل مونوریپو** را دریافت می‌کنند (با `chabok deploy` از ریشه‌ی پروژه) و فقط متغیر محیطی
`APP_SERVICE` تعیین می‌کند کدام بسته ساخته و اجرا شود. چابکان به‌ترتیب این مراحل را در ریشه اجرا می‌کند:

1. `npm install` — در ریشه وابستگی‌ای وجود ندارد و سریع تمام می‌شود.
2. `npm run build` → `scripts/deploy/run.mjs build`:
   - نصب وابستگی‌های همان سرویس با pnpm (`pnpm install --filter <service>...`؛ اگر pnpm روی سرور نباشد
     همان نسخه‌ی `packageManager` با `npx` اجرا می‌شود)
   - برای `api`: build پکیج `@arkan-gold/shared`، سپس `prisma generate` و `nest build`
   - برای `app` / `admin`: `next build`
3. `npm start` → `scripts/deploy/run.mjs start`:
   - برای `api`: ابتدا `prisma migrate deploy` (با `PRISMA_MIGRATE_ON_START=false` غیرفعال می‌شود)
     و بعد `node dist/src/main.js`
   - برای `app` / `admin`: `next start`
   - پورت از `PORT` خوانده می‌شود و پیش‌فرض آن `3000` است، همان پورت پیش‌فرض سرویس‌های Node.js چابکان.

فایل `.chabokignore` در ریشه تعیین می‌کند چه چیزهایی آپلود نشوند (`node_modules`، خروجی‌های build،
فایل‌های `.env`، پوشه‌ی `docs` و `api/uploads`).

## پیش‌نیازها در پنل چابکان

1. **PostgreSQL** و **Redis**: دو سرویس دیتابیس بسازید و مشخصات اتصال را در `DATABASE_URL` و
   `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` سرویس api بگذارید. API هم با اتصال مستقیم
   (`postgresql://...`) کار می‌کند و هم با Prisma Accelerate (`prisma+postgres://...`).
2. **ذخیره‌سازی S3** (مثلاً MinIO چابکان) برای رسیدهای واریز و پیوست تیکت‌ها (`S3_*`).
3. **نسخه‌ی Node.js**: در تنظیمات هر سه سرویس نسخه‌ی **22** را انتخاب کنید (pnpm 11 به Node 22.13 به بالا نیاز دارد).

## مراحل

### ۱. نصب CLI و ورود

```bash
npm install -g @chabokan.net/cli
chabok login
chabok service list      # نام سه سرویس را اینجا ببینید
```

### ۲. متغیرهای محیطی هر سرویس

فایل‌های نمونه‌ی همین پوشه را کامل کنید و در پنل هر سرویس: **تنظیمات ← متغیرهای محیطی ← آپلود فایل .env**

- [`api.env.example`](./api.env.example) ← سرویس api
- [`app.env.example`](./app.env.example) ← سرویس app
- [`admin.env.example`](./admin.env.example) ← سرویس admin

مهم‌ترینشان `APP_SERVICE` است؛ بدون آن build با پیام خطای واضح متوقف می‌شود.
`INTERNAL_PROXY_SECRET` را هم با **یک مقدار یکسان** در هر سه سرویس بگذارید (توضیح در «IP واقعی کاربر» پایین).

> متغیرهای `NEXT_PUBLIC_*` هنگام build داخل کد فرانت قرار می‌گیرند. پس اول متغیرها را ذخیره کنید، بعد deploy کنید.

### ۳. استقرار (از ریشه‌ی مونوریپو)

```bash
chabok deploy -s <نام-سرویس-api>
chabok deploy -s <نام-سرویس-app>
chabok deploy -s <نام-سرویس-admin>
```

روند نصب و build را در بخش **لاگ‌ها**ی هر سرویس ببینید؛ خطوط اسکریپت با `[deploy]` شروع می‌شوند.

### ۴. دامنه‌ها

```bash
chabok service domain add -s <نام-سرویس-api>   -d api.arkan.gold
chabok service domain add -s <نام-سرویس-app>   -d app.arkan.gold
chabok service domain add -s <نام-سرویس-admin> -d admin.arkan.gold
```

سپس رکوردهای DNS را طبق راهنمای بخش دامنه‌های هر سرویس تنظیم کنید و SSL را فعال کنید.

### ۵. مسیر دائمی برای فایل‌های آپلودی (سرویس api)

با هر `chabok deploy` فایل‌های قبلی سرویس پاک می‌شوند. API تصاویر محصولات، طرح‌های بسته‌بندی و مدارک
حقوقی را روی دیسک در `api/uploads` ذخیره می‌کند. بعد از اولین deploy، در پنل سرویس api بخش
**مسیرهای دائمی** را باز کنید و `api/uploads` را اضافه کنید. فایل‌های موجود فعلی را یک بار با
فایل‌منیجر یا FTP به همین مسیر منتقل کنید.

### ۶. تنظیمات بعد از اولین اجرا

- ساخت اولین ادمین (از **کنسول** سرویس api):
  ```bash
  cd api && npx tsx scripts/create-first-admin.ts
  ```
- در پنل مدیریت ← تنظیمات سیستم، مقدار `payment.gateway.callback_base_url` را روی
  `https://api.arkan.gold` بگذارید (مقدار پیش‌فرض `http://localhost:5000` است و بازگشت از درگاه پرداخت را خراب می‌کند).

## نکات

- **استقرار بدون اختلال**: اگر فعال باشد، نسخه‌ی جدید تا سالم بالا آمدن روی پورت ۳۰۰۰، جایگزین نسخه‌ی قبلی نمی‌شود.
  در این فاصله دو نسخه از API هم‌زمان اجرا می‌شوند و کارهای زمان‌بندی‌شده (cron) ممکن است یک بار تکراری اجرا شوند.
- **IP واقعی کاربر**: API فقط از روی پراکسی‌های شبکه‌ی داخلی به `X-Forwarded-For` اعتماد می‌کند (قابل
  تغییر با `TRUST_PROXY`)، پس IP جعلی کلاینت پذیرفته نمی‌شود. درخواست‌های app و admin از سرور Next.js
  می‌آیند؛ این سرورها IP و User-Agent کاربر را همراه `INTERNAL_PROXY_SECRET` می‌فرستند تا rate limit و
  لاگ ممیزی برای هر کاربر جدا باشد. بدون این راز همه‌ی کاربران app/admin یک IP حساب می‌شوند.
- **کمبود حافظه در build**: اگر `next build` با خطای heap متوقف شد، متغیر
  `NODE_OPTIONS=--max-old-space-size=2048` را اضافه کنید یا منابع سرویس را موقتاً بیشتر کنید.
- **حجم آپلود**: سقف `chabok deploy` صد مگابایت فشرده است. آرشیو فعلی حدود ۲ مگابایت است.
- **فایل قفل**: اگر `pnpm-lock.yaml` در ریشه باشد آپلود و استفاده می‌شود. برای نسخه‌های یکسان در هر build
  بهتر است آن را از `.gitignore` خارج و commit کنید.
- **اجرای محلی**: `APP_SERVICE=api npm run build && APP_SERVICE=api PORT=5000 npm start`
