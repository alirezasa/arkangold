# مستندات انطباق — کلاس رویدادنگاری (FAU)

**محصول:** آرکان گلد (API: NestJS + PostgreSQL/Prisma — پنل ادمین: Next.js)
**دامنه:** FAU_GEN_EXT.1.1 تا FAU_GEN_EXT.1.8 ، FAU_STG_EXT.1.1 و FAU_STG_EXT.1.2
**شاخه/PR:** `claude/friendly-ptolemy-dzc732` — PR #26

این سند برای هر الزام، اقدام انجام‌شده را توضیح می‌دهد و شواهد قابل‌بررسی را معرفی می‌کند: فایل، جدول دیتابیس، endpoint و صفحه‌ی پنل. متن بخش «شرح اقدام» هر الزام را می‌توان مستقیماً در فیلد «توضیحات و شواهد متقاضی» فرم ارزیابی وارد کرد. محدودیت‌ها و موارد باقی‌مانده هم برای هر الزام صریحاً آمده‌اند.

---

## خلاصه‌ی وضعیت

| شناسه | عنوان | وضعیت |
|---|---|---|
| FAU_GEN_EXT.1.1 | فراداده‌ی ضروری رویداد | ✅ پیاده‌سازی شده |
| FAU_GEN_EXT.1.2 | هماهنگ‌سازی زمانی و UTC | ✅ در سطح برنامه — ⚠️ همگام‌سازی NTP سرور بر عهده‌ی زیرساخت |
| FAU_GEN_EXT.1.3 | فرمت استاندارد (JSON) | ✅ پیاده‌سازی شده |
| FAU_GEN_EXT.1.4 | جلوگیری از ثبت داده‌ی حساس | ✅ پیاده‌سازی شده |
| FAU_GEN_EXT.1.5 | رویدادهای احراز هویت | ⚠️ عمدتاً — ۳ مورد باقی‌مانده (بخش ۵) |
| FAU_GEN_EXT.1.6 | تلاش ناموفق مجوزدهی | ⚠️ جزئی — ارتقای سطح دسترسی بله، دسترسی هم‌سطح خیر |
| FAU_GEN_EXT.1.7 | تلاش برای دور زدن کنترل‌ها | ⚠️ جزئی — اعتبارسنجی ورودی بله، rate-limit سراسری و منطق کسب‌وکار خیر |
| FAU_GEN_EXT.1.8 | خطای پیش‌بینی‌نشده و شکست کنترل امنیتی | ✅ پیاده‌سازی شده |
| FAU_STG_EXT.1.1 | کدگذاری داده‌ها (ضد تزریق رویداد) | ✅ پیاده‌سازی شده |
| FAU_STG_EXT.1.2 | کنترل دسترسی و یکپارچگی رویدادها | ✅ پیاده‌سازی شده (با توصیه‌ی تکمیلی زیرساختی) |

---

## معماری کلی

```
درخواست HTTP
   │
   ├─ AdminJwtAuthGuard / JwtAuthGuard ──► توکن نامعتبر / نشست منقضی      ─┐
   ├─ AdminPermissionGuard ─────────────► رد دسترسی (ارتقای سطح)          ─┤
   ├─ ValidationPipe ──► AllExceptionsFilter ► ورودی نامعتبر              ─┤
   ├─ AuditLogInterceptor ─────────────► اقدامات حساس ادمین (موفق/ناموفق) ─┤
   ├─ AuthService / AdminAuthService ──► ورود، خروج، قفل حساب، تغییر رمز  ─┤
   └─ AllExceptionsFilter ─────────────► خطای پیش‌بینی‌نشده (5xx)          ─┤
                                                                            ▼
                                            AuditService (سرویس متمرکز)
                                            ۱. redact() — حذف داده‌ی حساس
                                            ۲. مهر زمانی UTC
                                            ۳. زنجیره‌ی hash (SHA-256) با قفل ردیف
                                                          │
                          ┌───────────────────────────────┴──────────────┐
                          ▼                                              ▼
               admin_audit_logs (ادمین)                      audit_logs (کاربران)
                          └──────── audit_chain_state (آخرین hash هر زنجیره) ┘

لاگ عمومی برنامه ──► PinoLoggerService ──► stdout به فرمت JSON (قابل ارسال به SIEM)
```

تمام رویدادهای امنیتی از یک نقطه عبور می‌کنند: `api/src/common/audit/audit.service.ts`. به همین دلیل سیاست‌های پوشاندن داده، مهر زمانی و یکپارچگی بدون استثنا روی همه‌ی رویدادها اعمال می‌شوند.

---

## ۱. FAU_GEN_EXT.1.1 — فراداده‌ی ضروری رویداد

**شرح اقدام:**
هر رویداد امنیتی در یکی از دو جدول `admin_audit_logs` (اقدامات ادمین) و `audit_logs` (اقدامات کاربران) ثبت می‌شود. هر رکورد به چهار پرسش الزام پاسخ می‌دهد:

| پرسش | فیلد | توضیح |
|---|---|---|
| چه زمانی | `created_at` | مهر زمانی UTC با دقت میلی‌ثانیه (`timestamptz(3)`) |
| کجا | `source` | نام مؤلفه‌ی تولیدکننده، مثلاً `AdminAuthService`، `WalletAdminController`، `JwtAuthGuard` یا `POST /auth/login`. نام کلاس کنترلر به‌صورت خودکار ثبت می‌شود. |
| چه کسی | `admin_user_id` / `user_id`، `ip`، `user_agent`، `actor_label` | شناسه‌ی کاربر، IP واقعی کلاینت (پشت پراکسی با `trust proxy`) و مرورگر. `actor_label` برای وقتی است که هویت هنوز شناخته نشده، مثل ورود ناموفق با نام کاربری نامعتبر، و مقدار آن پوشانده‌شده است. |
| چه چیزی | `action`، `entity_type`، `entity_id`، `old_value`/`new_value`، `success` | نوع رویداد، موجودیت هدف، جزئیات (پس از پاکسازی) و نتیجه‌ی موفق/ناموفق |

در پنل ادمین، ۵۷ اقدام حساس با دکوراتور `@AuditLog` و `AuditLogInterceptor` به‌صورت خودکار ثبت می‌شوند؛ هم در صورت موفقیت و هم در صورت شکست. نمونه‌ها: تأیید/رد برداشت و واریز، تغییر موجودی کیف‌پول، تغییر وضعیت کاربر، مدیریت ادمین‌ها، تغییر اعتبارنامه‌ی سرویس‌های خارجی، اجرای پی‌رول و مدیریت هولوگرام. فهرست کامل در پیوست الف آمده است.

**شواهد:**
- `api/src/common/audit/audit.service.ts` — سرویس متمرکز
- `api/src/admin-auth/interceptors/audit-log.interceptor.ts` — ثبت خودکار اقدامات ادمین (موفق و ناموفق)
- `api/prisma/schema.prisma` — مدل‌های `AuditLog` و `AdminAuditLog`
- مایگریشن `20260922110000_add_audit_log_metadata`
- پنل ادمین: منو «گزارش فعالیت‌ها»، تب‌های «رویدادهای ادمین» و «رویدادهای کاربران»

---

## ۲. FAU_GEN_EXT.1.2 — هماهنگ‌سازی زمانی و استانداردسازی مهر زمانی

**شرح اقدام (سازوکار انتخاب‌شده: گزینه‌ی ۳ «تنظیم پیش‌فرض، بدون امکان دستکاری» + توصیه‌ی گزینه‌ی ۱ «NTP» در سطح سرور):**

1. **منطقه‌ی زمانی فرآیند ثابت روی UTC است.** اولین خط `api/src/main.ts`، پیش از بارگذاری هر ماژول دیگر، `process.env.TZ = 'UTC'` را تنظیم می‌کند. به این ترتیب زمان برنامه به منطقه‌ی زمانی سیستم‌عامل میزبان وابسته نیست و با تنظیمات سرور یا ساعت تابستانی تغییر نمی‌کند. این مقدار در کد ثابت است و از طریق ورودی کاربر قابل تغییر نیست.
2. **ستون‌های زمان رویداد صریحاً UTC ذخیره می‌شوند.** نوع `created_at` در هر دو جدول رویداد از `timestamp without time zone` که مبهم بود به `timestamptz(3)` تغییر کرد. داده‌های قبلی هنگام مهاجرت با `AT TIME ZONE 'UTC'` تبدیل شدند.
3. **زمان رویداد پیش از درج تولید می‌شود.** مهر زمانی در `AuditService` تولید و در محاسبه‌ی hash زنجیره گنجانده می‌شود. بنابراین تغییر بعدی زمان یک رکورد در بازبینی یکپارچگی کشف می‌شود (بخش ۱۰).
4. **لاگ عمومی برنامه هم UTC است.** pino از `pino.stdTimeFunctions.isoTime` استفاده می‌کند که زمان را به شکل ISO-8601 با پسوند `Z` خروجی می‌دهد.

**شواهد:**
- `api/src/main.ts` (خطوط ابتدایی)
- `api/prisma/schema.prisma` — `@db.Timestamptz(3)` روی `createdAt` هر دو مدل
- مایگریشن `20260922120000_audit_log_hash_chain_and_utc`
- نمونه‌ی خروجی لاگ: `"time":"2026-09-23T09:16:21.266Z"`

**اقدام لازم در زیرساخت (خارج از کد):**
ساعت سیستم‌عامل سرور برنامه و سرور PostgreSQL باید با NTP همگام باشد (مثلاً `chrony` یا `systemd-timesyncd`). مسیر پیکربندی سرور در این مخزن نیست و باید در محیط استقرار تأیید شود. برای شواهد می‌توان خروجی `timedatectl` یا `chronyc tracking` را ضمیمه کرد.

---

## ۳. FAU_GEN_EXT.1.3 — فرمت رویدادنگاری استاندارد

**شرح اقدام:**
- **رویدادهای امنیتی** در جداول رابطه‌ای با ستون‌های ساخت‌یافته و ثابت ذخیره می‌شوند. جزئیات متغیر هر رویداد در ستون‌های `old_value`/`new_value` از نوع JSON (`jsonb`) قرار می‌گیرند. نام‌گذاری `action` یکدست است و الگوی `دامنه.عملیات` دارد، مثل `auth.login`، `admin_auth.permission_denied` و `wallet.adjust`.
- **لاگ عمومی برنامه:** لاگر پیش‌فرض NestJS، که متن ساده و رنگی تولید می‌کرد، با `PinoLoggerService` جایگزین شد. هر خط خروجی یک شیء JSON مستقل است که ابزارهای SIEM/ELK/Loki بدون parser سفارشی آن را می‌خوانند. فیلدهای استاندارد: `level`، `time` (ISO-8601 UTC)، `service`، `context` (نام مؤلفه)، `msg` و در خطاها `trace`.

نمونه‌ی واقعی خروجی:
```json
{"level":40,"time":"2026-09-23T09:16:21.266Z","service":"arkangold-api","context":"AuditService","msg":"..."}
```

**شواهد:**
- `api/src/common/logging/pino-logger.service.ts`
- `api/src/main.ts` — `NestFactory.create(AppModule, { logger: new PinoLoggerService() })`
- وابستگی `pino` در `api/package.json`

---

## ۴. FAU_GEN_EXT.1.4 — جلوگیری از ثبت داده‌ی حساس

**شرح اقدام:**
هیچ payloadی بدون عبور از تابع `redact()` در جدول رویداد ذخیره نمی‌شود. این تابع در `AuditService` به‌صورت متمرکز اجرا می‌شود و روی همه‌ی مسیرها، از جمله ۵۷ اقدام خودکار ادمین، اعمال می‌شود. `redact()` کل ساختار تودرتوی شیء و آرایه‌ها را پیمایش می‌کند و مقدار هر کلیدی را که نامش با یکی از الگوهای زیر مطابقت داشته باشد با `[REDACTED]` جایگزین می‌کند. تطبیق به حروف بزرگ و کوچک و به `_` و `-` حساس نیست.

| دسته (مطابق شرح الزام) | الگوهای کلید | سیاست |
|---|---|---|
| احراز هویت و امنیتی | password، secret، token، otp، totp، backupCode، privateKey، apiKey، authorization، cookie، sessionId، pin | حذف کامل (ثبت ممنوع) |
| مالی حساس | cvv، cvc، expiryDate، creditScore، creditLimit، salary، payroll، investment، assetValue | حذف کامل (ثبت ممنوع) |
| هویتی و مالی قابل پوشاندن | cardNumber، iban، shaba، accountNumber، nationalId، nationalCode، meliCode، cardSerial، birthDate، birthPlace، phone، mobile، postalAddress، postalCode | حذف کامل. الزام پوشاندن را مجاز می‌داند؛ ما برای احتیاط کامل حذف می‌کنیم. |
| موقعیت مکانی | latitude، longitude، gpsCoordinate، geoLocation | حذف کامل (ثبت ممنوع) |

شناسه‌ی ادعاشده در تلاش‌های ناموفق ورود، که هنوز به کاربر معتبری متصل نیست، به‌صورت **پوشانده‌شده** در `actor_label` ثبت می‌شود. به این ترتیب هم تحلیل حمله ممکن است و هم داده افشا نمی‌شود:
- شماره تلفن: `0912***4567` — تابع `maskPhone`
- نام کاربری ادمین: `ad***n` — تابع `maskUsername`

رمز عبور، OTP و توکن‌ها در هیچ مسیری وارد رویداد نمی‌شوند. سرویس‌های احراز هویت فقط نتیجه‌ی عملیات و دلیل شکست را ثبت می‌کنند، مثل `invalid_password`، `locked` یا `banned`.

**شواهد:**
- `api/src/common/audit/redact.util.ts`
- `api/src/common/audit/mask.util.ts`
- `api/src/common/audit/audit.service.ts` — تابع `toJson()` که `redact()` را فراخوانی می‌کند
- آزمون روی PostgreSQL واقعی: payload ورودی `{password:'p', phone:'09121234567', ...}` به‌صورت `{"password":"[REDACTED]", "phone":"[REDACTED]", ...}` ذخیره شد.

---

## ۵. FAU_GEN_EXT.1.5 — رویدادهای احراز هویت

**شرح اقدام — پوشش هر بند:**

| # | بند الزام | کاربر عادی | ادمین | وضعیت |
|---|---|---|---|---|
| 1 | ورود موفق | `auth.login`، `auth.login_otp` | `admin_auth.login` | ✅ |
| 2 | ورود ناموفق با دلیل | `auth.login` با `success=false` و دلیل: کاربر نامعتبر، `invalid_password`، `banned`، `not_active` | `admin_auth.login` با دلیل: نام کاربری نامعتبر، `invalid_password`، `locked`، `inactive` | ✅ |
| 3 | خروج دستی | `auth.logout`، `auth.logout_all` | `admin_auth.logout`، `admin_auth.logout_all` | ✅ |
| 4 | انقضای نشست | `auth.session_expired` | `admin_auth.session_expired` | ✅ ثبت در اولین درخواست با توکن منقضی. JWT بدون وضعیت است و «لحظه‌ی انقضا» رویداد سمت سرور ندارد. |
| 5 | قفل شدن حساب | — | `admin_auth.account_locked` (پس از ۵ تلاش ناموفق، ۱۵ دقیقه) | ✅ برای ادمین — ⚠️ کاربر عادی سازوکار قفل حساب ندارد و با rate-limit محافظت می‌شود |
| 6 | بازنشانی رمز (درخواست و نتیجه) | نتیجه: `auth.reset_password` | `admin.reset_password` توسط ادمین ارشد | ⚠️ نتیجه ثبت می‌شود؛ **درخواست** (`forgot-password`) و تأیید OTP بازنشانی هنوز ثبت نمی‌شوند |
| 7 | تغییر رمز | — | `admin_auth.change_password` (موفق و ناموفق) | ✅ |
| 8 | تلاش احراز هویت چندعاملی | ورود با OTP: `auth.login_otp` (موفق/ناموفق) | — | ⚠️ ادمین هنوز 2FA ندارد (TOTP در کد به‌صورت TODO است) |
| 9 | مدیریت کاربران و نقش‌ها | `user.set_status` | `admin.create`، `admin.update` (شامل تغییر نقش)، `admin.reset_password` | ✅ |

**شواهد:**
- `api/src/auth/auth.service.ts` — ثبت‌نام، ورود، OTP، خروج، بازنشانی رمز
- `api/src/admin-auth/admin-auth.service.ts` — ورود، قفل حساب، خروج، تغییر رمز
- `api/src/auth/guards/jwt-auth.guard.ts` و `api/src/admin-auth/guards/admin-jwt-auth.guard.ts` — انقضای نشست و توکن نامعتبر، در متد `handleRequest`
- `api/src/admin-auth/admin-management.controller.ts` — مدیریت ادمین‌ها و نقش‌ها

**باقی‌مانده:**
- ثبت رویداد درخواست بازنشانی رمز (`auth.forgot_password`) و تأیید OTP بازنشانی (`auth.verify_reset_otp`)
- ثبت تأیید OTP ثبت‌نام (`auth.verify_register_otp`)
- قفل حساب کاربر عادی: پیش‌نیاز آن ساخت خود سازوکار قفل است، نه فقط ثبت آن.

---

## ۶. FAU_GEN_EXT.1.6 — تلاش‌های ناموفق مجوزدهی

**شرح اقدام:**
- **ارتقای سطح دسترسی (بند ۱):** دسترسی در پنل ادمین مبتنی بر نقش (RBAC) است. هر endpoint مجوز لازم را با `@RequirePermission` اعلام می‌کند. اگر ادمینی بدون مجوز لازم تلاش کند، مثلاً ادمین پشتیبانی درخواست تأیید برداشت بفرستد، `AdminPermissionGuard` پیش از رد درخواست (403) رویداد `admin_auth.permission_denied` را ثبت می‌کند. این رویداد شامل مجوزهای لازم و مجوزهای موجود فرد، IP و نام کنترلر هدف است.
- **توکن جعلی یا دستکاری‌شده:** درخواست با توکن نامعتبر به‌صورت `auth.invalid_token` یا `admin_auth.invalid_token` ثبت می‌شود.
- **دسترسی هم‌سطح (بند ۲) — جلوگیری انجام می‌شود، ثبت خیر:** همه‌ی کوئری‌های داده‌ی کاربر با شرط `userId` کاربر احراز‌شده فیلتر می‌شوند. در نتیجه درخواست برای منبع کاربر دیگر پاسخ 404 می‌گیرد و وجود یا عدم وجود منبع هم افشا نمی‌شود. از آن‌جا که این پاسخ با «منبع وجود ندارد» یکسان است، تلاش عمدی دسترسی هم‌سطح در حال حاضر رویداد جداگانه‌ای تولید نمی‌کند.

**شواهد:**
- `api/src/admin-auth/guards/admin-permission.guard.ts`
- `api/src/admin-auth/rbac.const.ts` — تعریف مجوزها
- `api/src/wallet/wallet.service.ts` — نمونه‌ی فیلتر کوئری با `userId`

**باقی‌مانده:** برای ثبت تلاش هم‌سطح باید در منابع حساس (کیف‌پول، تراکنش، فاکتور) بررسی شود که شناسه‌ی درخواستی متعلق به کاربر دیگری است یا نه. این بررسی یک کوئری اضافه دارد و فقط در صورت تأیید پیاده‌سازی می‌شود.

---

## ۷. FAU_GEN_EXT.1.7 — تلاش برای دور زدن کنترل‌های امنیتی

**شرح اقدام — پوشش هر بند:**

| # | بند الزام | اقدام | وضعیت |
|---|---|---|---|
| 1 | شکست اعتبارسنجی ورودی (تزریق، فرمت غیرمنتظره) | `ValidationPipe` سراسری با `whitelist` و `forbidNonWhitelisted` هر فیلد ناشناخته یا نوع نامعتبر را رد می‌کند. `AllExceptionsFilter` این رد را به‌عنوان `security.validation_failed` همراه با جزئیات خطا، IP، مسیر و هویت کاربر ثبت می‌کند. | ✅ |
| 2 | نقض منطق کسب‌وکار | سرویس‌ها قواعد کسب‌وکار را اعمال می‌کنند و درخواست ناقض را رد می‌کنند (4xx). اما رد شدن این درخواست‌ها رویداد امنیتی مجزا تولید نمی‌کند. | ❌ باقی‌مانده |
| 3 | فعال شدن ضد-خودکارسازی (rate-limit) | در استعلام عمومی هولوگرام، IP مسدودشده همراه با دلیل، تعداد تلاش ناموفق و زمان پایان مسدودیت در جدول `hologram_rate_limit_blocks` ثبت می‌شود و در پنل (هولوگرام ← امنیت) قابل مشاهده است. `ThrottlerGuard` سراسری (پاسخ 429) هنوز رویداد ثبت نمی‌کند. | ⚠️ جزئی |

**شواهد:**
- `api/src/common/filters/all-exceptions.filter.ts`
- `api/src/main.ts` — `ValidationPipe` و ثبت فیلتر سراسری
- `api/src/hologram/hologram-security.service.ts` — ثبت IP مسدودشده

---

## ۸. FAU_GEN_EXT.1.8 — خطاهای پیش‌بینی‌نشده و شکست کنترل‌های امنیتی

**شرح اقدام:**
- **فیلتر سراسری `AllExceptionsFilter`** همه‌ی استثناهای مدیریت‌نشده و پاسخ‌های 5xx را می‌گیرد. هر مورد در دو مقصد ثبت می‌شود:
  1. لاگ JSON با سطح `error` و stack trace کامل، برای تحلیل علت ریشه‌ای
  2. جدول رویداد به‌صورت `security.unexpected_error` همراه با مسیر، هویت و IP
- برنامه هرگز بی‌پاسخ نمی‌ماند: کلاینت پاسخ 500 استاندارد می‌گیرد و جزئیات داخلی خطا به او افشا نمی‌شود.
- **شکست سازوکارهای امنیتی:**
  - خطا در اتصال به سرویس‌های خارجی، مثل سرویس احراز هویت فینوتک، با کد خطا در جدول `integration_logs` ثبت می‌شود (`IntegrationLogService`).
  - شکست خود زیرساخت رویدادنگاری، مثلاً در دسترس نبودن دیتابیس، به‌صورت هشدار در لاگ JSON ثبت می‌شود و عملیات اصلی را متوقف نمی‌کند.
  - شکست TLS، رمزنگاری/رمزگشایی و اعتبارسنجی امضا، اگر به‌صورت استثنا به لایه‌ی درخواست برسد، از همین مسیر ثبت می‌شود. توکن با امضای نامعتبر هم به‌صورت `invalid_token` ثبت می‌شود.

**شواهد:**
- `api/src/common/filters/all-exceptions.filter.ts`
- `api/src/integrations/logging/integration-log.service.ts`
- نمونه‌ی واقعی از محیط توسعه، ثبت‌شده در لاگ JSON با `trace` کامل:
  `{"level":50,...,"context":"GlobalExceptionFilter","trace":"PrismaClientKnownRequestError: ...","msg":"خطای پیش‌بینی‌نشده: ..."}`

---

## ۹. FAU_STG_EXT.1.1 — کدگذاری داده‌ها (جلوگیری از تزریق رویداد)

**شرح اقدام:**
حمله‌ی «تزریق رویداد» (Log Injection/Forging) معمولاً با وارد کردن کاراکتر خط جدید (CR/LF) یا کاراکترهای کنترلی در ورودی انجام می‌شود تا در فایل لاگ متنی یک رکورد جعلی ساخته شود. در این محصول هر دو مسیر ذخیره‌ی رویداد در برابر این حمله مقاوم‌اند:

1. **جداول رویداد:** همه‌ی مقادیر، مثل User-Agent، نام کاربری واردشده و پیام خطا، از طریق Prisma به‌صورت **پارامتری** (prepared statement) در ستون‌های جداگانه ذخیره می‌شوند و هیچ‌گاه به رشته‌ی SQL یا متن لاگ الحاق نمی‌شوند. به این ترتیب هم تزریق SQL و هم جعل رکورد ممکن نیست: هر ورودی، هر محتوایی داشته باشد، فقط مقدار یک فیلد از یک رکورد است. تنها کوئری خام این بخش (`SELECT ... FOR UPDATE`) هم از tagged template پارامتری Prisma استفاده می‌کند.
2. **لاگ JSON:** pino هر مقدار را با قواعد JSON کدگذاری می‌کند؛ خط جدید به `\n`، کوتیشن به `\"` و کاراکترهای کنترلی به `\uXXXX` تبدیل می‌شوند. بنابراین ورودی مهاجم نمی‌تواند یک خط لاگ جدید بسازد و هر خط همیشه دقیقاً یک شیء JSON معتبر است.
3. **نمایش در پنل:** مقادیر در React به‌صورت متن رندر می‌شوند، که به‌طور پیش‌فرض escape می‌شود. به همین دلیل محتوای مخرب ذخیره‌شده، مثل اسکریپت XSS در User-Agent، هنگام مشاهده‌ی لاگ اجرا نمی‌شود.
4. بخش ۱ هم ورودی را پیش از رسیدن به منطق برنامه محدود می‌کند: `ValidationPipe` با `whitelist` فیلدهای ناشناخته را رد می‌کند.

**شواهد:**
- `api/src/common/audit/audit.service.ts` — استفاده‌ی انحصاری از Prisma و `$queryRaw` پارامتری
- `api/src/common/logging/pino-logger.service.ts`
- `admin/app/(dashboard)/audit-log/page.tsx` — رندر متنی بدون `dangerouslySetInnerHTML`

---

## ۱۰. FAU_STG_EXT.1.2 — حفاظت از رویدادها در برابر دسترسی غیرمجاز و تغییر

**شرح اقدام:**

### الف) کنترل دسترسی و محرمانگی (اصل حداقل دسترسی، مبتنی بر نقش)
- مشاهده‌ی رویدادها فقط برای ادمین‌هایی ممکن است که نقش آن‌ها مجوز `admin.audit_log.view` را دارد. این مجوز با `AdminJwtAuthGuard` و `AdminPermissionGuard` روی کل کنترلر اعمال می‌شود و منوی پنل هم فقط برای دارندگان همین مجوز نمایش داده می‌شود.
- **هیچ endpointی برای ویرایش یا حذف رویداد وجود ندارد.** کنترلر رویدادها فقط متدهای `GET` دارد.
- کاربران عادی هیچ دسترسی‌ای به رویدادها ندارند.
- تلاش ادمین بدون مجوز برای مشاهده‌ی لاگ‌ها خودش به‌صورت `admin_auth.permission_denied` ثبت می‌شود.

### ب) یکپارچگی و تشخیص دستکاری — زنجیره‌ی hash
- هر رکورد دو فیلد دارد: `prev_hash`، که hash رکورد قبلی است، و `hash` که از فرمول زیر به دست می‌آید:
  `hash = SHA-256( prev_hash | canonical_json(تمام فیلدهای رکورد + prev_hash) )`
- `canonical_json` کلیدها را در همه‌ی سطوح تودرتو مرتب می‌کند. در نتیجه hash به ترتیب ذخیره‌ی کلیدها در `jsonb` پستگرس وابسته نیست و رکورد سالم هرگز به‌اشتباه «دستکاری‌شده» تشخیص داده نمی‌شود.
- دو زنجیره‌ی مستقل وجود دارد، یکی برای ادمین و یکی برای کاربران. آخرین hash هر زنجیره در جدول `audit_chain_state` نگهداری می‌شود.
- **جلوگیری از شاخه شدن زنجیره در نوشتن همزمان:** درج هر رکورد در یک تراکنش انجام می‌شود که ردیف زنجیره را با `SELECT ... FOR UPDATE` قفل می‌کند.
- در نتیجه تغییر هر فیلد از هر رکورد، از جمله زمان، IP، کاربر یا جزئیات، و همچنین حذف یا درج رکورد در میانه‌ی زنجیره، در بازبینی کشف می‌شود و **شناسه‌ی اولین رکورد آسیب‌دیده** گزارش می‌شود.
- **بازبینی:** `GET /admin/audit-log/verify` (با مجوز `admin.audit_log.view`) کل زنجیره را از ابتدا بازمحاسبه می‌کند. در پنل: گزارش فعالیت‌ها ← تب «یکپارچگی رویدادها» ← دکمه‌ی «بازبینی یکپارچگی».
- **یکپارچگی ارجاعی:** کلید خارجی رکورد رویداد به ادمین صریحاً `ON DELETE RESTRICT` است. بنابراین حذف یک ادمین نمی‌تواند رویدادهای او را حذف یا تغییر دهد.

**نتیجه‌ی آزمون روی PostgreSQL 16:**

| سناریو | نتیجه |
|---|---|
| ۲ رویداد عادی + ۲۰ رویداد همزمان | `{"valid":true,"checked":22}` |
| تغییر مستقیم `ip` یک رکورد با SQL در دیتابیس | `{"valid":false,"brokenAtId":"967f2d7d-…"}` — دستکاری دقیقاً کشف شد |

**شواهد:**
- `api/src/common/audit/hash-chain.util.ts` — SHA-256 و canonical JSON
- `api/src/common/audit/audit.service.ts` — `logAdmin`، `logUser`، `lockChain` و `verifyChain`
- `api/src/admin-auth/admin-audit-log.controller.ts` — endpoint بازبینی و کنترل دسترسی
- مایگریشن `20260922120000_audit_log_hash_chain_and_utc`
- پنل: `admin/app/(dashboard)/audit-log/page.tsx`

**محدودیت و توصیه‌ی تکمیلی:**
زنجیره‌ی hash هر تغییری را که بدون بازنویسی کامل زنجیره انجام شود کشف می‌کند. اما مهاجمی که به دیتابیس دسترسی نوشتن کامل دارد، از نظر تئوری می‌تواند همه‌ی hashها را بازمحاسبه کند، چون در این فرمول کلید مخفی وجود ندارد. توصیه‌های تکمیلی برای محیط عملیاتی:
1. کاربر دیتابیسِ برنامه روی جداول `audit_logs` و `admin_audit_logs` فقط مجوز `INSERT` و `SELECT` داشته باشد و مجوزهای `UPDATE` و `DELETE` از آن `REVOKE` شوند.
2. مقدار `last_hash` از جدول `audit_chain_state` به‌صورت دوره‌ای (مثلاً روزانه) در یک مخزن خارج از دیتابیس و غیرقابل‌تغییر (WORM) یا در SIEM ثبت شود. با این کار بازنویسی کامل زنجیره هم قابل کشف می‌شود.
3. در صورت نیاز به عدم‌انکار قوی‌تر، می‌توان hash را به HMAC یا امضای دیجیتال با کلیدی خارج از دیتابیس، مثلاً در KMS یا HSM، ارتقا داد.

---

## پیوست الف — فهرست رویدادها

**احراز هویت کاربر:** `auth.register`، `auth.login`، `auth.login_otp`، `auth.logout`، `auth.logout_all`، `auth.reset_password`، `auth.session_expired`، `auth.invalid_token`

**احراز هویت ادمین:** `admin_auth.login`، `admin_auth.logout`، `admin_auth.logout_all`، `admin_auth.change_password`، `admin_auth.account_locked`، `admin_auth.permission_denied`، `admin_auth.session_expired`، `admin_auth.invalid_token`

**امنیتی / سیستمی:** `security.validation_failed`، `security.unexpected_error`

**اقدامات حساس پنل ادمین (۵۷ مورد):**
- مدیریت ادمین و کاربر: `admin.create`، `admin.update`، `admin.reset_password`، `user.set_status`، `legal_profile.approve/reject`
- مالی: `wallet.adjust`، `withdrawal.approve/reject`، `deposit.approve/reject/review_start/request_new_receipt/receipt_view`، `invoice.cancel`، `payroll.create_plan/update_plan/add_users/remove_user/execute`
- عملیات: `physical_delivery.approve/ship/deliver/cancel`، `shop_orders.process/ship/deliver/cancel`، `shop.product.*` (۹ مورد)
- پشتیبانی: `tickets.assign/change_status/change_priority/add_message/close/reopen`، `ticket_categories.create/update/delete`
- امنیت و یکپارچه‌سازی: `hologram.batch.create`، `hologram.code.assign/revoke`، `hologram.security.unblock_ip/update_settings`، `integrations.credential.set`، `integrations.provider.update`، `integrations.service.update`، `integrations.provider_service.update`، `integrations.finotech.test_connection`

## پیوست ب — نمونه‌ی یک رکورد رویداد

```json
{
  "id": "5b0e9c2a-…",
  "created_at": "2026-09-23T09:18:32.998Z",
  "source": "AdminAuthService",
  "admin_user_id": null,
  "actor_label": "ad***n",
  "ip": "203.0.113.24",
  "user_agent": "Mozilla/5.0 ...",
  "action": "admin_auth.login",
  "entity_type": "admin_auth",
  "success": false,
  "new_value": { "reason": "invalid_password" },
  "prev_hash": "3f1c…",
  "hash": "a91e…"
}
```

## پیوست ج — استقرار

1. اعمال مایگریشن‌ها: در پوشه‌ی `api` دستور `pnpm prisma migrate deploy` و سپس `pnpm prisma generate` را اجرا کنید.
   مایگریشن‌های مرتبط: `20260922110000_add_audit_log_metadata` و `20260922120000_audit_log_hash_chain_and_utc`
2. همگام‌سازی NTP روی سرور برنامه و دیتابیس (بخش ۲).
3. متغیر اختیاری `LOG_LEVEL` برای سطح لاگ JSON؛ پیش‌فرض `info`.
4. هدایت stdout برنامه به سامانه‌ی جمع‌آوری لاگ (SIEM/ELK).
5. اعمال توصیه‌های بخش ۱۰-ب روی مجوزهای کاربر دیتابیس.

رکوردهای رویدادی که پیش از این تغییرات ثبت شده‌اند `hash` ندارند و در بازبینی نادیده گرفته می‌شوند. زنجیره از اولین رویداد پس از استقرار آغاز می‌شود.

## پیوست د — روش بررسی برای ارزیاب

| الزام | روش بررسی |
|---|---|
| 1.1، 1.5 | یک ورود ناموفق و یک ورود موفق انجام دهید. در پنل ← گزارش فعالیت‌ها، زمان، منبع، IP، نتیجه و `actor_label` را مشاهده کنید. |
| 1.2 | در دیتابیس `\d admin_audit_logs` را اجرا کنید؛ نوع `created_at` باید `timestamp(3) with time zone` باشد. |
| 1.3 | خروجی stdout برنامه را ببینید؛ هر خط باید یک JSON معتبر باشد. |
| 1.4 | در ستون `new_value` رویدادهای اقدامات ادمین، کلیدهای حساس (مثل `phone`، `password`، `token`، `cardNumber`) به‌جای مقدار واقعی `[REDACTED]` دارند. هیچ رکوردی رمز عبور، OTP یا توکن ندارد. |
| 1.6 | با ادمینی که مجوز ندارد صفحه‌ای را باز کنید. رویداد `admin_auth.permission_denied` ثبت می‌شود. |
| 1.7 | درخواستی با فیلد اضافه، مثلاً `{"isAdmin":true}`، به یک endpoint بفرستید. رویداد `security.validation_failed` ثبت می‌شود. |
| STG.1.2 | تب «یکپارچگی رویدادها» ← بازبینی: وضعیت «سالم». سپس با SQL یک فیلد را تغییر دهید و دوباره بازبینی کنید: وضعیت «دستکاری‌شده» همراه با شناسه‌ی رکورد. |
