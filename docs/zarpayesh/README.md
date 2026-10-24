# اتصال به سامانه ناظر بر خرید و فروش بر خط طلا و نقره (زر پایش)

پیاده‌سازی خط به خط «API Developer Guide» نسخه‌ی **۳.۰.۰.۴** (پاییز ۱۴۰۵) — Host: `http://api.rpmms.ir`، Base Path: `/api`،
`Authorization: Bearer {ACCESS_TOKEN}`، `Accept: application/json`.

> **پیش‌فرض خاموش است.** تا وقتی ادمین در پنل «سیستم ← سامانه ناظر طلا (زر پایش)» کلید را روشن نکند، هیچ معامله‌ای
> به سامانه ناظر ارسال نمی‌شود و رفتار خرید/فروش طلای آب‌شده دقیقاً مثل قبل است.

## ۱. نگاشت مستند به کد

| # | متد مستند | مسیر | پیاده‌سازی (`api/src/zarpayesh/`) | استفاده |
|---|-----------|------|------------------------------------|---------|
| A1 | Login | `POST /api/auth/session` | `ZarPayeshClientService.login` | خودکار هنگام نیاز به توکن؛ دکمه‌ی Login پنل |
| A2 | Refresh Token | `PUT /api/auth/session` | `refreshToken` | خودکار ۶۰ ثانیه پیش از انقضای توکن؛ در صورت شکست ← Login |
| A3 | Logout | `DELETE /api/auth/session` | `logout` | دکمه‌ی Logout پنل |
| 1 | Reserve | `POST api/aure/Aurelink/Reserve` | `reserve` ← `ZarPayeshTradeService.reserve` | پیش از هر سفارش طلای آب‌شده؛ رزرو آزمایشی پنل |
| 2 | Approve | `POST .../Approve` | `approve` ← `ZarPayeshTradeService.approve` | آخرین گام داخل تراکنش سفارش؛ تأیید دستی پنل |
| 3 | Cancel | `POST .../Cancel` | `cancel` ← `cancelTrade` | شکست سفارش داخلی؛ پیگیری خودکار؛ لغو دستی پنل |
| 4 | TxnFollowup | `GET .../TxnFollowup?srcTrackingNumber=` | `txnFollowup` ← `followupTrade` | نتیجه‌ی نامشخص (Timeout، خطای ۱۰۴۷)؛ پیگیری خودکار هر دقیقه؛ پنل |
| 5 | GetUserBalance | `POST .../GetUserBalance` | `getUserBalance` | مقایسه‌ی موجودی سامانه ناظر با کیف طلای کاربر (پنل) |
| 6 | MakeDeliveries | `POST .../MakeDeliveries` | `makeDeliveries` ← `ZarPayeshDeliveryService.create` | تب «ارسال دارایی» |
| 7 | MakeDeliverFollowup | `GET .../MakeDeliverFollowup?srcTrackingNumber=` | `makeDeliverFollowup` | پیگیری ثبت ارسال نامشخص |
| 8 | SetDeliveries | `POST .../SetDeliveries` | `setDeliveries` | مراحل ۱ Approve (با کد تأیید)، ۲ Ship، ۳ Delivery، ۴ Cancel |
| 9 | GetDeliveries | `POST .../GetDeliveries` | `getDeliveries` | استعلام مرسوله (`Trackingcode` / `srcTrackingcode`) |
| 10 | Vaultlist | `GET .../Vaultlist` | `vaultList` | انتخاب خزانه (`fkVault` → `vaultId`) در تنظیمات؛ آزمون اتصال |
| 11 | AddPlatformUsers | `POST .../AddPlatformUsers` | `addPlatformUsers` ← `ZarPayeshUsersService` | ثبت خودکار کاربر پیش از اولین معامله (۱۰۱۶ = قبلاً ثبت شده) |
| 12 | EditPlatformUsers | `POST .../EditPlatformUsers` | `editPlatformUsers` | همگام‌سازی کاربر از پنل (کد ملی غیرقابل ویرایش) |
| 13 | Typelist | `GET .../Typelist` | `typeList` | انتخاب نوع فلز (`typeId`) در تنظیمات |
| 14 | cities | `GET .../cities?fkstate=` | `cities` | انتخاب `fkCity` کاربر |
| 15 | states | `GET .../states` | `states` | آزمون اتصال؛ انتخاب استان |
| 16 | PayTypelist | `GET .../PayTypelist` | `payTypeList` | آزمون اتصال (Table 2) |

- **رمزنگاری کد ملی/موبایل** (`zarpayesh-crypto.ts`): ترجمه‌ی خط به خط نمونه‌ی C# — AES-128-GCM، کلید ۱۶ بایتی Hex،
  Nonce تصادفی ۱۲ بایتی، Tag ۱۶ بایتی، خروجی `Base64(Version=1 + Nonce + CipherText + Tag)`. موبایل پیش از رمز شدن
  با صفر اول نرمال می‌شود؛ ساختار کد ملی (خطای ۱۰۵۴) پیش از ارسال بررسی می‌شود.
- **پوشش پاسخ**: هم پاسخ مستقیم و هم پوشش `{ version, statusCode, message, isError, responseException, result }`
  پشتیبانی می‌شود. کدهای خطای ۱۰۰۱ تا ۱۰۹۹ از `statusCode`/`message`/`responseException` استخراج و به متن مستند نگاشت می‌شوند.
- **long**: شناسه‌های بزرگ‌تر از `Number.MAX_SAFE_INTEGER` (مثل `reserveCode`) بدون گرد شدن خوانده و ارسال می‌شوند.
- **amount** همیشه به **میلی‌گرم و بدون اعشار** است؛ وقتی کلید روشن است قفل قیمت به میلی‌گرم کامل گرد می‌شود.

## ۲. جریان معامله (وقتی روشن است)

```
کاربر: قفل قیمت (lockPrice) ── مقدار به میلی‌گرم کامل گرد می‌شود؛ داده‌ی هویتی لازم بررسی می‌شود
کاربر: تأیید سفارش (createOrder)
  ├─ ۱) prepareOrder — بیرون از تراکنش پایگاه داده
  │     ├─ AddPlatformUsers (فقط بار اول هر کاربر)
  │     └─ Reserve(srcTrackingNumber یکتا از sequence) ── رد شد؟ → معامله انجام نمی‌شود (پیام فارسی به کاربر)
  ├─ ۲) تراکنش داخلی: قفل کیف پول، کنترل موجودی، سفارش، تراکنش‌ها، سند حسابداری
  │     └─ آخرین گام: Approve(rrn = شناسه‌ی سفارش) ── رد شد؟ → rollback کامل سفارش داخلی
  │            └─ Timeout/۱۰۴۷؟ → TxnFollowup: «تایید شده» = موفق، در غیر این صورت rollback
  └─ ۳) settle — رزرو تأییدنشده Cancel می‌شود؛ تأیید شده ولی rollback شده → «نیازمند بررسی»
پیگیری خودکار (هر دقیقه): رکوردهای «در حال رزرو / رزرو شده / نامشخص» بیش از ۲ دقیقه → TxnFollowup و تعیین تکلیف
```

- `totalPrice` = ارزش طلای معامله (مقدار × قیمت هر گرم، بدون کارمزد و مالیات)؛ `unitPrice` بر اساس تنظیم «مبنای قیمت واحد».
- `payType` پیش‌فرض برای خرید و فروش: **۱۱ — کیف پول کاربر نزد سکو** (قابل تغییر در پنل).
- `orderType`: ۱ خرید کاربر از پلتفرم، ۲ فروش کاربر به پلتفرم.

## ۳. پنل ادمین — «سیستم ← سامانه ناظر طلا (زر پایش)» (`/zarpayesh`)

| تب | امکانات |
|----|---------|
| وضعیت و راه‌اندازی | کلید روشن/خاموش (فقط با تکمیل پیش‌شرط‌ها)، اعتبارنامه‌ها (رمزشده)، آزمون اتصال ۸ مرحله‌ای، Login/Refresh/Logout، آزمون Encrypt/Decrypt، تنظیمات (Host، Timeout، typeId، vaultId، payType، مبنای unitPrice، ثبت خودکار کاربر) |
| معاملات | فهرست با فیلتر وضعیت/«نیازمند بررسی»/جستجو، جزئیات + همه‌ی فراخوانی‌های همان معامله، TxnFollowup، Cancel، Approve، ثبت بررسی، رزرو آزمایشی |
| کاربران و استعلام‌ها | ثبت/ویرایش کاربر، پیش‌نمایش داده‌ی ارسالی، GetUserBalance در کنار موجودی کیف طلا، Typelist، Vaultlist، PayTypelist، states، cities، TxnFollowup |
| ارسال دارایی | MakeDeliveries، SetDeliveries (Approve با کد تأیید)، GetDeliveries، MakeDeliverFollowup |
| لاگ‌ها و کدهای خطا | لاگ کامل هر فراخوانی (درخواست/پاسخ پاک‌سازی‌شده، HTTP، کد خطا، مدت، منشأ SYSTEM/ADMIN/CRON)، جدول خطاهای ۱۰۰۱–۱۰۹۹ |

**دسترسی‌ها**: `zarpayesh.view` (مشاهده — به نقش «مدیر مالی» هم داده شد)، `zarpayesh.manage` (تنظیمات، آزمون، روشن/خاموش و
عملیات)، `integrations.credentials.manage` (ثبت اعتبارنامه). همه‌ی اقدامات در گزارش فعالیت ادمین (زنجیره‌ی hash) ثبت می‌شوند.

**پیش‌شرط‌های روشن کردن**: هر سه اعتبارنامه ثبت شده باشند، آزمون کامل اتصال در ۷ روز اخیر موفق باشد، `typeId` و `vaultId`
انتخاب شده باشند. تغییر اعتبارنامه یا آدرس سرور، تأیید اتصال را باطل می‌کند.

## ۴. امنیت و نگهداری داده

- نام کاربری، رمز عبور و کلید AES با AES-256-GCM (همان زیرساخت Credential یکپارچه‌سازی‌ها) رمز و فقط پوشانده نمایش داده می‌شوند.
- توکن/رفرش‌توکن رمزشده در Redis نگهداری و بین نمونه‌های API مشترک است.
- در لاگ‌ها رمز عبور و توکن حذف و کد ملی/موبایل فقط پوشانده ذخیره می‌شوند؛ نگهداری لاگ ۲ سال (`ZARPAYESH_LOG_RETENTION_DAYS`).

## ۵. جداول پایگاه داده (مهاجرت `20261024090000_zarpayesh_supervisor`)

`zarpayesh_config` (یک ردیف، `enabled=false`)، `zarpayesh_users`، `zarpayesh_trades`، `zarpayesh_deliveries`،
`zarpayesh_api_logs` و sequence `zarpayesh_src_tracking_seq` (شروع از ۱۰۰۰۰۰۰۰۰۱).

## ۶. آزمون‌ها

```bash
cd api
npx jest src/zarpayesh src/market                     # رمزنگاری، کلاینت در برابر سرور شبیه‌سازی‌شده، جریان TradingService
INTEGRATION_DATABASE_URL=postgresql://... npx jest zarpayesh-trade   # جریان کامل روی PostgreSQL واقعی
```

## ۷. مواردی که باید با زر پایش هماهنگ/تأیید شود

1. **نمونه‌ی رمزنگاری با کلید اختصاصی**: نمونه‌های رمزشده‌ی صفحه‌ی ۳۱ مستند با کلید نمونه‌ی صفحه‌ی ۳۰ رمزگشایی نمی‌شوند
   (چیدمان و طول بایت‌ها دقیقاً درست است ولی Tag تطبیق نمی‌کند — با کلید دیگری ساخته شده‌اند). یک نمونه با کلید اختصاصی آرکان گلد
   بگیرید و با ابزار Decrypt پنل تطبیق دهید.
2. **مبنای `unitPrice`**: ریال به ازای هر گرم یا هر میلی‌گرم (پیش‌فرض: گرم).
3. **`totalPrice`**: شامل کارمزد/مالیات باشد یا فقط ارزش طلا (پیش‌فرض: فقط ارزش طلا).
4. **طول/قالب `rrn`** برای پرداخت از کیف پول (پیش‌فرض: شناسه‌ی UUID سفارش، ۳۶ کاراکتر).
5. **HTTPS**: اگر سرور HTTPS ارائه می‌کند آدرس را به `https://api.rpmms.ir` تغییر دهید.
6. **IP Whitelist**: IP خروجی سرور API آرکان گلد را به زر پایش اعلام کنید.
7. **محیط آزمون (Sandbox)**: در صورت وجود، ابتدا آدرس سرور آزمون را در تنظیمات قرار دهید.
