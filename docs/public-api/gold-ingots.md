# API عمومی شمش طلا (برای صفحه اصلی arkan.gold)

این API بدون نیاز به ورود، لیست کامل شمش‌های طلا را با تصاویر، مشخصات، قیمت لحظه‌ای و **لینک خرید** برمی‌گرداند تا در سایت اصلی نمایش داده شود.

| مورد | مقدار |
|---|---|
| آدرس پایه | `https://api.arkan.gold` |
| احراز هویت | ندارد (عمومی) |
| CORS | `arkan.gold` و `www.arkan.gold` مجازند (دامنه‌ی دیگر: `CORS_EXTRA_ORIGINS`) |
| کش | پاسخ‌ها ۳۰ ثانیه کش می‌شوند (`Cache-Control: public, max-age=30, stale-while-revalidate=60`) |
| محدودیت نرخ | ۱۲۰ درخواست در دقیقه برای هر IP |
| واحد پول | همه مبالغ **تومان** و به‌صورت رشته‌ی عدد صحیح |

فقط محصولات **فعال** از دسته‌ی `gold-ingot` برگردانده می‌شوند. اگر خدمت «شمش طلا» از پنل ادمین غیرفعال شود، لیست خالی با `serviceEnabled: false` برمی‌گردد و صفحه‌ی جزئیات ۴۰۴ می‌دهد.

## ۱. لیست شمش‌ها

```
GET /public/gold-ingots?page=1&limit=20&inStock=true
```

| پارامتر | پیش‌فرض | توضیح |
|---|---|---|
| `page` | `1` | شماره صفحه |
| `limit` | `20` | تعداد در هر صفحه (حداکثر ۵۰) |
| `inStock` | `false` | با `true` فقط شمش‌های موجود |

نمونه پاسخ:

```json
{
  "serviceEnabled": true,
  "currency": "TOMAN",
  "generatedAt": "2026-10-01T08:30:00.000Z",
  "data": [
    {
      "id": "6c1e…",
      "slug": "shemsh-1-gram",
      "name": "شمش طلا ۱ گرمی",
      "shortDescription": "شمش ۲۴ عیار با بسته‌بندی پلمب",
      "description": "توضیحات کامل محصول…",
      "specifications": [{ "label": "عیار", "value": "۹۹۵" }],
      "purityKarat": "K24",
      "pricingMode": "FIXED",
      "livePricing": true,
      "category": { "name": "شمش طلا", "slug": "gold-ingot" },
      "primaryImageUrl": "https://api.arkan.gold/uploads/products/abc.webp",
      "images": [
        { "url": "https://api.arkan.gold/uploads/products/abc.webp", "altText": "شمش طلا ۱ گرمی", "isPrimary": true }
      ],
      "inStock": true,
      "priceFromToman": "10450000",
      "priceToToman": "10450000",
      "weightRange": null,
      "variants": [
        {
          "id": "9f2a…",
          "sku": "ING-1G",
          "weightGrams": "1",
          "finalPriceToman": "10450000",
          "inStock": true,
          "buyUrl": "https://app.arkan.gold/dashboard/gold-ingot/shemsh-1-gram?variant=9f2a…"
        }
      ],
      "buyUrl": "https://app.arkan.gold/dashboard/gold-ingot/shemsh-1-gram"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1,
  "totalPages": 1
}
```

- `variants`: وزن‌های قابل خرید (مرتب‌شده بر اساس وزن). هر کدام `buyUrl` خودش را دارد که همان وزن را در اپ از پیش انتخاب می‌کند.
- `weightRange`: فقط برای محصولات بازه‌وزنی (`pricingMode = WEIGHT_RANGE`)؛ در این حالت `variants` خالی است.
- `priceFromToman` / `priceToToman`: بازه‌ی قیمت برای کارت محصول (از تنوع‌های موجود؛ اگر هیچ‌کدام موجود نباشد، از همه).
- `livePricing`: قیمت از قیمت لحظه‌ای طلا محاسبه شده است.

## ۲. جزئیات یک شمش

```
GET /public/gold-ingots/{slug}
```

همان ساختار یک آیتم لیست داخل `data`، به‌علاوه‌ی `packagingOptions` (طرح‌های بسته‌بندی قابل انتخاب، با `imageUrl` مطلق و `priceToman`).

## ۳. دکمه «افزودن به سبد» و مسیر کاربر

دکمه را مستقیماً به `buyUrl` (یا `variants[i].buyUrl` برای وزن انتخابی) لینک کنید:

1. کاربر وارد `https://app.arkan.gold/dashboard/gold-ingot/{slug}` می‌شود.
2. اگر وارد نشده باشد، به `/login?next=…` هدایت می‌شود؛ از آنجا می‌تواند ثبت‌نام هم کند. مسیر محصول در طول ورود/ثبت‌نام حفظ می‌شود.
3. اگر احراز هویتش کامل نشده باشد، به صفحه‌ی احراز هویت می‌رود. پس از تایید، دکمه‌ی «ادامه خرید» او را به همان محصول برمی‌گرداند. برای کاربر حقوقی، تایید پروفایل حقوقی هم لازم است.
4. در صفحه‌ی محصول (با وزن از پیش انتخاب‌شده)، کاربر محصول را به سبد اضافه می‌کند و پرداخت را انجام می‌دهد.

> مقصد بازگشت فقط مسیرهای داخلی `/dashboard/...` را می‌پذیرد (جلوگیری از open redirect).

## ۴. نمونه‌ی استفاده در سایت (HTML + JS)

```html
<div id="arkan-ingots" dir="rtl"></div>
<script>
  (async function () {
    const root = document.getElementById("arkan-ingots");
    const fmt = (v) => Number(v).toLocaleString("fa-IR");
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    try {
      const res = await fetch("https://api.arkan.gold/public/gold-ingots?limit=12");
      const { serviceEnabled, data } = await res.json();
      if (!serviceEnabled || !data.length) return;
      root.innerHTML = data.map((p) => `
        <article class="ingot-card">
          ${p.primaryImageUrl ? `<img src="${esc(p.primaryImageUrl)}" alt="${esc(p.name)}" loading="lazy">` : ""}
          <h3>${esc(p.name)}</h3>
          ${p.shortDescription ? `<p>${esc(p.shortDescription)}</p>` : ""}
          <strong>${p.priceFromToman ? `از ${fmt(p.priceFromToman)} تومان` : ""}</strong>
          ${p.inStock
            ? `<a class="btn" href="${esc(p.buyUrl)}">افزودن به سبد خرید</a>`
            : `<span class="out">ناموجود</span>`}
        </article>`).join("");
    } catch (e) {
      console.error("arkan ingots", e);
    }
  })();
</script>
```

اگر سایت (مثلاً وردپرس) این API را سمت سرور فراخوانی می‌کند، همه‌ی درخواست‌ها از یک IP می‌آیند. پاسخ را حداقل ۳۰ ثانیه کش کنید تا به محدودیت نرخ نخورید.

## تنظیمات سرور API

| متغیر | پیش‌فرض production | کاربرد |
|---|---|---|
| `PUBLIC_API_URL` | `https://api.arkan.gold` | ساخت آدرس مطلق تصاویر |
| `NEXT_PUBLIC_APP_URL` | `https://app.arkan.gold` | ساخت `buyUrl` |
| `CORS_EXTRA_ORIGINS` | — | دامنه‌های اضافه‌ی مجاز برای فراخوانی از مرورگر |
