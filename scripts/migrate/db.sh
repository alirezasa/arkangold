#!/usr/bin/env bash
# انتقال کامل دیتابیس PostgreSQL از لیارا به رانفلر (یک بار، هنگام مهاجرت).
#
#   SOURCE_DATABASE_URL='postgresql://...liara...' \
#   TARGET_DATABASE_URL='postgresql://...runflare...' \
#   bash scripts/migrate/db.sh            # مقصد باید خالی باشد
#   bash scripts/migrate/db.sh --clean    # جدول‌های موجود در مقصد (مثلاً ساخته‌شده با migrate) حذف و جایگزین می‌شوند
#
# پیش‌نیاز: pg_dump، pg_restore و psql با نسخه‌ی اصلی (major) برابر یا بالاتر از دیتابیس لیارا، و دسترسی
# شبکه به هر دو دیتابیس (آدرس عمومی هر دو را در پنل فعال کنید). خروجی dump در پوشه‌ی جاری می‌ماند تا
# نسخه‌ی پشتیبان داشته باشید.
#
# بعد از restore تعداد ردیف‌های همه‌ی جدول‌ها در مبدأ و مقصد مقایسه می‌شود و در صورت اختلاف با خطا تمام می‌شود.
set -euo pipefail

CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=1 ;;
    *) echo "[migrate] گزینه‌ی ناشناخته: $arg" >&2; exit 1 ;;
  esac
done

fail() { echo "[migrate] $*" >&2; exit 1; }
log() { echo "[migrate] $*"; }

for tool in pg_dump pg_restore psql; do
  command -v "$tool" >/dev/null || fail "$tool نصب نیست (بسته‌ی postgresql-client)"
done

# آدرس Prisma ممکن است پارامترهایی مثل ?schema=public داشته باشد که libpq نمی‌شناسد
libpq_url() {
  local url="$1"
  case "$url" in
    prisma+postgres://*|prisma://*) fail "آدرس Prisma Accelerate قابل dump نیست؛ آدرس مستقیم postgresql:// دیتابیس را بدهید" ;;
    postgres://*|postgresql://*) ;;
    *) fail "آدرس دیتابیس باید با postgresql:// شروع شود" ;;
  esac
  local base="${url%%\?*}" query=""
  [[ "$url" == *\?* ]] && query="${url#*\?}"
  local kept=() part
  IFS='&' read -ra parts <<<"$query"
  for part in "${parts[@]}"; do
    [[ -z "$part" || "$part" == schema=* ]] || kept+=("$part")
  done
  if ((${#kept[@]})); then
    local IFS='&'
    echo "$base?${kept[*]}"
  else
    echo "$base"
  fi
}

[[ -n "${SOURCE_DATABASE_URL:-}" ]] || fail "SOURCE_DATABASE_URL (دیتابیس لیارا) تنظیم نشده"
[[ -n "${TARGET_DATABASE_URL:-}" ]] || fail "TARGET_DATABASE_URL (دیتابیس رانفلر) تنظیم نشده"
SRC="$(libpq_url "$SOURCE_DATABASE_URL")"
DST="$(libpq_url "$TARGET_DATABASE_URL")"
[[ "$SRC" != "$DST" ]] || fail "مبدأ و مقصد یکی هستند"

q() { psql "$1" -X -v ON_ERROR_STOP=1 -At -c "$2"; }

log "بررسی اتصال..."
log "مبدأ: $(q "$SRC" 'select version()' | cut -d, -f1)"
log "مقصد: $(q "$DST" 'select version()' | cut -d, -f1)"

USER_TABLES="select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')"
existing="$(q "$DST" "$USER_TABLES")"
if [[ "$existing" != "0" && "$CLEAN" != "1" ]]; then
  fail "دیتابیس مقصد خالی نیست ($existing جدول). اگر این جدول‌ها فقط با prisma migrate ساخته شده‌اند و داده‌ی مهمی ندارند، با --clean اجرا کنید"
fi

DUMP="arkan-liara-$(date +%Y%m%d-%H%M%S).dump"
log "dump از لیارا → $DUMP"
pg_dump "$SRC" --format=custom --no-owner --no-privileges --file="$DUMP"
log "حجم dump: $(du -h "$DUMP" | cut -f1)"

restore_args=(--no-owner --no-privileges --exit-on-error --dbname="$DST")
if [[ "$CLEAN" == "1" ]]; then
  # --clean به‌تنهایی جدول‌هایی را که در dump نیستند حذف نمی‌کند؛ اما چون مقصد فقط با همان migrationها ساخته
  # شده، همه‌ی اشیای آن در dump هم هستند
  restore_args+=(--clean --if-exists)
fi
log "restore روی رانفلر..."
pg_restore "${restore_args[@]}" "$DUMP"

log "مقایسه‌ی تعداد ردیف‌ها..."
COUNT_SQL="
select format('select %L || ''|'' || count(*) from %I.%I', schemaname || '.' || tablename, schemaname, tablename)
from pg_tables where schemaname not in ('pg_catalog','information_schema') order by 1"
counts() {
  q "$1" "$COUNT_SQL" | while IFS= read -r stmt; do q "$1" "$stmt"; done
}
src_counts="$(counts "$SRC")"
dst_counts="$(counts "$DST")"
if ! diff <(echo "$src_counts") <(echo "$dst_counts") >/dev/null; then
  echo "$src_counts" >"$DUMP.source-counts.txt"
  echo "$dst_counts" >"$DUMP.target-counts.txt"
  diff <(echo "$src_counts") <(echo "$dst_counts") || true
  fail "تعداد ردیف‌ها یکسان نیست (جزئیات بالا)"
fi
tables="$(echo "$src_counts" | grep -c . || true)"
rows="$(echo "$src_counts" | awk -F'|' '{s+=$2} END {print s+0}')"
log "پایان: $tables جدول و $rows ردیف منتقل شد و با مبدأ یکسان است"
log "آخرین migration ثبت‌شده: $(q "$DST" 'select migration_name from _prisma_migrations order by finished_at desc nulls last limit 1' 2>/dev/null || echo '-')"
