# اتصال سرویس API (رانفلر) به زر پایش از مسیر MPLS شاپرک — راهنمای ۰ تا ۱۰۰

سرویس `api` روی رانفلر است و به لینک MPLS شاپرک دسترسی ندارد. لینک MPLS روی **هاست اختصاصی اوبونتو داخل ایران**
تحویل می‌شود و این هاست نقش **رله** را دارد:

```
 ┌────────────────────┐   اینترنت: HTTPS + mTLS + کلید رله   ┌──────────────────────────┐   لینک MPLS   ┌──────────────┐
 │ رانفلر: سرویس api  │ ───────────────────────────────────▶ │ هاست اختصاصی (nginx رله) │ ────────────▶ │ زر پایش      │
 │ ZARPAYESH_RELAY_*  │      https://zp-relay.arkan.gold:8443 │ eth0: اینترنت  eth1: MPLS │  (شاپرک)     │ api.rpmms.ir │
 └────────────────────┘                                       └──────────────────────────┘               └──────────────┘
```

- زر پایش فقط **IP سمت MPLS هاست** را می‌بیند (همان IP که در Whitelist ثبت می‌شود).
- رله فقط درخواستی را می‌پذیرد که هم **گواهی کلاینت امضاشده با CA اختصاصی آرکان** داشته باشد و هم **کلید رله**. هر
  کس دیگری (حتی با دانستن آدرس) با خطای 400/403 رد می‌شود.
- رله چیزی را ذخیره نمی‌کند، بدنه‌ی درخواست را لاگ نمی‌کند و کلید رله را به زر پایش نمی‌فرستد. Reserve/Approve هرگز
  دوباره ارسال نمی‌شوند (`proxy_next_upstream off`).
- در کد، کلید و گواهی **فقط** به درخواست‌هایی اضافه می‌شوند که مقصدشان دقیقاً `ZARPAYESH_RELAY_URL` است
  (`api/src/zarpayesh/zarpayesh-relay.ts`).

فایل‌های لازم روی هاست، همه در [`scripts/zarpayesh-relay/`](../../scripts/zarpayesh-relay/):

| فایل | کار |
| --- | --- |
| `make-certs.sh` | ساخت CA اختصاصی، گواهی سرور رله و گواهی کلاینت سرویس api |
| `setup-relay.sh` | نصب nginx و ufw، نصب گواهی‌ها، ساخت پیکربندی، بستن فایروال، آزمون دسترسی به زر پایش |
| `nginx.conf.template` | الگوی پیکربندی nginx رله |
| `relay.env.example` | تنظیمات رله (پورت، کلید، مقصد MPLS، فایروال) |
| `60-zarpayesh-mpls.yaml.example` | نمونه‌ی netplan برای کارت شبکه‌ی MPLS |
| `setup-mpls-router.sh`، `mpls.env.example`، `zarpayesh-mpls-status.sh` | روتر پلتفرم روی اوبونتو برای بستر MPLS جدید شاپرک — [mpls-router.md](./mpls-router.md) |

---

## مرحله ۰ — پیش‌نیازهای اداری و دیتاسنتر (پیش از هر کار فنی)

1. **از زر پایش/شاپرک** درخواست اتصال MPLS بدهید و این‌ها را بگیرید:
   - IP و پورت سرور زر پایش داخل MPLS، و این‌که روی MPLS **HTTP یا HTTPS** است؛
   - نام میزبان مورد انتظار (معمولاً `api.rpmms.ir`)؛
   - فهرست اپراتورهای مجاز MPLS؛
   - **تأیید این معماری** (درخواست از سرور ابری از طریق رله‌ی اختصاصی). اگر شرط کنند سامانه‌ی متصل به MPLS فقط
     روی همان هاست باشد، باید سرویس api را روی هاست اجرا کنید و این راهنما به کار نمی‌آید.
2. **از دیتاسنتر/هاستینگ** بپرسید آیا لینک MPLS اپراتور را تا سرور شما (روی **کارت شبکه‌ی دوم** یا یک **VLAN**) تحویل
   می‌دهند. اگر نه، سرور باید به دیتاسنتری منتقل شود که این امکان را دارد.
3. با اپراتور قرارداد ببندید. بعد از راه‌اندازی، این مشخصات را تحویل می‌گیرید:
   **IP سمت شما / ماسک، Gateway، شبکه‌ی مقصد زر پایش، (در صورت VLAN) شماره‌ی VLAN**.
4. **IP سمت MPLS** هاست را به زر پایش بدهید تا در Whitelist ثبت شود.

## مرحله ۱ — آماده‌سازی و امن‌سازی اولیه‌ی اوبونتو

با کاربر دارای sudo وارد شوید:

```bash
sudo apt update && sudo apt -y full-upgrade && sudo apt -y install unattended-upgrades git openssl
```

- **ورود SSH فقط با کلید**: کلید عمومی خود را در `~/.ssh/authorized_keys` بگذارید، ورود را با کلید آزمایش کنید، بعد در
  `/etc/ssh/sshd_config` مقدار `PasswordAuthentication no` و `PermitRootLogin no` را تنظیم کنید و
  `sudo systemctl restart ssh` بزنید (پنجره‌ی SSH فعلی را تا آزمون پنجره‌ی جدید نبندید).
- ساعت سرور برای اعتبار گواهی‌ها مهم است: `timedatectl` باید `System clock synchronized: yes` نشان دهد.

## مرحله ۲ — کارت شبکه‌ی MPLS (بعد از تحویل لینک)

> **بستر MPLS جدید شاپرک (پروژه‌ی طلا):** طبق سند شاپرک، روی لینک MPLS باید دو تانل GRE over IPsec، مسیریابی OSPF و
> NAT Pool اختصاصی برقرار شود. اگر دیتاسنتر فقط لینک خام را تحویل می‌دهد و روتر جداگانه ندارید، **به‌جای این مرحله**
> راهنمای [mpls-router.md](./mpls-router.md) را اجرا کنید (خود سرور نقش روتر پلتفرم را می‌گیرد). این مرحله فقط وقتی
> کافی است که یک روتر مدیریت‌شده تانل‌ها و NAT را انجام دهد و به سرور فقط یک route ساده بدهد.

```bash
ip -br link            # نام کارت MPLS (مثلاً eth1 / eno2 / ens19)
ip -br addr
```

نمونه را کپی و با مقادیر اپراتور ویرایش کنید ([نمونه](../../scripts/zarpayesh-relay/60-zarpayesh-mpls.yaml.example)):

```bash
sudo cp scripts/zarpayesh-relay/60-zarpayesh-mpls.yaml.example /etc/netplan/60-zarpayesh-mpls.yaml
sudo nano /etc/netplan/60-zarpayesh-mpls.yaml
sudo chmod 600 /etc/netplan/60-zarpayesh-mpls.yaml
sudo netplan try        # اگر ارتباط قطع شد بعد از ۱۲۰ ثانیه خودکار برمی‌گردد
```

**default route را روی MPLS نگذارید**؛ فقط شبکه‌ی زر پایش از MPLS برود. بررسی:

```bash
ip route get <IP زر پایش>          # باید dev <کارت MPLS> را نشان دهد
ip route get 8.8.8.8               # باید dev <کارت اینترنت> را نشان دهد
nc -vz <IP زر پایش> <پورت>          # باید succeeded شود
```

## مرحله ۳ — دامنه‌ی رله

در DNS دامنه (ابر آروان) یک رکورد **A** بسازید: `zp-relay.arkan.gold` ← **IP عمومی (اینترنتی)** هاست.
**پروکسی/ابر آروان این رکورد را خاموش کنید** (فقط DNS). mTLS از پشت CDN کار نمی‌کند، چون CDN اتصال TLS را باز می‌کند.

(بدون دامنه هم می‌شود: در گام بعد IP عمومی را به‌عنوان SAN بدهید و در رانفلر آدرس `https://<IP>:8443` بگذارید.)

## مرحله ۴ — دریافت اسکریپت‌ها و ساخت گواهی‌ها روی هاست

```bash
git clone --depth 1 https://github.com/alirezasa/arkangold.git ~/arkangold
cd ~/arkangold/scripts/zarpayesh-relay
bash make-certs.sh zp-relay.arkan.gold,<IP عمومی هاست> ~/zp-certs
```

(اگر مخزن خصوصی است و هاست به گیت‌هاب دسترسی ندارد، پوشه‌ی `scripts/zarpayesh-relay` را با `scp` کپی کنید.)

خروجی سه مقدار `ZARPAYESH_RELAY_CA`، `ZARPAYESH_RELAY_CLIENT_CERT` و `ZARPAYESH_RELAY_CLIENT_KEY` را چاپ می‌کند؛
برای مرحله ۷ نگه دارید. اعتبار گواهی‌ها **۸۲۵ روز** است (CA پنج سال). تاریخ تمدید را یادداشت کنید (مرحله ۹).

## مرحله ۵ — تنظیم و نصب رله

```bash
cp relay.env.example ~/relay.env
openssl rand -hex 32          # کلید رله — هم در relay.env و هم در رانفلر
nano ~/relay.env
```

| متغیر | مقدار |
| --- | --- |
| `RELAY_NAME` | `zp-relay.arkan.gold` |
| `RELAY_PORT` | `8443` |
| `RELAY_SECRET` | خروجی `openssl rand -hex 32` |
| `ZP_UPSTREAM_SCHEME` | `https` یا `http`، طبق اعلام زر پایش برای MPLS |
| `ZP_UPSTREAM_ADDR` | `IP:پورت` زر پایش داخل MPLS، مثلاً `10.0.0.10:443` |
| `ZP_UPSTREAM_HOST` | `api.rpmms.ir` (یا نامی که زر پایش اعلام کرد) |
| `ZP_UPSTREAM_VERIFY` | `on`؛ فقط اگر گواهی HTTPS زر پایش روی MPLS داخلی/خودامضاست `off` |
| `RELAY_ALLOW_FROM` | IP خروجی رانفلر (مرحله ۷)، یا خالی |
| `SSH_ALLOW_FROM` | IPهای ثابت مدیران، یا خالی |

نصب (اجرای دوباره بعد از هر تغییر `relay.env` امن است):

```bash
sudo bash setup-relay.sh ~/relay.env ~/zp-certs
```

خروجی موفق:

```
✓ بسته‌ها نصب‌اند
✓ گواهی‌ها در /etc/zarpayesh-relay نصب شدند
✓ nginx روی پورت 8443 گوش می‌دهد
✓ فایروال فعال است (فقط SSH:22 و رله:8443)
✓ اتصال TCP به زر پایش (10.0.0.10:443) برقرار است
```

اگر فایروال دیتاسنتر (پنل هاستینگ) جدا است، پورت `8443/tcp` ورودی را آن‌جا هم باز کنید.

## مرحله ۶ — آزمون رله از خود هاست

```bash
cd ~/zp-certs
curl --cacert ca.crt --cert client.crt --key client.key \
  -H "X-Arkan-Relay-Key: <RELAY_SECRET>" https://zp-relay.arkan.gold:8443/__relay/health
```

| نتیجه | معنی |
| --- | --- |
| `ok` | رله سالم است |
| `400 No required SSL certificate` | گواهی کلاینت فرستاده نشده (درست است — یعنی mTLS فعال است) |
| `403` | کلید رله اشتباه است |
| خطای اتصال / timeout | DNS، فایروال هاستینگ یا ufw |

آزمون مسیر MPLS (Login با اطلاعات واقعی سکو؛ پاسخ JSON زر پایش باید برگردد):

```bash
curl --cacert ca.crt --cert client.crt --key client.key \
  -H "X-Arkan-Relay-Key: <RELAY_SECRET>" -H 'Content-Type: application/json' \
  -d '{"account":"<ACCOUNT>","password":"<PASSWORD>","useOtp":false}' \
  https://zp-relay.arkan.gold:8443/api/auth/session
```

`502`/`504` یعنی رله به زر پایش نمی‌رسد: لینک MPLS، route، `ZP_UPSTREAM_*` یا Whitelist. لاگ خطا را ببینید:
`sudo tail -f /var/log/nginx/zarpayesh-relay.error.log`.

**بعد از موفقیت:** `ca.key` را در جای امن بیرون از سرور (مثلاً مدیر رمز سازمان) نگه دارید و از هاست حذف کنید:

```bash
shred -u ~/zp-certs/ca.key ~/zp-certs/client.key
```

(`client.key` فقط در رانفلر لازم است و روی هاست نباید بماند.)

## مرحله ۷ — تنظیم سرویس api در رانفلر

در پنل رانفلر ← سرویس `api` ← متغیرهای محیطی، این پنج متغیر را اضافه کنید
([نمونه](../deployment/runflare/api.env.example)) و سرویس را دوباره راه‌اندازی کنید:

```
ZARPAYESH_RELAY_URL=https://zp-relay.arkan.gold:8443
ZARPAYESH_RELAY_SECRET=<همان RELAY_SECRET>
ZARPAYESH_RELAY_CA=<خروجی make-certs.sh>
ZARPAYESH_RELAY_CLIENT_CERT=<خروجی make-certs.sh>
ZARPAYESH_RELAY_CLIENT_KEY=<خروجی make-certs.sh>
```

**محدود کردن به IP رانفلر (اختیاری، توصیه‌شده):** در کنسول سرویس api رانفلر بزنید
`curl -s https://api.ipify.org` و از پشتیبانی رانفلر بپرسید IP خروجی ثابت است یا نه. اگر ثابت است، آن را در
`RELAY_ALLOW_FROM` بگذارید و `setup-relay.sh` را دوباره اجرا کنید. اگر ثابت نیست خالی بماند؛ حفاظت با mTLS و کلید است.

آزمون از کنسول سرویس api رانفلر:

```bash
node -e "
const https=require('https');const d=s=>Buffer.from(process.env[s],'base64');
https.get(process.env.ZARPAYESH_RELAY_URL+'/__relay/health',{ca:d('ZARPAYESH_RELAY_CA'),cert:d('ZARPAYESH_RELAY_CLIENT_CERT'),key:d('ZARPAYESH_RELAY_CLIENT_KEY'),headers:{'X-Arkan-Relay-Key':process.env.ZARPAYESH_RELAY_SECRET}},r=>{r.pipe(process.stdout)}).on('error',e=>console.error(e.message))"
```

باید `ok` چاپ شود.

## مرحله ۸ — پنل ادمین

پنل ادمین ← «سیستم ← سامانه ناظر طلا (زر پایش)» ← تب «وضعیت و راه‌اندازی»:

1. **آدرس سرور (Host)** را `https://zp-relay.arkan.gold:8443` بگذارید (دقیقاً برابر `ZARPAYESH_RELAY_URL`) و ذخیره کنید.
   نیازی به استثنای «اتصال بدون رمزنگاری» نیست، حتی اگر زر پایش روی MPLS فقط `http` داشته باشد؛ مسیر رانفلر تا رله
   همیشه HTTPS است.
2. اعتبارنامه‌ها (ACCOUNT، PASSWORD، AES_KEY) را ثبت کنید.
3. **آزمون کامل اتصال** را اجرا کنید؛ هر ۸ مرحله باید سبز شود.
4. `typeId` و `vaultId` را انتخاب و یک **رزرو آزمایشی** (و در صورت امکان روی Sandbox) انجام دهید، بعد کلید اصلی را روشن کنید.

در تب «لاگ‌ها» هر فراخوانی با کد HTTP ثبت می‌شود و روی هاست هم در `/var/log/nginx/zarpayesh-relay.log`:

```
2026-11-01T13:04:23+00:00 <IP رانفلر> cn="CN=arkan-api,O=Arkan Gold" "POST /api/aure/Aurelink/Reserve" 200 0.120 up=200/0.118
```

## مرحله ۹ — نگهداری

- **تمدید گواهی‌ها** (پیش از ۸۲۵ روز): روی سیستمی که `ca.key` دارد، گواهی‌های جدید را با همان CA بسازید (یا CA تازه بسازید)،
  `setup-relay.sh` را اجرا و متغیرهای رانفلر را به‌روز کنید. انقضا را بررسی کنید:
  `openssl x509 -enddate -noout -in /etc/zarpayesh-relay/server.crt`
- **چرخش کلید رله**: `RELAY_SECRET` تازه در `relay.env` ← `setup-relay.sh` ← `ZARPAYESH_RELAY_SECRET` رانفلر. در فاصله‌ی
  این دو کار، فراخوانی‌ها 403 می‌گیرند؛ پس کلید اصلی زر پایش را موقتاً خاموش کنید یا در ساعت کم‌ترافیک انجام دهید.
- **لو رفتن گواهی کلاینت یا کلید**: هر دو را عوض کنید. برای باطل کردن قطعی گواهی کلاینت، CA تازه بسازید و همه‌ی
  گواهی‌ها را از نو صادر کنید.
- به‌روزرسانی امنیتی خودکار با `unattended-upgrades` فعال است؛ `sudo ufw status` و `sudo nginx -t` را گاهی بررسی کنید.
- **پایش**: اگر هاست یا لینک MPLS قطع شود، پیگیری خودکار معاملات «نامشخص» (هر دقیقه، TxnFollowup) پس از وصل شدن
  تعیین تکلیف می‌کند؛ ولی معامله‌ی تازه با کلید روشن انجام نمی‌شود. یک پایش بیرونی برای `/__relay/health` بگذارید.

## عیب‌یابی سریع

| نشانه در پنل/لاگ | علت محتمل |
| --- | --- |
| `اتصال به سامانه ناظر برقرار نشد (ECONNREFUSED/ENOTFOUND/ETIMEDOUT)` | DNS رله، پورت 8443 در فایروال هاستینگ/ufw، `RELAY_ALLOW_FROM` |
| `... (UNABLE_TO_VERIFY_LEAF_SIGNATURE / ERR_TLS_CERT_ALTNAME_INVALID)` | `ZARPAYESH_RELAY_CA` اشتباه، یا نام/IP آدرس رله در SAN گواهی سرور نیست |
| HTTP 400 از nginx | گواهی کلاینت در رانفلر تنظیم نشده یا با CA دیگری است |
| HTTP 403 | `ZARPAYESH_RELAY_SECRET` با `RELAY_SECRET` برابر نیست |
| HTTP 502 / 504 | رله به زر پایش نمی‌رسد: لینک MPLS، route، `ZP_UPSTREAM_ADDR`، Whitelist |
| HTTP 502 با `SSL ... verify` در error.log | گواهی HTTPS زر پایش روی MPLS داخلی است: `ZP_UPSTREAM_VERIFY=off` یا `ZP_UPSTREAM_SCHEME` اشتباه |
| `اطلاعات ورود ... ۱۰۳۲` | مسیر درست است؛ ACCOUNT/PASSWORD اشتباه است |
