#!/usr/bin/env bash
# scripts/zarpayesh-relay/setup-relay.sh
#
# نصب و پیکربندی سرور رله‌ی زر پایش روی اوبونتو (۲۲.۰۴ یا ۲۴.۰۴). اجرای دوباره امن است (idempotent).
#
#   sudo bash setup-relay.sh <relay.env> <پوشه‌ی گواهی‌های make-certs.sh>
#
# کارها: نصب nginx و ufw، نصب گواهی‌ها در /etc/zarpayesh-relay، ساخت پیکربندی nginx از الگو،
# بستن فایروال (فقط SSH و پورت رله)، بررسی دسترسی به زر پایش از مسیر MPLS.
# SKIP_UFW=1 فایروال را دست نمی‌زند.
set -euo pipefail

ENV_FILE="${1:-}"
CERT_DIR="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

[[ $EUID -eq 0 ]] || die "با sudo اجرا کنید"
[[ -f "$ENV_FILE" ]] || die "usage: sudo bash $0 <relay.env> <cert-dir>"
[[ -d "$CERT_DIR" ]] || die "پوشه‌ی گواهی‌ها پیدا نشد: $CERT_DIR"
for f in ca.crt server.crt server.key; do
  [[ -f "$CERT_DIR/$f" ]] || die "$CERT_DIR/$f وجود ندارد (اول make-certs.sh را اجرا کنید)"
done

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${RELAY_PORT:=8443}" "${ZP_UPSTREAM_SCHEME:=https}" "${ZP_UPSTREAM_HOST:=api.rpmms.ir}"
: "${ZP_UPSTREAM_VERIFY:=on}" "${SSH_PORT:=22}" "${RELAY_ALLOW_FROM:=}" "${SSH_ALLOW_FROM:=}"
[[ -n "${RELAY_NAME:-}" ]] || die "RELAY_NAME خالی است"
[[ "${RELAY_SECRET:-}" =~ ^[0-9a-fA-F]{32,}$ ]] || die "RELAY_SECRET باید hex و حداقل ۳۲ کاراکتر باشد (openssl rand -hex 32)"
[[ "$RELAY_PORT" =~ ^[0-9]+$ ]] || die "RELAY_PORT نامعتبر است"
[[ "$ZP_UPSTREAM_SCHEME" == http || "$ZP_UPSTREAM_SCHEME" == https ]] || die "ZP_UPSTREAM_SCHEME باید http یا https باشد"
[[ "${ZP_UPSTREAM_ADDR:-}" =~ ^[A-Za-z0-9.\-]+:[0-9]+$ ]] || die "ZP_UPSTREAM_ADDR باید به شکل IP:PORT باشد"
[[ "$ZP_UPSTREAM_VERIFY" == on || "$ZP_UPSTREAM_VERIFY" == off ]] || die "ZP_UPSTREAM_VERIFY باید on یا off باشد"
[[ "$ZP_UPSTREAM_HOST" =~ ^[A-Za-z0-9.\-]+$ ]] || die "ZP_UPSTREAM_HOST نامعتبر است"
[[ "$RELAY_NAME" =~ ^[A-Za-z0-9.\-]+$ ]] || die "RELAY_NAME نامعتبر است"

# ── ۱) بسته‌ها ──
NEED=()
command -v nginx >/dev/null || NEED+=(nginx)
command -v envsubst >/dev/null || NEED+=(gettext-base)
[[ -n "${SKIP_UFW:-}" ]] || command -v ufw >/dev/null || NEED+=(ufw)
if ((${#NEED[@]})); then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEED[@]}"
fi
ok "بسته‌ها نصب‌اند"

# ── ۲) گواهی‌ها ──
install -d -m 750 -o root -g root /etc/zarpayesh-relay
install -m 644 "$CERT_DIR/ca.crt" /etc/zarpayesh-relay/ca.crt
install -m 644 "$CERT_DIR/server.crt" /etc/zarpayesh-relay/server.crt
install -m 600 "$CERT_DIR/server.key" /etc/zarpayesh-relay/server.key
openssl verify -CAfile /etc/zarpayesh-relay/ca.crt /etc/zarpayesh-relay/server.crt >/dev/null \
  || die "server.crt با ca.crt امضا نشده است"
ok "گواهی‌ها در /etc/zarpayesh-relay نصب شدند"
if [[ -f "$CERT_DIR/ca.key" ]]; then
  echo "! هشدار: $CERT_DIR/ca.key روی این سرور است — بعد از کپی در جای امن، حذفش کنید (shred -u)."
fi

# ── ۳) nginx ──
CONF=/etc/nginx/conf.d/zarpayesh-relay.conf
TMP="$(mktemp)"
envsubst '${RELAY_NAME} ${RELAY_PORT} ${RELAY_SECRET} ${ZP_UPSTREAM_SCHEME} ${ZP_UPSTREAM_ADDR} ${ZP_UPSTREAM_HOST} ${ZP_UPSTREAM_VERIFY}' \
  <"$HERE/nginx.conf.template" >"$TMP"
[[ -f "$CONF" ]] && cp -p "$CONF" "$CONF.bak"
install -m 600 -o root -g root "$TMP" "$CONF"
rm -f "$TMP"
# سایت پیش‌فرض nginx (پورت ۸۰) لازم نیست
rm -f /etc/nginx/sites-enabled/default
if ! nginx -t 2>/tmp/zp-relay-nginx-test.log; then
  cat /tmp/zp-relay-nginx-test.log >&2
  [[ -f "$CONF.bak" ]] && mv "$CONF.bak" "$CONF"
  die "پیکربندی nginx نامعتبر است (فایل قبلی برگردانده شد)"
fi
if [[ -d /run/systemd/system ]]; then
  systemctl enable --now nginx >/dev/null
  systemctl reload nginx
else
  nginx -s reload 2>/dev/null || nginx
fi
ok "nginx روی پورت $RELAY_PORT گوش می‌دهد"

# ── ۴) فایروال ──
if [[ -z "${SKIP_UFW:-}" ]]; then
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  # پورت واقعی sshd را هم باز می‌گذاریم تا با SSH_PORT اشتباه، دسترسی به سرور قطع نشود
  for p in $(sshd -T 2>/dev/null | awk '$1=="port"{print $2}'); do
    if [[ "$p" != "$SSH_PORT" ]]; then
      echo "! sshd روی پورت $p گوش می‌دهد ولی SSH_PORT=$SSH_PORT است؛ پورت $p هم باز شد. relay.env را اصلاح کنید."
      ufw allow "$p/tcp" >/dev/null
    fi
  done
  if [[ -n "$SSH_ALLOW_FROM" ]]; then
    for ip in $SSH_ALLOW_FROM; do ufw allow from "$ip" to any port "$SSH_PORT" proto tcp >/dev/null; done
  else
    ufw allow "$SSH_PORT/tcp" >/dev/null
  fi
  if [[ -n "$RELAY_ALLOW_FROM" ]]; then
    for ip in $RELAY_ALLOW_FROM; do ufw allow from "$ip" to any port "$RELAY_PORT" proto tcp >/dev/null; done
  else
    ufw allow "$RELAY_PORT/tcp" >/dev/null
  fi
  ufw --force enable >/dev/null
  ok "فایروال فعال است (فقط SSH:$SSH_PORT و رله:$RELAY_PORT)"
fi

# ── ۵) دسترسی به زر پایش از مسیر MPLS ──
UP_HOST="${ZP_UPSTREAM_ADDR%:*}"
UP_PORT="${ZP_UPSTREAM_ADDR##*:}"
if timeout 5 bash -c "</dev/tcp/$UP_HOST/$UP_PORT" 2>/dev/null; then
  ok "اتصال TCP به زر پایش ($ZP_UPSTREAM_ADDR) برقرار است"
  ip route get "$UP_HOST" 2>/dev/null | head -1 | sed 's/^/  مسیر: /' || true
else
  echo "! اتصال به $ZP_UPSTREAM_ADDR برقرار نشد — لینک MPLS، route در netplan و Whitelist زر پایش را بررسی کنید."
fi

cat <<EOF

آزمون از هر سیستمی که client.crt و client.key را دارد:
  curl --cacert ca.crt --cert client.crt --key client.key \\
       -H "X-Arkan-Relay-Key: <RELAY_SECRET>" https://$RELAY_NAME:$RELAY_PORT/__relay/health
لاگ: /var/log/nginx/zarpayesh-relay.log
EOF
