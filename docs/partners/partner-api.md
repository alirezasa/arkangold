# API شرکای فروش (نسخه ۱)

برای سرویس‌های خرید اقساطی (اسنپ‌پی، دیجی‌پی، …) و اپلیکیشن‌های همکاری که طلای آب‌شده‌ی آرکان گلد را به مشتریان خود
می‌فروشند. منطق مالی و اسناد حسابداری در [advanced-accounting.md](../accounting/advanced-accounting.md) آمده است.

## فعال‌سازی

1. تنظیم سیستم `partner.api.enabled = true`.
2. شرکای فروش ← ویرایش شریک: «دسترسی API فعال» و در صورت نیاز فهرست IPهای مجاز.
3. شرکای فروش ← جزئیات شریک ← «ساخت کلید API». کلید فقط یک‌بار نمایش داده می‌شود و فقط هش SHA-256 آن ذخیره می‌شود.

همه‌ی درخواست‌ها با هدر `x-api-key: <key>` ارسال می‌شوند. سقف: ۱۲۰ درخواست در دقیقه.
مبالغ به **ریال** و وزن‌ها به **گرم طلای ۱۸ عیار (۷۵۰)** است.

## پیش‌نیاز مشتری

مشتری باید با همان شماره موبایل در آرکان گلد ثبت‌نام و احراز هویت کرده باشد؛ کد ملی ارسالی با صاحب شماره تطبیق داده می‌شود.

## Endpointها

### `GET /partner-api/v1/price`

```json
{ "unit": "GRAM_750", "pricePerGramRial": "52000000", "feePercent": "0", "taxPercent": "0",
  "partnerCommissionPercent": "3", "quotedAt": "2026-09-26T08:00:00.000Z" }
```

### `POST /partner-api/v1/orders`

ثبت سفارش/قرارداد با قیمت قفل‌شده. `externalRef` کلید یکتای سفارش نزد شریک است؛ ارسال مجدد همان مقدار، همان سفارش
را برمی‌گرداند (`alreadyExists: true`). یکی از `amountGrams` یا `amountRial` (مبلغ کل با کارمزد و مالیات) الزامی است.

```json
{
  "externalRef": "SP-20260926-000123",
  "customerPhone": "09120000000",
  "customerNationalCode": "0012345678",
  "amountGrams": "2.5",
  "downPaymentRial": "50000000",
  "installmentCount": 4,
  "installmentPlan": { "monthly": true }
}
```

پاسخ:

```json
{
  "alreadyExists": false,
  "order": {
    "orderNumber": "AG-1405-PTO-000001", "externalRef": "SP-20260926-000123", "status": "PENDING",
    "productKind": "MELTED_GOLD", "amountGrams": "2.5", "pricePerGramRial": "52000000",
    "goldValueRial": "130000000", "feeRial": "0", "taxRial": "0", "totalRial": "130000000",
    "commissionRial": "3900000", "netPayableToArkanRial": "126100000",
    "dueDate": null, "confirmedAt": null, "settledAt": null, "createdAt": "..."
  }
}
```

### `POST /partner-api/v1/orders/{externalRef}/confirm`

پس از تأیید قرارداد اقساطی و تضمین پرداخت توسط شریک. طلا به کیف پول مشتری واریز و فاکتور صادر می‌شود؛
`dueDate` = زمان تأیید + مهلت تسویه‌ی قرارداد. قیمت سفارش‌های API فقط تا `partner.quote_ttl_minutes` (پیش‌فرض ۳۰ دقیقه)
معتبر است؛ پس از آن سفارش را لغو و دوباره ثبت کنید. فراخوانی مجدد، `alreadyProcessed: true` برمی‌گرداند.

### `POST /partner-api/v1/orders/{externalRef}/cancel`

`{ "reason": "انصراف مشتری" }` — سفارش در انتظار لغو می‌شود؛ سفارش تأییدشده مسترد می‌شود (طلا از کیف پول مشتری کسر
و سند برگشت صادر می‌شود — اگر مشتری طلا را فروخته یا منتقل کرده باشد، خطای ۴۰۹ برمی‌گردد).

### `GET /partner-api/v1/orders/{externalRef}`

وضعیت سفارش: `PENDING`، `CONFIRMED`، `SETTLED`، `CANCELLED`، `REFUNDED`.

### `GET /partner-api/v1/statement?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1`

صورتحساب شریک نزد آرکان گلد (فروش‌ها، استردادها، تسویه‌ها و مانده).

## خطاها

| کد | علت |
|---|---|
| 401 | کلید نامعتبر |
| 403 | شریک یا API غیرفعال، IP غیرمجاز، قرارداد منقضی |
| 400 | مشتری ثبت‌نام/احراز نکرده، کد ملی مغایر، مبلغ خارج از حد قرارداد |
| 409 | قیمت منقضی، سقف اعتبار شریک، موجودی آزاد ناکافی برای استرداد |
| 503 | API شرکا خاموش است |

## اتصال مستقیم به API اسنپ‌پی/دیجی‌پی

آداپتورهای `SNAPPPAY`، `DIGIPAY`، `TARA` و `LENDO` در `api/src/partners/providers` با قرارداد
`InstallmentProvider` (ایجاد درخواست و لینک هدایت، verify، لغو، گزارش تسویه) آماده‌اند و تا دریافت مستندات و کلید
هر شریک در حالت «پیکربندی‌نشده» هستند. تا آن زمان سفارش‌ها از همین API یا پنل ثبت می‌شوند و اسناد مالی کامل صادر می‌شود.
