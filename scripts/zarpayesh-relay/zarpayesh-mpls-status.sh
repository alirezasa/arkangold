#!/usr/bin/env bash
# scripts/zarpayesh-relay/zarpayesh-mpls-status.sh  (نصب: /usr/local/sbin/zarpayesh-mpls-status)
#
# گزارش وضعیت اتصال MPLS شاپرک مطابق «معیار پذیرش» سند شاپرک (بخش ۱۰):
#   Underlay ← IPsec ← تانل‌های GRE ← همسایگی OSPF ← مسیر شبکه‌ی سرویس ← NAT Pool ← HTTPS زر پایش
# خروجی را می‌توان عیناً برای پشتیبانی شاپرک فرستاد (PSK در آن نیست).
set -uo pipefail

ENV_FILE="${1:-/etc/zarpayesh-mpls/mpls.env}"
[[ -r "$ENV_FILE" ]] || { echo "✗ $ENV_FILE خوانده نشد (با sudo اجرا کنید)"; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${MPLS_IFACE:=enp5s0f1}" "${SHAPARAK_MAIN:=172.21.193.2}" "${SHAPARAK_BACKUP:=172.21.194.2}"
: "${SERVICE_NET:=172.20.248.0/24}"
TUN_MAIN=gre-shp-main
TUN_BACKUP=gre-shp-bkp
API_IP=172.20.248.2
FAIL=0

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*"; FAIL=$((FAIL + 1)); }
warn() { echo "  ! $*"; }
hdr() { echo; echo "── $* ──"; }

hdr "۱) Underlay (لینک MPLS روی $MPLS_IFACE)"
if ip -br link show "$MPLS_IFACE" 2>/dev/null | grep -q 'LOWER_UP'; then pass "کابل وصل است"; else fail "کابل/پورت $MPLS_IFACE وصل نیست"; fi
if ip -4 -o addr show dev "$MPLS_IFACE" | grep -qw "inet ${MPLS_IP_CIDR:-x}"; then pass "آدرس $MPLS_IP_CIDR"; else fail "آدرس $MPLS_IP_CIDR روی $MPLS_IFACE نیست"; fi
for peer in "$SHAPARAK_MAIN" "$SHAPARAK_BACKUP"; do
  r="$(ip route get "$peer" 2>/dev/null | head -1)"
  if [[ "$r" == *"dev $MPLS_IFACE"* ]]; then pass "مسیر $peer از $MPLS_IFACE (مستقل از تانل)"; else fail "مسیر $peer از $MPLS_IFACE نیست: $r"; fi
done
if ping -c 2 -W 2 -q "${MPLS_GATEWAY:-0.0.0.0}" >/dev/null 2>&1; then pass "Gateway MPLS ($MPLS_GATEWAY) پاسخ می‌دهد"; else warn "Gateway MPLS ($MPLS_GATEWAY) به ping پاسخ نداد (ممکن است ICMP بسته باشد)"; fi

hdr "۲) IPsec / IKE  (معادل show crypto isakmp sa / show crypto ipsec sa)"
SAS="$(swanctl --list-sas 2>/dev/null)"
for pair in "shp-main|gre-main|$SHAPARAK_MAIN" "shp-bkp|gre-bkp|$SHAPARAK_BACKUP"; do
  IFS='|' read -r conn child peer <<<"$pair"
  blk="$(awk -v c="$conn:" '$1==c{p=1} p&&/^[^ ]/&&$1!=c{p=0} p' <<<"$SAS")"
  if grep -q 'ESTABLISHED' <<<"$blk"; then pass "IKE با $peer برقرار است"; else fail "IKE با $peer برقرار نیست"; fi
  if grep -q "$child:.*INSTALLED" <<<"$blk"; then pass "IPsec SA ($child) نصب است"; else fail "IPsec SA ($child) نصب نیست"; fi
done

hdr "۳) تانل‌های GRE  (معادل show interface TunnelX/Y)"
for t in "$TUN_MAIN" "$TUN_BACKUP"; do
  if ip -br link show "$t" 2>/dev/null | grep -q 'UP'; then
    pass "$t: $(ip -4 -o addr show dev "$t" | awk '{print $4}') mtu $(cat "/sys/class/net/$t/mtu")"
  else
    fail "$t وجود ندارد یا خاموش است"
  fi
done

hdr "۴) OSPF  (معادل show ip ospf neighbor)"
NB="$(vtysh -c 'show ip ospf neighbor' 2>/dev/null)"
echo "$NB" | sed 's/^/    /'
for t in "$TUN_MAIN" "$TUN_BACKUP"; do
  if grep -E "Full.*$t" <<<"$NB" >/dev/null; then pass "همسایگی روی $t در وضعیت FULL"; else fail "همسایگی روی $t FULL نیست"; fi
done

hdr "۵) مسیر شبکه‌ی سرویس شاپرک $SERVICE_NET  (معادل show ip route 172.20.248.0)"
RT="$(vtysh -c "show ip route $SERVICE_NET longer-prefixes" 2>/dev/null | grep -E '^[A-Z]')"
echo "$RT" | sed 's/^/    /'
KR="$(ip route get "$API_IP" 2>/dev/null | head -1)"
if [[ "$KR" == *"dev $TUN_MAIN"* ]]; then
  pass "مسیر فعال به $API_IP از تانل اصلی ($TUN_MAIN) و با OSPF"
elif [[ "$KR" == *"dev $TUN_BACKUP"* ]]; then
  warn "مسیر فعال به $API_IP از تانل پشتیبان ($TUN_BACKUP) است — تانل اصلی را بررسی کنید"
else
  fail "مسیر OSPF به $API_IP در جدول مسیریابی نیست: $KR"
fi

hdr "۶) NAT Pool اختصاصی ${NAT_POOL_CIDR:-?}"
if vtysh -c 'show ip ospf database external self-originate' 2>/dev/null | grep -q "${NAT_POOL_CIDR%/*}"; then
  pass "NAT Pool به OSPF اعلام می‌شود (دریافت آن را از شاپرک تأیید بگیرید)"
else
  fail "NAT Pool در OSPF اعلام نمی‌شود"
fi
if nft list table ip zarpayesh_mpls 2>/dev/null | grep -q "snat to ${NAT_SOURCE_IP:-x}"; then
  pass "SNAT به $NAT_SOURCE_IP فعال است ($(nft list table ip zarpayesh_mpls | grep -o 'packets [0-9]*' | head -1))"
else
  fail "قانون SNAT نصب نیست (systemctl restart zarpayesh-mpls-net)"
fi

hdr "۷) سرویس زر پایش (HTTPS به api.zarpayesh.net)"
CODE="$(curl -sS --noproxy '*' -m 10 -o /dev/null -w '%{http_code}' https://api.zarpayesh.net/ 2>/tmp/zp-mpls-curl.err)"
if [[ "$CODE" =~ ^[1-5][0-9][0-9]$ ]]; then
  pass "پاسخ HTTP $CODE از api.zarpayesh.net (هر کد HTTP یعنی مسیر و TLS سالم است)"
else
  ERR="$(head -1 /tmp/zp-mpls-curl.err 2>/dev/null)"
  if [[ "$ERR" == *certificate* ]]; then
    warn "اتصال برقرار است ولی گواهی TLS با CAهای عمومی تأیید نشد → در relay.env مقدار ZP_UPSTREAM_VERIFY=off"
  else
    fail "پاسخی از api.zarpayesh.net نیامد: $ERR"
  fi
fi
rm -f /tmp/zp-mpls-curl.err

echo
if ((FAIL == 0)); then
  echo "نتیجه: همه‌ی بررسی‌ها موفق ✓"
else
  echo "نتیجه: $FAIL بررسی ناموفق ✗ — از اولین ✗ بالا شروع کنید (هر لایه به لایه‌ی قبلی وابسته است)."
  echo "لاگ‌ها:  journalctl -u strongswan -n 50   |   journalctl -u frr -n 50"
fi
exit $((FAIL > 0))
