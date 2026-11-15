#!/usr/bin/env bash
# 배포 전 검증 파이프라인 (P1-8). 단계 하나라도 실패하면 즉시 멈춘다.
#
#   WEB_ENV=deploy/web.env WORKER_ENV=deploy/worker.env ADMIN_DATABASE_URL=... deploy/release.sh          검증만
#   ... CONFIRM_MIGRATE=yes TARGET_DATABASE_URL=... deploy/release.sh --apply                              + 백업 후 운영 DB 마이그레이션
#
# 이 스크립트는 "코드 검증"까지만 보증한다. 워커 VM 의 네트워크 격리는 VM 에서 deploy/run-worker.sh 의
# 격리 확인이 통과해야 하며, 그 전에는 릴리스 기록에 "VM 미검증"으로 남고 워커를 운영에 투입하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
SHA="$(git rev-parse --short=12 HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$(mktemp)"
step() { echo; echo "== $1"; }
record=()
ok() { record+=("- [x] $1"); }

step "0. 작업 트리 깨끗한지"
if [ -n "$(git status --porcelain)" ]; then echo "커밋 안 된 변경이 있습니다. 배포는 커밋된 코드로만."; exit 1; fi
ok "커밋 $SHA 기준 (작업 트리 깨끗함)"

step "1. 의존성 (lock 파일 그대로)"
npm ci --no-audit --no-fund >"$LOG" 2>&1 || { tail -20 "$LOG"; exit 1; }
ok "npm ci"

step "2. 비밀값 누출 검사"
npx tsx scripts/check-secrets.ts
ok "비밀값 누출 검사"

step "3. 타입·린트·단위 테스트"
npx tsc --noEmit -p .
npx next lint
npx vitest run
ok "타입 검사·린트·단위 테스트"

step "4. 정확성 회귀 (정답 화면 세트)"
npx tsx fixtures/serve.ts >"$LOG.fx" 2>&1 & FX=$!
trap 'kill $FX 2>/dev/null || true' EXIT
sleep 2
npx tsx scripts/test-accuracy.ts | tail -3
ok "정확성 회귀 (거짓 미발견·거짓 부적합 0)"

step "5. 운영 빌드"
npm run build >"$LOG" 2>&1 || { tail -30 "$LOG"; exit 1; }
ok "운영 빌드"

step "6. 운영 설정 점검"
: "${WEB_ENV:?WEB_ENV (웹 운영 설정 파일 경로) 필요}"
: "${WORKER_ENV:?WORKER_ENV (워커 운영 설정 파일 경로) 필요}"
npx tsx scripts/preflight.ts --role web --env-file "$WEB_ENV"
npx tsx scripts/preflight.ts --role worker --env-file "$WORKER_ENV"
ok "운영 설정 점검 (웹·워커)"

step "7. 마이그레이션 사전 검사 (임시 DB 에 처음부터·중복 적용, RLS·워커 권한)"
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL (임시 DB 를 만들 수 있는 계정) 필요}"
ADMIN_DATABASE_URL="$ADMIN_DATABASE_URL" npx tsx scripts/migrate-check.ts
ok "마이그레이션 사전 검사"

MIGRATED="적용 안 함 (검증만)"
if [ "$APPLY" = 1 ]; then
  step "8. 운영 DB 백업 후 마이그레이션"
  [ "${CONFIRM_MIGRATE:-}" = "yes" ] || { echo "CONFIRM_MIGRATE=yes 가 없어 운영 DB 를 건드리지 않습니다."; exit 1; }
  : "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL 필요}"
  : "${BACKUP_DIR:?BACKUP_DIR (암호화된 저장소 경로) 필요}"
  umask 077
  pg_dump "$TARGET_DATABASE_URL" --schema=a11y -Fc -f "$BACKUP_DIR/a11y-$STAMP-before-$SHA.dump"
  DIRECT_URL="$TARGET_DATABASE_URL" npx drizzle-kit migrate
  MIGRATED="적용함 (직전 백업 $BACKUP_DIR/a11y-$STAMP-before-$SHA.dump)"
  ok "운영 DB 백업 후 마이그레이션"
fi

VM="미검증 — 워커 VM 에서 deploy/run-worker.sh 격리 확인 통과 전에는 워커를 운영에 투입하지 않음"
if [ -n "${VM_ISOLATION_EVIDENCE:-}" ] && [ -f "$VM_ISOLATION_EVIDENCE" ] && grep -q "격리 확인 통과" "$VM_ISOLATION_EVIDENCE"; then
  VM="통과 기록 있음: $(grep "격리 확인 통과" "$VM_ISOLATION_EVIDENCE" | tail -1) (운영자 확인 필요)"
fi

mkdir -p docs/releases
OUT="docs/releases/$STAMP-$SHA.md"
{
  echo "# 릴리스 기록 $STAMP ($SHA)"
  echo
  echo "## 코드 검증: 완료"
  printf '%s\n' "${record[@]}"
  echo
  echo "## 운영 DB 마이그레이션: $MIGRATED"
  echo "## 워커 VM 네트워크 격리: $VM"
  echo "## 복구 훈련: 운영 DB 에서 deploy/backup-restore-drill.sh 를 실행한 기록이 있어야 '검증됨'"
} >"$OUT"
echo; echo "릴리스 기록: $OUT"
