#!/usr/bin/env bash
# 운영 빌드 회귀 (P1-8): .next-prod 에 따로 빌드해 개발 서버를 건드리지 않는다.
#  1) 운영 설정이 잘못되면 서버가 요청을 받지 않는지 (설정 점검 기본 거부)
#  2) 운영 모드에서 인증·인가·내부 경로·확장 출처·SSRF 설정 회귀 (scripts/test-prod-runtime.ts)
# 실행: bash scripts/test-prod-build.sh   (Postgres 필요)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=3300
SECRET="$(openssl rand -hex 32)"
export NEXT_DIST_DIR=.next-prod
export NEXT_PUBLIC_SUPABASE_URL=https://auth.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon NEXT_PUBLIC_SITE_URL=https://a11ynote.invalid
echo "== 운영 빌드"
npx tsx scripts/build-core.ts >/dev/null
NODE_ENV=production npx next build >/tmp/prod-build.log 2>&1 || { tail -30 /tmp/prod-build.log; exit 1; }
stop() { fuser -k -TERM "$PORT/tcp" >/dev/null 2>&1 || true; for i in $(seq 1 20); do fuser "$PORT/tcp" >/dev/null 2>&1 || return 0; sleep 0.5; done; fuser -k -KILL "$PORT/tcp" >/dev/null 2>&1 || true; }
wait_up() { for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/api/health" && return 0; sleep 1; done; return 1; }

stop
echo "== 1) 잘못된 운영 설정(공유 비밀 없음 등)으로 시작"
( NODE_ENV=production WORKER_SHARED_SECRET= EXTENSION_ORIGINS= npx next start -p $PORT >/tmp/prod-bad.log 2>&1 & )
sleep 8
code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/health" || true)
if grep -q "운영 설정 점검 실패" /tmp/prod-bad.log && [ "$code" != "200" ]; then echo "PASS  설정 오류면 요청을 처리하지 않음 (헬스 체크 응답 $code, 모든 요청 실패)"; else echo "FAIL  설정 오류인데 서버가 응답함 ($code)"; tail -20 /tmp/prod-bad.log; stop; exit 1; fi
stop; sleep 2

echo "== 2) 운영 모드 회귀 (로컬 DB 비밀번호 때문에 PREFLIGHT_SKIP=1, DEV_LOGIN_ENABLED=1 은 일부러 넣음)"
( NODE_ENV=production PREFLIGHT_SKIP=1 DEV_LOGIN_ENABLED=1 WORKER_SHARED_SECRET="$SECRET" EXTENSION_ORIGINS="chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" SUPABASE_SERVICE_ROLE_KEY=test-service npx next start -p $PORT >/tmp/prod-ok.log 2>&1 & )
wait_up || { tail -30 /tmp/prod-ok.log; stop; exit 1; }
set +e
PROD_BASE="http://localhost:$PORT" npx tsx scripts/test-prod-runtime.ts
rc=$?
set -e
stop
exit $rc
