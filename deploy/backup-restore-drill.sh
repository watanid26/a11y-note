#!/usr/bin/env bash
# 백업·복구 훈련 (P1-8): a11y 스키마를 덤프 → 임시 DB 에 복구 → 표별 행 수·행 보안·정책 비교 → 임시 DB 삭제.
# 운영에서는 Supabase 자동 백업(PITR)과 별도로, 마이그레이션 직전에 이 덤프를 남긴다.
#   SOURCE_URL=<원본 DB>  ADMIN_URL=<createdb 권한, 같은 서버의 postgres DB>  deploy/backup-restore-drill.sh [덤프 저장 경로]
# 덤프 파일에는 개인정보(이메일·주소)가 들어 있다 → 권한 600, 암호화된 저장소에만 보관, 보관 기간을 정해 삭제.
set -euo pipefail
: "${SOURCE_URL:?SOURCE_URL 필요}"
: "${ADMIN_URL:?ADMIN_URL 필요}"
OUT="${1:-$(mktemp -d)/a11y-$(date -u +%Y%m%dT%H%M%SZ).dump}"
umask 077
NAME="a11ynote_restore_$(date +%s)"
DB_URL="$(python3 -c 'import sys,urllib.parse as u; p=u.urlsplit(sys.argv[1]); print(u.urlunsplit(p._replace(path="/"+sys.argv[2])))' "$ADMIN_URL" "$NAME")"
cleanup() { psql "$ADMIN_URL" -qc "drop database if exists $NAME with (force)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "1) 덤프: a11y 스키마 → $OUT"
pg_dump "$SOURCE_URL" --schema=a11y -Fc -f "$OUT"
ls -l "$OUT"

echo "2) 임시 DB 에 복구: $NAME"
psql "$ADMIN_URL" -qc "create database $NAME"
pg_restore --no-owner -d "$DB_URL" "$OUT"

echo "3) 비교"
q_counts() { psql "$1" -Atc "select string_agg(t || '=' || n, ' ' order by t) from (select relname t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from a11y.%I', relname), false, true, '')))[1]::text::int n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'a11y' and c.relkind = 'r') x"; }
q_sec() { psql "$1" -Atc "select (select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='a11y' and c.relkind='r' and c.relrowsecurity) || ' rls / ' || (select count(*) from pg_policies where schemaname='a11y') || ' policies'"; }
SRC_COUNTS="$(q_counts "$SOURCE_URL")"; DST_COUNTS="$(q_counts "$DB_URL")"
SRC_SEC="$(q_sec "$SOURCE_URL")"; DST_SEC="$(q_sec "$DB_URL")"
echo "   원본: $SRC_SEC"; echo "   복구: $DST_SEC"
if [ "$SRC_COUNTS" != "$DST_COUNTS" ]; then echo "FAIL 표별 행 수가 다름"; echo "원본 $SRC_COUNTS"; echo "복구 $DST_COUNTS"; exit 1; fi
if [ "$SRC_SEC" != "$DST_SEC" ]; then echo "FAIL 행 보안·정책 수가 다름"; exit 1; fi
echo "PASS 복구 훈련: 표 $(echo "$SRC_COUNTS" | wc -w)개 행 수 일치, $DST_SEC"
