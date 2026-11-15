#!/usr/bin/env bash
# 워커 시작 자체 점검 테스트: 격리 없으면 워커가 시작을 거부(종료 코드 78), 격리 규칙 적용 시 통과.
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
ok(){ echo "PASS  $1"; pass=$((pass+1)); }; bad(){ echo "FAIL  $1 :: $2"; fail=$((fail+1)); }
ip addr add 169.254.169.254/32 dev lo 2>/dev/null || true
node -e 'require("http").createServer((q,r)=>r.end("x")).listen(80,"169.254.169.254")' & SRV=$!
sleep 1
out=$(REQUIRE_ISOLATION=1 timeout 60 npx tsx -e 'import { isolationCheck } from "./worker/isolation-check"; isolationCheck().then((r) => { console.log(JSON.stringify(r)); process.exit(r.ok ? 0 : 78); });' 2>&1 | tail -1); code=$?
echo "$out" | grep -q '"ok":false' && ok "격리 없음: 메타데이터 접속 가능 → 점검 실패 $out" || bad "격리 없음 감지" "$out"
./deploy/worker-firewall.sh local apply >/dev/null
chmod -R o+rX node_modules >/dev/null 2>&1 || true
out2=$(su a11yworker -s /bin/bash -c 'cd '"$PWD"' && HOME=/tmp timeout 60 node --experimental-strip-types -e "import(\"./worker/isolation-check.ts\").then(m=>m.isolationCheck()).then(r=>console.log(JSON.stringify(r)))"' 2>&1 | tail -1)
echo "$out2" | grep -q '"ok":true' && ok "격리 규칙 적용 사용자: 점검 통과 $out2" || bad "격리 적용 시 통과" "$out2"
./deploy/worker-firewall.sh local remove >/dev/null
kill $SRV 2>/dev/null; ip addr del 169.254.169.254/32 dev lo 2>/dev/null || true
echo "결과: PASS $pass / FAIL $fail"; [ "$fail" = 0 ]
