# استقرار آرکان گلد روی چابکان

سه سرویس جدا، هر کدام با دامنه‌ی خودش:

| سرویس | دامنه | Dockerfile | پورت داخلی |
|---|---|---|---|
| API (NestJS) | `api.arkan.gold` | `deploy/chabokan/api.Dockerfile` | `5000` |
| پنل کاربری (Next.js) | `app.arkan.gold` | `deploy/chabokan/app.Dockerfile` | `3000` |
| پنل ادمین (Next.js) | `admin.arkan.gold` | `deploy/chabokan/admin.Dockerfile` | `3000` |

به‌علاوه‌ی دو سرویس مدیریت‌شده: **PostgreSQL** و **Redis**.

```
مرورگر ──► app.arkan.gold ──(route handlerهای Next)──┐
مرورگر ──► admin.arkan.gold ─(route handlerهای Next)──┼──► api.arkan.gold ──► PostgreSQL
مرورگر ──(WebSocket قیمت، تصاویر، ورود OTP)──────────┘                    └──► Redis
```

> **مهم:** هر سه Dockerfile باید با **ریشه‌ی repo** به‌عنوان context بیلد شوند
> (پروژه monorepo است و هر سه به `packages/shared` و `pnpm-lock.yaml` ریشه نیاز دارند).

---

## ۱. سرویس‌های پایه

1. در پنل چابکان یک سرویس **PostgreSQL** (نسخه‌ی ۱۵ یا بالاتر) بسازید و یک دیتابیس (مثلاً `arkangold`) ایجاد کنید.
   رشته‌ی اتصال را به شکل `postgresql://USER:PASSWORD@HOST:5432/arkangold` یادداشت کنید.
2. یک سرویس **Redis** بسازید و آدرس/پورت/رمز آن را یادداشت کنید.
3. در صورت نیاز به آپلود رسید واریز و پیوست تیکت، یک **Object Storage (S3)** بسازید.

> اگر چابکان برای سرویس‌ها آدرس داخلی (شبکه‌ی خصوصی) می‌دهد، از آدرس داخلی استفاده کنید.

## ۲. سرویس API — `api.arkan.gold`

1. یک سرویس از نوع **Docker** بسازید و سورس را از همین repo (ریشه‌ی پروژه) معرفی کنید.
   - اگر پنل اجازه‌ی تعیین مسیر Dockerfile را می‌دهد: `deploy/chabokan/api.Dockerfile`
   - اگر فقط `./Dockerfile` ریشه را می‌خواند، پیش از استقرار اجرا کنید:
     `sh deploy/chabokan/prepare.sh api`
2. **پورت:** `5000`
3. **متغیرهای محیطی:** مطابق [`api.env.example`](./api.env.example). حداقل موارد لازم:
   `DATABASE_URL`، `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`، شش کلید `JWT_*` و `INTEGRATION_ENCRYPTION_KEY`.
   ```bash
   # تولید کلیدها (هر JWT_* یک کلید جدا)
   openssl rand -base64 48   # برای هر JWT_*
   openssl rand -base64 32   # برای INTEGRATION_ENCRYPTION_KEY
   ```
   در `NODE_ENV=production` اگر کلیدهای JWT کوتاه یا تکراری باشند، API بالا نمی‌آید (عمدی است).
4. **دیسک دائمی:** یک دیسک بسازید و روی مسیر **`/repo/api/uploads`** mount کنید.
   تصاویر محصولات، طرح‌های بسته‌بندی و مدارک حقوقی کاربران اینجا ذخیره می‌شوند؛ بدون دیسک با هر استقرار پاک می‌شوند.
5. **دامنه:** `api.arkan.gold` را به سرویس وصل و **SSL** را فعال کنید.
6. در هر بار اجرا `prisma migrate deploy` خودکار اجرا می‌شود (با `RUN_MIGRATIONS=false` غیرفعال می‌شود).

بررسی: `https://api.arkan.gold/api/docs` باید Swagger را نشان دهد.

## ۳. پنل کاربری — `app.arkan.gold`

1. سرویس **Docker** جدید با Dockerfile: `deploy/chabokan/app.Dockerfile` (یا `sh deploy/chabokan/prepare.sh app`)
2. **پورت:** `3000`
3. **متغیرهای محیطی:** مطابق [`app.env.example`](./app.env.example):
   `NEST_API_URL=https://api.arkan.gold` (یا آدرس داخلی سرویس API)
4. **دامنه:** `app.arkan.gold` + فعال‌سازی SSL (کوکی‌های ورود `secure` هستند و بدون HTTPS کار نمی‌کنند).

## ۴. پنل ادمین — `admin.arkan.gold`

1. سرویس **Docker** جدید با Dockerfile: `deploy/chabokan/admin.Dockerfile` (یا `sh deploy/chabokan/prepare.sh admin`)
2. **پورت:** `3000`
3. **متغیرهای محیطی:** مطابق [`admin.env.example`](./admin.env.example): `NEST_API_URL=https://api.arkan.gold`
4. **دامنه:** `admin.arkan.gold` + SSL

## ۵. DNS

در پنل DNS دامنه‌ی `arkan.gold`، برای هر زیردامنه رکوردی که چابکان برای آن سرویس اعلام می‌کند
(معمولاً `CNAME` یا `A`) را اضافه کنید:

| نام | مقصد |
|---|---|
| `api` | آدرس سرویس API در چابکان |
| `app` | آدرس سرویس پنل کاربری |
| `admin` | آدرس سرویس پنل ادمین |

اگر از CDN (مثلاً ابر آروان/Cloudflare) جلوی API استفاده می‌کنید، **WebSocket** را برای `api.arkan.gold` فعال کنید
(قیمت لحظه‌ای از namespace `/market` روی socket.io می‌آید).

## ۶. ساخت اولین ادمین

پس از اولین اجرای موفق API (که نقش‌ها و دسترسی‌ها را sync می‌کند)، از کنسول/ترمینال سرویس API در چابکان:

```bash
cd /repo/api
npx -y tsx scripts/create-first-admin.ts
```

سپس با همان نام کاربری در `https://admin.arkan.gold/login` وارد شوید و از بخش «یکپارچه‌سازی‌ها» سرویس پیامک،
درگاه پرداخت و … را پیکربندی کنید.

## ۷. چک‌لیست پس از استقرار

- [ ] `https://api.arkan.gold/api/docs` باز می‌شود
- [ ] ورود/ثبت‌نام در `https://app.arkan.gold` کار می‌کند (پیامک OTP)
- [ ] ورود ادمین در `https://admin.arkan.gold` کار می‌کند
- [ ] قیمت لحظه‌ای در داشبورد کاربر به‌روز می‌شود (WebSocket)
- [ ] آپلود تصویر محصول از پنل ادمین و نمایش آن در پنل کاربری (دیسک `/repo/api/uploads`)
- [ ] پس از یک Redeploy، تصاویر آپلودشده هنوز موجودند
- [ ] `OTP_DEBUG_LOG` خاموش است

## ۸. نکات

- **آدرس API در مرورگر** (`NEXT_PUBLIC_NEST_ORIGIN`) هنگام بیلد جاسازی می‌شود و پیش‌فرض آن
  `https://api.arkan.gold` است. برای تغییر: build-arg `NEXT_PUBLIC_NEST_ORIGIN=...`.
- **میرور داخلی:** اگر دسترسی سرور بیلد به Docker Hub یا npm محدود است، از build-argها استفاده کنید:
  - `NODE_IMAGE` (پیش‌فرض `node:22-slim`) — مثلاً image همان نسخه از یک registry میرور
  - `NPM_REGISTRY` (پیش‌فرض `https://registry.npmjs.org/`) — مثلاً میرور npm داخلی
- **lockfile:** `pnpm-lock.yaml` ریشه commit می‌شود و بیلدها با `--frozen-lockfile` انجام می‌شوند؛
  پس از تغییر وابستگی‌ها حتماً `pnpm install` بزنید و lockfile را commit کنید.
- **تست محلی بیلدها** (از ریشه‌ی repo):
  ```bash
  docker build -f deploy/chabokan/api.Dockerfile   -t arkan-api .
  docker build -f deploy/chabokan/app.Dockerfile   -t arkan-app .
  docker build -f deploy/chabokan/admin.Dockerfile -t arkan-admin .
  ```
