#!/usr/bin/env bash
# scripts/zarpayesh-relay/setup-mpls-router.sh
#
# سرور اوبونتو را به «روتر پلتفرم» سند شاپرک تبدیل می‌کند (معادل نمونه‌ی Cisco IOS سند
# «راهنمای فنی راه‌اندازی و مهاجرت ارتباط پلتفرم‌های طلا به بستر MPLS جدید شاپرک»):
#
#   لینک خام MPLS (Underlay)            → آدرس و route به دو مقصد شاپرک
#   Tunnel X / Tunnel Y (GRE over IPsec) → strongSwan (IKEv1 + PSK) و دو اینترفیس GRE
#   OSPF روی هر دو تانل                  → FRR؛ فقط SERVICE_NET پذیرفته و فقط NAT Pool اعلام می‌شود
#   NAT Pool اختصاصی                     → nftables (SNAT ترافیک خود سرور به NAT_SOURCE_IP)
#
#   sudo bash setup-mpls-router.sh <mpls.env>
#   sudo bash setup-mpls-router.sh <mpls.env> --render <dir>   # فقط ساخت فایل‌ها در یک پوشه، بدون تغییر سرور
#
# اجرای دوباره امن است. SKIP_UFW=1 فایروال را دست نمی‌زند.
set -euo pipefail

ENV_FILE="${1:-}"
RENDER_DIR=""
[[ "${2:-}" == "--render" ]] && RENDER_DIR="${3:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

[[ -f "$ENV_FILE" ]] || die "usage: sudo bash $0 <mpls.env> [--render <dir>]"
if [[ -z "$RENDER_DIR" ]]; then
  [[ $EUID -eq 0 ]] || die "با sudo اجرا کنید"
else
  [[ "${2:-}" == "--render" && -n "$RENDER_DIR" ]] || die "usage: $0 <mpls.env> --render <dir>"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${MPLS_IFACE:=enp5s0f1}" "${SHAPARAK_MAIN:=172.21.193.2}" "${SHAPARAK_BACKUP:=172.21.194.2}"
: "${TUNNEL_MTU:=1400}" "${OSPF_AREA_TYPE:=normal}" "${OSPF_COST_MAIN:=10}" "${OSPF_COST_BACKUP:=100}"
: "${SERVICE_NET:=172.20.248.0/24}" "${IKE_PROPOSAL:=aes128-sha1-modp1536}" "${ESP_PROPOSAL:=aes128-sha1}"
: "${IPSEC_MODE:=tunnel}"

# ── اعتبارسنجی ──
IP4='([0-9]{1,3}\.){3}[0-9]{1,3}'
is_ip() { [[ "$1" =~ ^${IP4}$ ]]; }
is_cidr() { [[ "$1" =~ ^${IP4}/[0-9]{1,2}$ ]]; }
need_ip() { is_ip "${!1:-}" || die "$1 باید یک IP باشد (مقدار فعلی: '${!1:-}')"; }
need_cidr() { is_cidr "${!1:-}" || die "$1 باید به شکل IP/ماسک باشد (مقدار فعلی: '${!1:-}')"; }

[[ "$MPLS_IFACE" =~ ^[A-Za-z0-9._-]{1,15}$ ]] || die "MPLS_IFACE نامعتبر است"
need_cidr MPLS_IP_CIDR; need_ip MPLS_GATEWAY; need_ip SHAPARAK_MAIN; need_ip SHAPARAK_BACKUP
need_cidr TUN_MAIN_IP_CIDR; need_cidr TUN_BACKUP_IP_CIDR
need_ip OSPF_ROUTER_ID; need_cidr NAT_POOL_CIDR; need_ip NAT_SOURCE_IP; need_cidr SERVICE_NET
[[ "${OSPF_AREA:-}" =~ ^([0-9]+|${IP4})$ ]] || die "OSPF_AREA باید عدد یا قالب نقطه‌دار باشد"
[[ "$OSPF_AREA_TYPE" == normal || "$OSPF_AREA_TYPE" == nssa ]] || die "OSPF_AREA_TYPE باید normal یا nssa باشد"
[[ "$OSPF_COST_MAIN" =~ ^[0-9]+$ && "$OSPF_COST_BACKUP" =~ ^[0-9]+$ ]] || die "OSPF_COST_* باید عدد باشد"
((OSPF_COST_MAIN < OSPF_COST_BACKUP)) || die "OSPF_COST_MAIN باید کمتر از OSPF_COST_BACKUP باشد"
[[ "$TUNNEL_MTU" =~ ^[0-9]+$ ]] && ((TUNNEL_MTU >= 1280 && TUNNEL_MTU <= 1476)) || die "TUNNEL_MTU باید بین 1280 و 1476 باشد"
[[ "$IPSEC_MODE" == tunnel || "$IPSEC_MODE" == transport ]] || die "IPSEC_MODE باید tunnel یا transport باشد"
[[ "$IKE_PROPOSAL" =~ ^[a-z0-9-]+$ && "$ESP_PROPOSAL" =~ ^[a-z0-9-]+$ ]] || die "IKE_PROPOSAL/ESP_PROPOSAL نامعتبر است"
[[ "${NAT_POOL_CIDR#*/}" == 29 ]] || echo "! هشدار: سند شاپرک NAT Pool را /29 می‌داند؛ مقدار فعلی ${NAT_POOL_CIDR}"

ip2int() { local a b c d; IFS=. read -r a b c d <<<"$1"; echo $(((a << 24) + (b << 16) + (c << 8) + d)); }
in_cidr() { # ip cidr
  local net="${2%/*}" len="${2#*/}" mask
  mask=$(((0xffffffff << (32 - len)) & 0xffffffff))
  (((($(ip2int "$1")) & mask) == (($(ip2int "$net")) & mask)))
}
in_cidr "$NAT_SOURCE_IP" "$NAT_POOL_CIDR" || die "NAT_SOURCE_IP باید داخل NAT_POOL_CIDR باشد"
in_cidr "$MPLS_GATEWAY" "$MPLS_IP_CIDR" || die "MPLS_GATEWAY باید در همان شبکه‌ی MPLS_IP_CIDR باشد"
[[ "${TUN_MAIN_IP_CIDR%/*}" != "${TUN_BACKUP_IP_CIDR%/*}" ]] || die "IP دو تانل نباید یکی باشد"

MPLS_IP="${MPLS_IP_CIDR%/*}"
TUN_MAIN=gre-shp-main
TUN_BACKUP=gre-shp-bkp
ETC=/etc/zarpayesh-mpls

# ── ساخت فایل‌ها در پوشه‌ی موقت ──
OUT="${RENDER_DIR:-$(mktemp -d)}"
mkdir -p "$OUT"

# ۱) اسکریپت شبکه: Underlay، تانل‌های GRE و NAT
cat >"$OUT/zarpayesh-mpls-net" <<EOF
#!/usr/bin/env bash
# ساخته‌شده توسط setup-mpls-router.sh — دستی ویرایش نکنید
set -euo pipefail
MPLS_IFACE='$MPLS_IFACE'; MPLS_IP_CIDR='$MPLS_IP_CIDR'; MPLS_IP='$MPLS_IP'; MPLS_GATEWAY='$MPLS_GATEWAY'
TUNNEL_MTU='$TUNNEL_MTU'; SERVICE_NET='$SERVICE_NET'; NAT_SOURCE_IP='$NAT_SOURCE_IP'
# نام تانل | مقصد شاپرک | IP تانل سمت پلتفرم
TUNNELS=('$TUN_MAIN|$SHAPARAK_MAIN|$TUN_MAIN_IP_CIDR' '$TUN_BACKUP|$SHAPARAK_BACKUP|$TUN_BACKUP_IP_CIDR')

ensure_addr() { # dev cidr — فقط اگر آدرس عوض شده باشد دست می‌زند
  ip -4 -o addr show dev "\$1" | grep -qw "inet \$2" && return 0
  ip -4 addr flush dev "\$1" scope global
  ip addr add "\$2" dev "\$1"
}

up() {
  ip link set "\$MPLS_IFACE" up
  ensure_addr "\$MPLS_IFACE" "\$MPLS_IP_CIDR"
  local t name peer cidr
  for t in "\${TUNNELS[@]}"; do
    IFS='|' read -r name peer cidr <<<"\$t"
    # Underlay مستقل از تانل: مقصد شاپرک فقط از لینک MPLS (بدون Recursive Routing)
    ip route replace "\$peer/32" via "\$MPLS_GATEWAY" dev "\$MPLS_IFACE"
    if ip link show "\$name" >/dev/null 2>&1; then
      ip tunnel change "\$name" mode gre local "\$MPLS_IP" remote "\$peer" ttl 255
    else
      ip tunnel add "\$name" mode gre local "\$MPLS_IP" remote "\$peer" ttl 255
    fi
    ip link set "\$name" mtu "\$TUNNEL_MTU" up
    ensure_addr "\$name" "\$cidr"
    # مسیر برگشت ممکن است از تانل دیگر بیاید (Failover)
    sysctl -qw "net.ipv4.conf.\$name.rp_filter=2"
  done
  nft -f - <<NFT
table ip zarpayesh_mpls
delete table ip zarpayesh_mpls
table ip zarpayesh_mpls {
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    oifname { "$TUN_MAIN", "$TUN_BACKUP" } ip daddr \$SERVICE_NET counter snat to \$NAT_SOURCE_IP
  }
}
NFT
}

down() {
  nft delete table ip zarpayesh_mpls 2>/dev/null || true
  local t name peer cidr
  for t in "\${TUNNELS[@]}"; do
    IFS='|' read -r name peer cidr <<<"\$t"
    ip link del "\$name" 2>/dev/null || true
    ip route del "\$peer/32" 2>/dev/null || true
  done
}

case "\${1:-}" in
  up) up ;;
  down) down ;;
  *) echo "usage: \$0 up|down" >&2; exit 1 ;;
esac
EOF

# ۲) سرویس systemd
cat >"$OUT/zarpayesh-mpls-net.service" <<'EOF'
[Unit]
Description=ZarPayesh/Shaparak MPLS underlay, GRE tunnels and NAT pool
After=network-online.target
Wants=network-online.target
Before=strongswan.service strongswan-swanctl.service frr.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/zarpayesh-mpls-net up
ExecStop=/usr/local/sbin/zarpayesh-mpls-net down

[Install]
WantedBy=multi-user.target
EOF

# ۳) strongSwan — معادل crypto isakmp policy / transform-set / ipsec profile سند
#    پیشنهاد عمر IKE = reauth_time + over_time = 28800 ثانیه
swan_conn() { # name peer child
  cat <<EOF
  $1 {
    version = 1
    local_addrs = $MPLS_IP
    remote_addrs = $2
    proposals = $IKE_PROPOSAL
    reauth_time = 26000s
    over_time = 2800s
    rekey_time = 0s
    dpd_delay = 30s
    dpd_timeout = 120s
    keyingtries = 0
    local {
      auth = psk
      id = $MPLS_IP
    }
    remote {
      auth = psk
      id = $2
    }
    children {
      $3 {
        mode = $IPSEC_MODE
        local_ts = $MPLS_IP/32[gre]
        remote_ts = $2/32[gre]
        esp_proposals = $ESP_PROPOSAL
        life_time = 28800s
        rekey_time = 26000s
        start_action = trap
        dpd_action = trap
        close_action = trap
      }
    }
  }
EOF
}
{
  echo "# ساخته‌شده توسط setup-mpls-router.sh — دستی ویرایش نکنید"
  echo "connections {"
  swan_conn shp-main "$SHAPARAK_MAIN" gre-main
  swan_conn shp-bkp "$SHAPARAK_BACKUP" gre-bkp
  echo "}"
  echo "secrets {"
  echo "  ike-shp-main {"
  echo "    id = $SHAPARAK_MAIN"
  echo "    secret = @PSK_HEX@"
  echo "  }"
  echo "  ike-shp-bkp {"
  echo "    id = $SHAPARAK_BACKUP"
  echo "    secret = @PSK_HEX@"
  echo "  }"
  echo "}"
} >"$OUT/swanctl-zarpayesh-mpls.conf"

# ۴) FRR — معادل interface TunnelX/Y و router ospf 240 سند
AREA_LINE=""
[[ "$OSPF_AREA_TYPE" == nssa ]] && AREA_LINE=" area $OSPF_AREA nssa"
cat >"$OUT/frr.conf" <<EOF
! ساخته‌شده توسط setup-mpls-router.sh — دستی ویرایش نکنید
frr defaults traditional
hostname zarpayesh-mpls
log syslog informational
service integrated-vtysh-config
!
! NAT Pool اختصاصی: فقط همین Prefix به شاپرک اعلام می‌شود
ip route $NAT_POOL_CIDR blackhole
!
ip prefix-list GOLD-NAT-TO-OSPF seq 10 permit $NAT_POOL_CIDR
ip prefix-list SHAPARAK-SERVICE seq 10 permit $SERVICE_NET le 32
!
route-map GOLD-NAT-TO-OSPF permit 10
 match ip address prefix-list GOLD-NAT-TO-OSPF
exit
!
! از مسیرهای OSPF فقط شبکه‌ی سرویس شاپرک در جدول مسیریابی سرور نصب می‌شود
route-map OSPF-TO-KERNEL permit 10
 match ip address prefix-list SHAPARAK-SERVICE
exit
!
ip protocol ospf route-map OSPF-TO-KERNEL
!
interface $TUN_MAIN
 description To Shaparak Main
 ip ospf area $OSPF_AREA
 ip ospf network point-to-point
 ip ospf cost $OSPF_COST_MAIN
exit
!
interface $TUN_BACKUP
 description To Shaparak Backup
 ip ospf area $OSPF_AREA
 ip ospf network point-to-point
 ip ospf cost $OSPF_COST_BACKUP
exit
!
router ospf
 ospf router-id $OSPF_ROUTER_ID
 redistribute static metric-type 1 route-map GOLD-NAT-TO-OSPF
$AREA_LINE
exit
!
EOF
sed -i '/^$/d' "$OUT/frr.conf"

# ۵) قوانین فایروال (ufw before.rules) — فقط از دو مقصد شاپرک و فقط روی لینک MPLS/تانل‌ها
cat >"$OUT/ufw-before.block" <<EOF
# BEGIN zarpayesh-mpls
-A ufw-before-input -i $MPLS_IFACE -s $SHAPARAK_MAIN -p udp -m multiport --dports 500,4500 -j ACCEPT
-A ufw-before-input -i $MPLS_IFACE -s $SHAPARAK_MAIN -p esp -j ACCEPT
-A ufw-before-input -i $MPLS_IFACE -s $SHAPARAK_MAIN -p gre -j ACCEPT
-A ufw-before-input -i $MPLS_IFACE -s $SHAPARAK_BACKUP -p udp -m multiport --dports 500,4500 -j ACCEPT
-A ufw-before-input -i $MPLS_IFACE -s $SHAPARAK_BACKUP -p esp -j ACCEPT
-A ufw-before-input -i $MPLS_IFACE -s $SHAPARAK_BACKUP -p gre -j ACCEPT
-A ufw-before-input -i $TUN_MAIN -p 89 -j ACCEPT
-A ufw-before-input -i $TUN_BACKUP -p 89 -j ACCEPT
# END zarpayesh-mpls
EOF

# ۶) فایل hosts — بخش ۱۱ سند شاپرک
cat >"$OUT/hosts.block" <<'EOF'
# BEGIN zarpayesh-mpls
172.20.248.3 panel.zarpayesh.net
172.20.248.4 captcha.zarpayesh.net
172.20.248.2 api.zarpayesh.net
# END zarpayesh-mpls
EOF

if [[ -n "$RENDER_DIR" ]]; then
  ok "فایل‌ها در $RENDER_DIR ساخته شدند (سرور تغییری نکرد)"
  exit 0
fi

# ═════════════════════════ نصب روی سرور ═════════════════════════
ip link show "$MPLS_IFACE" >/dev/null 2>&1 || die "کارت شبکه‌ی $MPLS_IFACE وجود ندارد (ip -br link)"

# ── بسته‌ها ──
NEED=()
command -v swanctl >/dev/null || NEED+=(strongswan-swanctl)
[[ -x /usr/sbin/charon-systemd ]] || NEED+=(charon-systemd)
dpkg -s libstrongswan-standard-plugins >/dev/null 2>&1 || NEED+=(libstrongswan-standard-plugins)
command -v vtysh >/dev/null || NEED+=(frr)
command -v nft >/dev/null || NEED+=(nftables)
if ((${#NEED[@]})); then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${NEED[@]}"
fi
ok "بسته‌ها نصب‌اند (strongSwan، FRR، nftables)"

# ── PSK (هرگز در mpls.env یا خط فرمان نیست) ──
install -d -m 700 -o root -g root "$ETC"
if [[ ! -s "$ETC/psk" || -n "${RESET_PSK:-}" ]]; then
  echo "PSK اختصاصی پلتفرم (از فایل تنظیمات شاپرک) را وارد کنید؛ هنگام تایپ نمایش داده نمی‌شود."
  read -rsp "PSK: " PSK1; echo
  read -rsp "تکرار PSK: " PSK2; echo
  [[ -n "$PSK1" && "$PSK1" == "$PSK2" ]] || die "PSK خالی است یا دو مقدار یکی نیستند"
  (umask 077; printf '%s' "$PSK1" >"$ETC/psk")
  unset PSK1 PSK2
fi
PSK_HEX="0x$(od -An -v -tx1 <"$ETC/psk" | tr -d ' \n')"
install -m 600 -o root -g root "$ENV_FILE" "$ETC/mpls.env"

# ── شبکه ──
install -m 755 "$OUT/zarpayesh-mpls-net" /usr/local/sbin/zarpayesh-mpls-net
install -m 755 "$HERE/zarpayesh-mpls-status.sh" /usr/local/sbin/zarpayesh-mpls-status
install -m 644 "$OUT/zarpayesh-mpls-net.service" /etc/systemd/system/zarpayesh-mpls-net.service
systemctl daemon-reload
systemctl enable zarpayesh-mpls-net.service >/dev/null 2>&1
systemctl restart zarpayesh-mpls-net.service
ok "Underlay و تانل‌های $TUN_MAIN و $TUN_BACKUP ساخته شدند"

# ── فایروال ──
if [[ -z "${SKIP_UFW:-}" ]] && command -v ufw >/dev/null && [[ -f /etc/ufw/before.rules ]]; then
  BR=/etc/ufw/before.rules
  cp -p "$BR" "$BR.zarpayesh-mpls.bak"
  sed -i '/^# BEGIN zarpayesh-mpls$/,/^# END zarpayesh-mpls$/d' "$BR"
  if grep -q '^# End required lines' "$BR"; then
    sed -i "/^# End required lines/r $OUT/ufw-before.block" "$BR"
    if ufw status | grep -q '^Status: active'; then
      ufw reload >/dev/null || { cp -p "$BR.zarpayesh-mpls.bak" "$BR"; ufw reload >/dev/null; die "قوانین ufw نامعتبر بود (فایل قبلی برگردانده شد)"; }
    fi
    ok "فایروال: IKE/ESP/GRE فقط از دو مقصد شاپرک و OSPF فقط روی تانل‌ها"
  else
    echo "! خط «# End required lines» در $BR پیدا نشد؛ قوانین $OUT/ufw-before.block را دستی اضافه کنید."
  fi
fi

# ── IPsec ──
install -d -m 750 /etc/swanctl/conf.d
sed "s|@PSK_HEX@|$PSK_HEX|g" "$OUT/swanctl-zarpayesh-mpls.conf" >"$OUT/swanctl.final"
install -m 600 -o root -g root "$OUT/swanctl.final" /etc/swanctl/conf.d/zarpayesh-mpls.conf
rm -f "$OUT/swanctl.final"
SWAN_UNIT=strongswan.service
systemctl list-unit-files strongswan.service 2>/dev/null | grep -q '^strongswan\.service' || SWAN_UNIT=strongswan-swanctl.service
systemctl enable "$SWAN_UNIT" >/dev/null 2>&1
systemctl restart "$SWAN_UNIT"
sleep 2
swanctl --load-all >/dev/null || die "پیکربندی strongSwan بارگذاری نشد (journalctl -u $SWAN_UNIT -n 50)"
ok "IPsec (IKEv1) برای هر دو مقصد شاپرک بارگذاری شد"

# ── OSPF ──
sed -i 's/^ospfd=.*/ospfd=yes/' /etc/frr/daemons
[[ -f /etc/frr/frr.conf && ! -f /etc/frr/frr.conf.before-zarpayesh ]] && cp -p /etc/frr/frr.conf /etc/frr/frr.conf.before-zarpayesh
install -m 640 -o frr -g frr "$OUT/frr.conf" /etc/frr/frr.conf
systemctl enable frr.service >/dev/null 2>&1
systemctl restart frr.service
ok "OSPF روی هر دو تانل فعال شد (Area $OSPF_AREA، Router-ID $OSPF_ROUTER_ID)"

# ── hosts ──
sed -i '/^# BEGIN zarpayesh-mpls$/,/^# END zarpayesh-mpls$/d' /etc/hosts
cat "$OUT/hosts.block" >>/etc/hosts
ok "نام‌های zarpayesh.net در /etc/hosts ثبت شدند"

rm -rf "$OUT"

# ── شروع مذاکره و گزارش ──
swanctl --initiate --child gre-main --timeout 20 >/dev/null 2>&1 || true
swanctl --initiate --child gre-bkp --timeout 20 >/dev/null 2>&1 || true
echo
echo "صبر برای برقراری همسایگی OSPF (تا ۶۰ ثانیه)…"
for _ in $(seq 1 12); do
  vtysh -c 'show ip ospf neighbor' 2>/dev/null | grep -q 'Full' && break
  sleep 5
done
echo
/usr/local/sbin/zarpayesh-mpls-status || true
