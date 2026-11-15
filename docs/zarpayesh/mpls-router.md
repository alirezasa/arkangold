# روتر پلتفرم روی اوبونتو برای بستر MPLS جدید شاپرک (GRE over IPsec + OSPF + NAT Pool)

طبق سند شاپرک «راهنمای فنی راه‌اندازی و مهاجرت ارتباط پلتفرم‌های طلا به بستر MPLS جدید شاپرک»، اتصال به زر پایش فقط
یک لینک MPLS ساده نیست. روی لینک MPLS باید این‌ها برقرار شود:

| لایه | الزام شاپرک |
| --- | --- |
| Underlay | لینک MPLS مخابرات با دسترسی به `172.21.193.2` (سایت اصلی) و `172.21.194.2` (سایت پشتیبان) |
| تانل | دو تانل **GRE over IPsec** (IKEv1، AES-128، SHA-1، DH Group 5، PSK) — Tunnel X اصلی و Tunnel Y پشتیبان |
| مسیریابی | **OSPF** روی هر دو تانل؛ شبکه‌ی سرویس `172.20.248.0/24` از OSPF آموخته می‌شود |
| NAT | ترافیک پلتفرم با **NAT Pool اختصاصی `/29`** خارج می‌شود و فقط همین Prefix به شاپرک اعلام می‌شود |
| نام‌ها | `api.zarpayesh.net` ← `172.20.248.2`، `panel.zarpayesh.net` ← `172.20.248.3`، `captcha.zarpayesh.net` ← `172.20.248.4` |

نمونه‌های سند شاپرک برای روتر Cisco است. وقتی دیتاسنتر فقط **لینک خام لایه ۲** را روی یک کارت شبکه‌ی سرور تحویل می‌دهد
(سرور Unmanaged)، خود سرور اوبونتو نقش «روتر پلتفرم» را می‌گیرد. اسکریپت
[`scripts/zarpayesh-relay/setup-mpls-router.sh`](../../scripts/zarpayesh-relay/setup-mpls-router.sh) همین کار را می‌کند.

> پیش از اجرا از شاپرک تأیید بگیرید که پیاده‌سازی روی Linux (strongSwan + FRR) به‌جای Cisco پذیرفته است.
> بخش‌های «حذف Static Route»، Cutover و Rollback سند شاپرک فقط برای پلتفرم‌هایی است که اتصال قدیمی دارند؛
> پلتفرم جدید مستقیم با OSPF شروع می‌کند.

```
 رانفلر (api) ──HTTPS+mTLS──▶ nginx رله ──▶ gre-shp-main ══ IPsec ══▶ 172.21.193.2 ─┐
                               (همین سرور)   gre-shp-bkp  ══ IPsec ══▶ 172.21.194.2 ─┴─▶ 172.20.248.0/24 (زر پایش)
                                             └ روی لینک MPLS (enp5s0f1) ┘
```

## نگاشت نمونه‌ی Cisco به اوبونتو

| Cisco (سند شاپرک) | روی اوبونتو | فایل |
| --- | --- | --- |
| `crypto isakmp policy` / `key` / `transform-set` / `ipsec profile` | strongSwan (swanctl)، IKEv1 | `/etc/swanctl/conf.d/zarpayesh-mpls.conf` |
| `interface TunnelX` / `TunnelY` + `tunnel protection` | اینترفیس‌های GRE `gre-shp-main` و `gre-shp-bkp`؛ IPsec فقط پروتکل GRE بین دو سر تانل را رمز می‌کند | `/usr/local/sbin/zarpayesh-mpls-net` |
| `ip mtu 1400` / `ip tcp adjust-mss 1360` | MTU تانل ۱۴۰۰ (اتصال‌های خود سرور خودکار MSS=1360 می‌گیرند) | همان |
| مسیر Underlay مستقل از تانل | route ‏`/32` به هر دو مقصد شاپرک از کارت MPLS | همان |
| `router ospf 240` + `ip ospf ... area` / `cost` / `point-to-point` | FRR (ospfd). Process ID محلی است و در FRR لازم نیست | `/etc/frr/frr.conf` |
| `ip route <NAT-POOL> ...` + `redistribute static ... route-map GOLD-NAT-TO-OSPF` | مسیر blackhole برای Pool و بازتوزیع فقط همان Prefix (E1) | همان |
| NAT روی روتر/فایروال | nftables: ترافیک خود سرور به `172.20.248.0/24` با `NAT_SOURCE_IP` خارج می‌شود | `/usr/local/sbin/zarpayesh-mpls-net` |
| فایل Hosts (بخش ۱۱) | بلوک `zarpayesh-mpls` در `/etc/hosts` | — |

حفاظت‌های اضافه:

- از مسیرهایی که شاپرک با OSPF اعلام می‌کند **فقط `172.20.248.0/24`** در جدول مسیریابی سرور نصب می‌شود؛ default route یا
  شبکه‌ی دیگری از این مسیر پذیرفته نمی‌شود و اینترنت سرور دست نمی‌خورد.
- فایروال (ufw): IKE/ESP/GRE فقط از دو مقصد شاپرک و فقط روی کارت MPLS؛ OSPF فقط روی دو تانل.
- سیاست IPsec همیشه نصب است (`trap`): اگر SA برقرار نباشد، بسته‌ی GRE بدون رمز ارسال نمی‌شود.
- PSK در `mpls.env` و خط فرمان نیست؛ اسکریپت آن را می‌پرسد و در `/etc/zarpayesh-mpls/psk` (فقط root) نگه می‌دارد.

## ۱. مقادیر لازم از «فایل تنظیمات اختصاصی پلتفرم» شاپرک

| در فایل شاپرک | متغیر `mpls.env` |
| --- | --- |
| PLATFORM-MPLS-IP و ماسک (Underlay / tunnel source) | `MPLS_IP_CIDR` |
| Gateway لینک MPLS (از مخابرات/شاپرک) | `MPLS_GATEWAY` |
| PLATFORM-TUNNEL-IP تانل X و Y (‏`/30`) | `TUN_MAIN_IP_CIDR`، `TUN_BACKUP_IP_CIDR` |
| Router-ID | `OSPF_ROUTER_ID` |
| Area و نوع آن | `OSPF_AREA`، `OSPF_AREA_TYPE` (`normal` یا `nssa`) |
| MAIN-COST و هزینه‌ی پشتیبان | `OSPF_COST_MAIN`، `OSPF_COST_BACKUP` |
| NAT Pool ‏`/29` | `NAT_POOL_CIDR` و یکی از آدرس‌هایش در `NAT_SOURCE_IP` |
| PSK | فقط هنگام اجرای اسکریپت تایپ می‌شود |

اگر شاپرک PFS، الگوریتم یا `mode transport` متفاوتی اعلام کرد: `IKE_PROPOSAL`، `ESP_PROPOSAL` (مثلاً
`aes128-sha1-modp1536` برای PFS گروه ۵) و `IPSEC_MODE`.

## ۲. نصب

```bash
cd ~/arkangold && git pull
cp scripts/zarpayesh-relay/mpls.env.example ~/mpls.env
nano ~/mpls.env
```

پیش‌نمایش بدون هیچ تغییری روی سرور (فایل‌های ساخته‌شده را می‌توان برای بازبینی فرستاد؛ PSK در آن‌ها نیست):

```bash
bash scripts/zarpayesh-relay/setup-mpls-router.sh ~/mpls.env --render ~/mpls-preview
```

نصب واقعی (PSK را می‌پرسد؛ اجرای دوباره امن است):

```bash
sudo bash scripts/zarpayesh-relay/setup-mpls-router.sh ~/mpls.env
```

در پایان گزارش وضعیت چاپ می‌شود. هر زمان دوباره:

```bash
sudo zarpayesh-mpls-status
```

گزارش، لایه‌ها را به ترتیب وابستگی و مطابق «معیار پذیرش» سند شاپرک بررسی می‌کند: Underlay ← IKE/IPsec ← تانل‌ها ←
همسایگی OSPF در وضعیت FULL ← مسیر فعال `172.20.248.0/24` از OSPF ← اعلام NAT Pool و SNAT ← پاسخ HTTPS از
`api.zarpayesh.net`. **دریافت NAT Pool در سمت شاپرک** و **آزمون Failover** را باید با شاپرک هماهنگ و تأیید کنید.

## ۳. اتصال رله به زر پایش

بعد از سبز شدن گزارش، در `~/relay.env`:

```
ZP_UPSTREAM_SCHEME=https
ZP_UPSTREAM_ADDR=172.20.248.2:443
ZP_UPSTREAM_HOST=api.zarpayesh.net
ZP_UPSTREAM_VERIFY=on
```

(اگر گزارش وضعیت گفت گواهی TLS با CAهای عمومی تأیید نمی‌شود: `ZP_UPSTREAM_VERIFY=off`) و سپس:

```bash
sudo bash scripts/zarpayesh-relay/setup-relay.sh ~/relay.env ~/zp-certs
```

ادامه (آزمون از رانفلر و پنل ادمین): [relay.md](./relay.md) مراحل ۷ و ۸.

## ۴. دسترسی به پنل وب زر پایش از کامپیوتر مدیر

`panel.zarpayesh.net` فقط از داخل MPLS باز می‌شود. با تونل SSH از همین سرور:

- **PuTTY**: Connection ← SSH ← Tunnels ← Source port `1080`، گزینه‌ی **Dynamic** ← Add، سپس اتصال به سرور.
- **Firefox**: Settings ← Network Settings ← Manual proxy ← SOCKS Host `127.0.0.1`، Port `1080`، SOCKS v5 و تیک
  **Proxy DNS when using SOCKS v5** (تا نام‌ها با `/etc/hosts` سرور باز شوند). سپس `https://panel.zarpayesh.net`.

## ۵. نگهداری و عیب‌یابی

| کار | دستور |
| --- | --- |
| گزارش کامل | `sudo zarpayesh-mpls-status` |
| وضعیت IPsec | `sudo swanctl --list-sas` |
| شروع دوباره‌ی مذاکره | `sudo swanctl --initiate --child gre-main` (پشتیبان: `gre-bkp`) |
| همسایه‌ها و مسیرهای OSPF | `sudo vtysh -c 'show ip ospf neighbor'` / `sudo vtysh -c 'show ip route ospf'` |
| آنچه به شاپرک اعلام می‌شود | `sudo vtysh -c 'show ip ospf database external self-originate'` |
| لاگ‌ها | `journalctl -u strongswan -n 100` / `journalctl -u frr -n 100` |
| تغییر PSK | `sudo RESET_PSK=1 bash scripts/zarpayesh-relay/setup-mpls-router.sh ~/mpls.env` |
| تغییر هر مقدار | ویرایش `~/mpls.env` و اجرای دوباره‌ی اسکریپت |

| نشانه در گزارش | علت محتمل |
| --- | --- |
| ✗ کابل وصل نیست | پورت سوییچ دیتاسنتر / کابل |
| ✗ مسیر مقصد شاپرک از کارت MPLS نیست | `systemctl restart zarpayesh-mpls-net`؛ `MPLS_GATEWAY` |
| ✗ IKE برقرار نیست — در لاگ `NO_PROPOSAL_CHOSEN` | `IKE_PROPOSAL`/`ESP_PROPOSAL` با شاپرک یکی نیست |
| ✗ IKE برقرار نیست — در لاگ `AUTHENTICATION_FAILED` یا پاسخ نامفهوم در مرحله‌ی سوم | PSK اشتباه (`RESET_PSK=1`) |
| ✗ IKE برقرار نیست — بدون پاسخ (retransmit) | Underlay؛ Peer سمت شاپرک هنوز تعریف نشده؛ IP سمت MPLS با فایل شاپرک یکی نیست |
| ✓ IKE ولی ✗ IPsec SA | `IPSEC_MODE` یا PFS متفاوت |
| ✓ IPsec ولی ✗ OSPF FULL | Area، نوع Area، IP/ماسک تانل یا MTU با سمت شاپرک یکی نیست (`show ip ospf neighbor` در وضعیت ExStart = MTU) |
| ✓ OSPF ولی ✗ مسیر سرویس | شاپرک هنوز `172.20.248.0/24` را اعلام نمی‌کند |
| ✓ همه ولی زر پایش پاسخ نمی‌دهد | NAT Pool در سمت شاپرک دریافت/تأیید نشده؛ `NAT_SOURCE_IP` |

## آنچه آزمایش شده

در محیط آزمایشی (فضای نام شبکه، بدون سخت‌افزار شاپرک): بارگذاری پیکربندی strongSwan و برقراری IKEv1 Main Mode با PSK و
مذاکره‌ی Quick Mode برای Traffic Selector پروتکل GRE در برابر یک Peer شبیه‌سازی‌شده؛ همسایگی OSPF در وضعیت FULL روی هر دو
مسیر با FRR؛ نصب فقط `172.20.248.0/24` در جدول مسیریابی و رد شدن مسیر اضافه؛ اعلام NAT Pool و دریافت آن در سمت مقابل؛
SNAT و پاسخ برگشتی؛ جابه‌جایی خودکار به مسیر پشتیبان و برگشت؛ قوانین فایروال. **رمزنگاری ESP و اینترفیس GRE در هسته و
سازگاری با تجهیز واقعی شاپرک در آن محیط قابل آزمایش نبود** و باید هنگام راه‌اندازی با شاپرک تأیید شود.
