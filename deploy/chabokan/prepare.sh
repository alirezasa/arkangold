#!/usr/bin/env sh
# برای روش‌هایی از استقرار که فقط فایل ./Dockerfile در ریشه‌ی پروژه را می‌خوانند:
#   sh deploy/chabokan/prepare.sh api     ← Dockerfile سرویس API را در ریشه قرار می‌دهد
#   sh deploy/chabokan/prepare.sh app
#   sh deploy/chabokan/prepare.sh admin
# (فایل ./Dockerfile ساخته‌شده در .gitignore است)
set -eu
SERVICE="${1:-}"
case "$SERVICE" in
  api|app|admin) ;;
  *) echo "usage: $0 api|app|admin" >&2; exit 1 ;;
esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cp "$ROOT/deploy/chabokan/$SERVICE.Dockerfile" "$ROOT/Dockerfile"
echo "✅ $ROOT/Dockerfile ← deploy/chabokan/$SERVICE.Dockerfile"
