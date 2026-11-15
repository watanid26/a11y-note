#!/usr/bin/env bash
# 크롬 확장을 설치용 zip 으로 묶는다 → public/a11ynote-extension.zip (사이트의 "설치 방법" 화면에서 내려받음)
set -euo pipefail
cd "$(dirname "$0")/.."
npm run -s build:core >/dev/null 2>&1 || true
tmp=$(mktemp -d)
mkdir -p "$tmp/a11ynote-extension"
cp extension/manifest.json extension/*.js extension/*.html extension/*.css extension/*.png "$tmp/a11ynote-extension/"
rm -f public/a11ynote-extension.zip
(cd "$tmp" && zip -qr - a11ynote-extension) > public/a11ynote-extension.zip
rm -rf "$tmp"
echo "public/a11ynote-extension.zip $(du -h public/a11ynote-extension.zip | cut -f1)"
