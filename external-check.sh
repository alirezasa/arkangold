#!/usr/bin/env bash
# scripts/security/external-check.sh
#
# بررسی امنیتی بیرونی و غیرمخرب دامنه‌های عملیاتی آرکان گلد (دید یک مهاجم از اینترنت).
# فقط درخواست‌های GET/HEAD/OPTIONS می‌فرستد: هیچ ورود، ثبت‌نام، ارسال پیامک OTP، پرداخت یا
# brute-force انجام نمی‌شود. تنها آزمون پرتکرار، ۳۵ درخواست GET به قیمت عمومی برای سنجش
# rate limit است (با SKIP_RATE_LIMIT=1 حذف می‌شود).
#
# اجرا روی یک رایانه‌ی داخل ایران و بدون VPN (نه روی خود سرور):
#   bash scripts/security/external-check.sh
# خروجی هم روی صفحه چاپ و هم در فایل arkan-security-check-<زمان>.txt ذخیره می‌شود.
#
# پیش‌نیاز: bash، curl و openssl (لینوکس/مک آماده دارند؛ ویندوز: Git Bash یا WSL)
# تغییر دامنه‌ها در صورت نیاز:
#   APP=https://app.arkan.gold ADMIN=https://admin.arkan.gold PANEL=https://panel.arkan.gold \
#   API=https://api.arkan.gold bash scripts/security/external-check.sh

set -u

APP="${APP:-https://app.arkan.gold}"
ADMIN="${ADMIN:-https://admin.arkan.gold}"
PANEL="${PANEL:-https://panel.arkan.gold}"
API="${API:-https://api.arkan.gold}"
EVIL_ORIGIN="https://evil.example.com"
UA="ArkanSecurityCheck/1.0 (owner-authorized)"
OUT="arkan-security-check-$(date +%Y%m%d-%H%M%S).txt"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

exec > >(tee "$OUT") 2>&1

PASS=0
WARN=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  [OK]   $*"; }
warn() { WARN=$((WARN + 1)); echo "  [WARN] $*"; }
fail() { FAIL=$((FAIL + 1)); echo "  [FAIL] $*"; }
info() { echo "  [INFO] $*"; }
section() { echo; echo "=== $* ==="; }

for bin in curl openssl; do
  command -v "$bin" >/dev/null 2>&1 || { echo "$bin نصب نیست"; exit 1; }
done

host_of() { echo "$1" | sed -E 's#^https?://##; s#/.*$##'; }

# درخواست و ذخیره‌ی هدر/بدنه؛ خروجی: کد وضعیت
fetch() { # fetch <name> <url> [extra curl args...]
  local name="$1" url="$2"
  shift 2
  curl -sS -k -A "$UA" --max-time 20 -D "$TMP/$name.h" -o "$TMP/$name.b" \
    -w "%{http_code}" "$@" "$url" 2>"$TMP/$name.err" || true
}
header() { # header <name> <Header-Name>
  grep -i "^$2:" "$TMP/$1.h" 2>/dev/null | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'
}

echo "Arkan Gold external security check — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "APP=$APP ADMIN=$ADMIN PANEL=$PANEL API=$API"
info "IP عمومی اجراکننده: $(curl -sS --max-time 10 https://api.ipify.org 2>/dev/null || echo نامشخص)"

# ─────────────────────────────────────────────────────────────
section "1. DNS و دسترسی"
for url in "$APP" "$ADMIN" "$PANEL" "$API"; do
  h=$(host_of "$url")
  code=$(fetch "reach" "$url/")
  if [ "$code" = "000" ]; then
    fail "$h در دسترس نیست: $(head -c 200 "$TMP/reach.err")"
  else
    info "$h → HTTP $code"
  fi
done

# ─────────────────────────────────────────────────────────────
section "2. TLS و گواهی"
for url in "$APP" "$ADMIN" "$PANEL" "$API"; do
  h=$(host_of "$url")
  cert=$(echo | openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null)
  if [ -z "$cert" ]; then
    fail "$h: اتصال TLS برقرار نشد"
    continue
  fi
  proto=$(echo "$cert" | grep -E "Protocol *:" | head -1 | awk -F: '{print $2}' | tr -d ' ')
  cipher=$(echo "$cert" | grep -E "Cipher *:" | head -1 | awk -F: '{print $2}' | tr -d ' ')
  info "$h: پروتکل ${proto:-?}، رمز ${cipher:-?}"
  end=$(echo "$cert" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  subj=$(echo "$cert" | openssl x509 -noout -subject 2>/dev/null)
  info "$h: گواهی تا $end — $subj"
  if echo "$cert" | openssl x509 -noout -checkend 1209600 >/dev/null 2>&1; then
    pass "$h: گواهی بیش از ۱۴ روز اعتبار دارد"
  else
    fail "$h: گواهی منقضی است یا کمتر از ۱۴ روز اعتبار دارد"
  fi
  if echo "$cert" | grep -q "Verify return code: 0"; then
    pass "$h: زنجیره‌ی گواهی معتبر است"
  else
    warn "$h: $(echo "$cert" | grep 'Verify return code' | head -1)"
  fi
  for old in tls1 tls1_1; do
    if openssl s_client -help 2>&1 | grep -q -- "-$old"; then
      if echo | openssl s_client -connect "$h:443" -servername "$h" "-$old" 2>/dev/null | grep -q "Cipher is [A-Z]"; then
        fail "$h: پروتکل قدیمی $old پذیرفته می‌شود"
      else
        pass "$h: $old پذیرفته نمی‌شود"
      fi
    fi
  done
  code=$(curl -sS -A "$UA" --max-time 15 -o /dev/null -w "%{http_code} %{redirect_url}" "http://$h/" 2>/dev/null || echo "000")
  case "$code" in
    30[1278]\ https://*) pass "$h: HTTP به HTTPS هدایت می‌شود" ;;
    000*) info "$h: پورت ۸۰ پاسخ نمی‌دهد" ;;
    *) fail "$h: HTTP به HTTPS هدایت نمی‌شود (پاسخ: $code)" ;;
  esac
done

# ─────────────────────────────────────────────────────────────
section "3. هدرهای امنیتی"
check_headers() { # <label> <url>
  local label="$1" url="$2" code
  code=$(fetch "hdr" "$url")
  info "$label ($url) → HTTP $code"
  [ "$code" = "000" ] && return
  local v
  v=$(header hdr Strict-Transport-Security)
  if [ -n "$v" ]; then pass "HSTS: $v"; else fail "HSTS وجود ندارد"; fi
  v=$(header hdr Content-Security-Policy)
  if [ -z "$v" ]; then
    fail "CSP وجود ندارد"
  else
    pass "CSP وجود دارد"
    echo "$v" | grep -q "unsafe-inline" && warn "CSP شامل 'unsafe-inline' است"
    echo "$v" | grep -q "unsafe-eval" && fail "CSP شامل 'unsafe-eval' است (در production نباید باشد)"
    echo "$v" | grep -q "goftino" && warn "CSP اسکریپت شخص ثالث (goftino) را مجاز کرده است"
    echo "$v" | grep -qE "form-action[^;]*https:( |;|$)" && warn "CSP: form-action به همه‌ی دامنه‌های https باز است"
  fi
  v=$(header hdr X-Frame-Options)
  if [ -n "$v" ]; then pass "X-Frame-Options: $v"; else warn "X-Frame-Options وجود ندارد"; fi
  v=$(header hdr X-Content-Type-Options)
  if [ "$(echo "$v" | tr 'A-Z' 'a-z')" = "nosniff" ]; then pass "X-Content-Type-Options: nosniff"; else fail "X-Content-Type-Options نادرست/ناموجود"; fi
  v=$(header hdr Referrer-Policy)
  if [ -n "$v" ]; then pass "Referrer-Policy: $v"; else warn "Referrer-Policy وجود ندارد"; fi
  for leak in X-Powered-By Server X-AspNet-Version Via X-Nextjs-Cache X-Runtime; do
    v=$(header hdr "$leak")
    [ -n "$v" ] && warn "افشای اطلاعات سرور: $leak: $v"
  done
  grep -i "^set-cookie:" "$TMP/hdr.h" 2>/dev/null | tr -d '\r' | while read -r line; do
    name=$(echo "$line" | cut -d: -f2- | cut -d= -f1 | tr -d ' ')
    echo "$line" | grep -qi "secure" || echo "  [FAIL] کوکی $name بدون Secure"
    echo "$line" | grep -qi "httponly" || echo "  [WARN] کوکی $name بدون HttpOnly"
    echo "$line" | grep -qi "samesite" || echo "  [WARN] کوکی $name بدون SameSite"
  done
}
check_headers "اپ کاربر" "$APP/"
check_headers "پنل مدیریت" "$ADMIN/"
check_headers "پنل نمایندگان" "$PANEL/"
check_headers "API" "$API/market/price"
v=$(header hdr Cache-Control)
if echo "$v" | grep -q "no-store"; then pass "API: Cache-Control: $v"; else fail "API: پاسخ پویا no-store ندارد ($v)"; fi

# ─────────────────────────────────────────────────────────────
section "4. فایل‌ها و مسیرهای حساس (باید 404/403 باشند)"
probe() { # <url> <description>
  local code
  code=$(fetch "probe" "$1")
  case "$code" in
    404 | 403 | 401 | 400 | 000) pass "$2 → $code" ;;
    30*) info "$2 → $code (هدایت به $(header probe Location))" ;;
    200)
      # برخی برنامه‌های Next برای هر مسیر ناموجود صفحه‌ی HTML برمی‌گردانند
      if grep -qiE "<html|<!doctype" "$TMP/probe.b"; then
        info "$2 → 200 (صفحه‌ی HTML؛ احتمالاً صفحه‌ی عمومی برنامه — دستی بررسی شود)"
      else
        fail "$2 → 200 با محتوا: $(head -c 120 "$TMP/probe.b" | tr '\n' ' ')"
      fi
      ;;
    *) warn "$2 → $code" ;;
  esac
}
for base in "$APP" "$ADMIN" "$API"; do
  h=$(host_of "$base")
  probe "$base/.env" "$h/.env"
  probe "$base/.git/config" "$h/.git/config"
  probe "$base/.git/HEAD" "$h/.git/HEAD"
  probe "$base/package.json" "$h/package.json"
done
probe "$API/api/docs" "Swagger UI (api/docs)"
probe "$API/api/docs-json" "Swagger JSON (api/docs-json)"
probe "$API/uploads/legal-documents/1784713000399-826322183.pdf" "مدارک حقوقی از مسیر ایستا"
probe "$API/uploads/" "فهرست پوشه‌ی uploads"
probe "$API/uploads/products/" "فهرست پوشه‌ی تصاویر محصول"

# ─────────────────────────────────────────────────────────────
section "5. دسترسی بدون احراز هویت به API (باید 401/403 باشد)"
for path in /admin/users /admin/system-config /admin/admins /admin/audit-log /wallet /auth/me /agent-portal/wallet /admin/integrations/providers; do
  code=$(fetch "unauth" "$API$path")
  case "$code" in
    401 | 403) pass "GET $path → $code" ;;
    *) fail "GET $path → $code (انتظار 401): $(head -c 150 "$TMP/unauth.b" | tr '\n' ' ')" ;;
  esac
done
code=$(fetch "unauth" "$API/admin/users" -H "Authorization: Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ4Iiwic2Vzc2lvbklkIjoieCJ9.")
case "$code" in
  401 | 403) pass "توکن با الگوریتم none رد شد → $code" ;;
  *) fail "توکن alg=none → $code" ;;
esac
for base in "$APP" "$ADMIN"; do
  code=$(fetch "bff" "$base/api/admin/users")
  [ "$code" = "404" ] && code=$(fetch "bff" "$base/api/user/profile")
  info "BFF $(host_of "$base") بدون کوکی → $code"
done

# ─────────────────────────────────────────────────────────────
section "6. CORS"
cors() { # <origin> <path>
  fetch "cors" "$API$2" -X OPTIONS -H "Origin: $1" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type,authorization" >/dev/null
  header cors Access-Control-Allow-Origin
}
v=$(cors "$EVIL_ORIGIN" /auth/login)
if [ -z "$v" ]; then pass "Origin بیگانه پذیرفته نشد"; else fail "Origin بیگانه پذیرفته شد: $v (credentials: $(header cors Access-Control-Allow-Credentials))"; fi
v=$(cors "null" /auth/login)
if [ -z "$v" ]; then pass "Origin: null پذیرفته نشد"; else fail "Origin: null پذیرفته شد: $v"; fi
v=$(cors "http://localhost:3000" /auth/login)
if [ -z "$v" ]; then pass "http://localhost:3000 پذیرفته نشد"; else warn "http://localhost:3000 در production پذیرفته می‌شود (حذف از DEFAULT_CORS_ORIGINS)"; fi
v=$(cors "https://app.arkan.gold.evil.example.com" /auth/login)
if [ -z "$v" ]; then pass "زیردامنه‌ی جعلی app.arkan.gold.evil… پذیرفته نشد"; else fail "Origin جعلی پذیرفته شد: $v"; fi
v=$(cors "$APP" /auth/login)
if [ -n "$v" ]; then pass "Origin اپ پذیرفته شد: $v"; else info "Origin اپ پذیرفته نشد (اگر مرورگر مستقیم به API نمی‌زند مشکلی نیست)"; fi
fetch "ws" "$API/socket.io/?EIO=4&transport=polling" -H "Origin: $EVIL_ORIGIN" >/dev/null
v=$(header ws Access-Control-Allow-Origin)
if [ -z "$v" ]; then pass "WebSocket قیمت: Origin بیگانه پذیرفته نشد"; else warn "WebSocket قیمت Origin بیگانه را می‌پذیرد: $v"; fi
code=$(fetch "trace" "$API/" -X TRACE)
case "$code" in
  405 | 404 | 403 | 501 | 400) pass "متد TRACE → $code" ;;
  *) warn "متد TRACE → $code" ;;
esac

# ─────────────────────────────────────────────────────────────
section "7. افشای اطلاعات در خطاها"
for req in "/market/price/history?hours=abc" "/this-route-does-not-exist-$RANDOM" "/invoices/not-a-uuid" "/verify/AG-0000-XX-0"; do
  code=$(fetch "err" "$API$req")
  if grep -qiE "at [A-Za-z_.]+ \(|node_modules|/app/|/home/|prisma|stack|ECONN|SELECT |postgres" "$TMP/err.b"; then
    fail "GET $req → $code: پاسخ شامل جزئیات داخلی است: $(head -c 200 "$TMP/err.b" | tr '\n' ' ')"
  else
    pass "GET $req → $code بدون جزئیات داخلی"
  fi
done

# ─────────────────────────────────────────────────────────────
section "8. endpointهای عمومی"
code=$(fetch "pub" "$API/market/price")
info "قیمت عمومی → $code: $(head -c 300 "$TMP/pub.b" | tr '\n' ' ')"
code=$(fetch "pub" "$API/payment-gateways/active")
info "درگاه‌های فعال → $code: $(head -c 300 "$TMP/pub.b" | tr '\n' ' ')"
code=$(fetch "pub" "$API/public/branding")
info "برندینگ عمومی → $code"
for base in "$ADMIN" "$PANEL"; do
  code=$(fetch "login" "$base/login")
  info "صفحه‌ی ورود $(host_of "$base") از این IP → $code (اگر 200 است، پنل از اینترنت عمومی در دسترس است)"
done

# ─────────────────────────────────────────────────────────────
section "9. محدودیت نرخ (rate limit)"
if [ "${SKIP_RATE_LIMIT:-0}" = "1" ]; then
  info "رد شد (SKIP_RATE_LIMIT=1)"
else
  got429=0
  for i in $(seq 1 35); do
    code=$(curl -sS -k -A "$UA" --max-time 10 -o /dev/null -w "%{http_code}" "$API/market/price" 2>/dev/null || echo 000)
    if [ "$code" = "429" ]; then got429=$i; break; fi
  done
  if [ "$got429" -gt 0 ]; then
    pass "پس از $got429 درخواست پاسخ 429 دریافت شد"
  else
    warn "۳۵ درخواست در کمتر از یک دقیقه بدون 429 — rate limit سراسری (۳۰ در دقیقه) فعال نیست یا IP درست تشخیص داده نمی‌شود"
  fi
fi

# ─────────────────────────────────────────────────────────────
section "خلاصه"
echo "  OK: $PASS   WARN: $WARN   FAIL: $FAIL"
echo "  گزارش در فایل: $OUT"
