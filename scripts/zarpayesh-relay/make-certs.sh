#!/usr/bin/env bash
# scripts/zarpayesh-relay/make-certs.sh
#
# ساخت CA اختصاصی و گواهی‌های mTLS بین سرویس API (رانفلر) و سرور رله‌ی زر پایش.
#   - ca.crt / ca.key        : CA اختصاصی (ca.key را بعد از ساخت، بیرون از سرور و امن نگه دارید)
#   - server.crt / server.key: گواهی nginx روی سرور رله (SAN = نام‌ها/IPهای داده‌شده)
#   - client.crt / client.key: گواهی سرویس API (CN=arkan-api) — فقط در متغیرهای رانفلر
#
# استفاده:
#   bash make-certs.sh zp-relay.arkan.gold[,<IP عمومی سرور>] [پوشه‌ی خروجی]
set -euo pipefail

SAN_LIST="${1:-}"
OUT="${2:-./zarpayesh-relay-certs}"
if [[ -z "$SAN_LIST" ]]; then
  echo "usage: $0 <dns-or-ip>[,<dns-or-ip>...] [out-dir]" >&2
  exit 1
fi
if [[ -e "$OUT/ca.key" ]]; then
  echo "خطا: $OUT/ca.key از قبل وجود دارد؛ برای جلوگیری از بازنویسی، پوشه‌ی دیگری بدهید." >&2
  exit 1
fi

umask 077
mkdir -p "$OUT"
cd "$OUT"

SAN=""
FIRST=""
IFS=',' read -ra ITEMS <<<"$SAN_LIST"
for raw in "${ITEMS[@]}"; do
  item="$(echo "$raw" | xargs)"
  [[ -z "$item" ]] && continue
  [[ -z "$FIRST" ]] && FIRST="$item"
  if [[ "$item" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$item" == *:* ]]; then
    SAN+="${SAN:+,}IP:$item"
  else
    SAN+="${SAN:+,}DNS:$item"
  fi
done

KEYOPT=(-newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes)

# ۱) CA — ۵ سال
openssl req -x509 "${KEYOPT[@]}" -keyout ca.key -out ca.crt -days 1825 \
  -subj "/O=Arkan Gold/CN=Arkan ZarPayesh Relay CA" \
  -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null

sign() { # name cn ext
  openssl req -new "${KEYOPT[@]}" -keyout "$1.key" -out "$1.csr" -subj "/O=Arkan Gold/CN=$2" 2>/dev/null
  openssl x509 -req -in "$1.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 \
    -out "$1.crt" -extfile <(printf '%b' "$3") 2>/dev/null
  rm -f "$1.csr"
}

# ۲) گواهی سرور رله — ۸۲۵ روز
sign server "$FIRST" "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=$SAN\n"
# ۳) گواهی کلاینت سرویس API — ۸۲۵ روز
sign client "arkan-api" "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n"
rm -f ca.srl

openssl verify -CAfile ca.crt server.crt client.crt >/dev/null

b64() { base64 -w0 "$1" 2>/dev/null || base64 <"$1" | tr -d '\n'; }

cat <<EOF

گواهی‌ها در $(pwd) ساخته شدند (SAN سرور: $SAN).

▸ روی سرور رله لازم است: ca.crt  server.crt  server.key   (setup-relay.sh آن‌ها را نصب می‌کند)
▸ ca.key را بعد از نصب از سرور حذف و در جای امن (بیرون از سرور) نگه دارید.

▸ این سه مقدار را در متغیرهای محیطی سرویس api رانفلر بگذارید (هر کدام یک خط):

ZARPAYESH_RELAY_CA=$(b64 ca.crt)

ZARPAYESH_RELAY_CLIENT_CERT=$(b64 client.crt)

ZARPAYESH_RELAY_CLIENT_KEY=$(b64 client.key)

EOF
