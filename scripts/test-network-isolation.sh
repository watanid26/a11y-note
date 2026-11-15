#!/usr/bin/env bash
# P0-2 네트워크 계층 검증 (이 PC 에서, root 필요).
# 내부망 흉내 주소(10.99.0.1, 169.254.169.254)를 루프백에 붙이고 내부 서버를 띄운 뒤,
#  - 격리 규칙을 적용한 사용자 a11yworker 로는 소켓·fetch·Chromium(프록시 없이) 모두 실패해야 하고
#  - 규칙이 없는 root 로는 성공해야 한다 (대조군: 규칙이 실제 원인임을 증명)
set -uo pipefail
cd "$(dirname "$0")/.."
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1 :: $2"; fail=$((fail+1)); }

ip addr add 10.99.0.1/32 dev lo 2>/dev/null || true
ip addr add 169.254.169.254/32 dev lo 2>/dev/null || true
node -e 'require("http").createServer((q,r)=>{console.log("HIT",q.url);r.end("SECRET")}).listen(80,"0.0.0.0")' > /tmp/internal-hits.log 2>&1 &
SRV=$!
sleep 1
./deploy/worker-firewall.sh local apply >/dev/null
chmod o+rx /root 2>/dev/null || true

for target in 10.99.0.1 169.254.169.254; do
  out=$(su a11yworker -s /bin/bash -c "HOME=/tmp node scripts/net-probe.mjs $target 80" 2>&1 | tail -1)
  if echo "$out" | grep -q '"socket":"error' && echo "$out" | grep -q '"fetched":"error' && ! echo "$out" | grep -q '"chromium":"status'; then
    ok "격리 사용자: $target 직접 소켓·fetch·Chromium(프록시 없이) 모두 차단  $out"
  else bad "격리 사용자: $target 차단" "$out"; fi
  ctl=$(node scripts/net-probe.mjs $target 80 2>&1 | tail -1)
  if echo "$ctl" | grep -q '"socket":"connected'; then ok "대조군 root: $target 접속됨 (규칙이 차단 원인임을 확인)"; else bad "대조군 root: $target" "$ctl"; fi
done

udp=$(su a11yworker -s /bin/bash -c "HOME=/tmp node -e 'const s=require(\"dgram\").createSocket(\"udp4\");s.send(Buffer.from(\"x\"),3478,\"1.1.1.1\",e=>{console.log(e?\"error:\"+e.code:\"sent\");s.close()})'" 2>&1 | tail -1)
if echo "$udp" | grep -q error; then ok "격리 사용자: 외부 UDP(STUN 3478) 차단  $udp"; else bad "격리 사용자: UDP 차단" "$udp"; fi

./deploy/worker-firewall.sh local remove >/dev/null
kill $SRV 2>/dev/null
hits=$(grep -c "^HIT" /tmp/internal-hits.log || true)
echo "  내부 서버 접속 기록: ${hits}건 (대조군 root 접속만 있어야 함: 4건 이하)"
ip addr del 10.99.0.1/32 dev lo 2>/dev/null || true
ip addr del 169.254.169.254/32 dev lo 2>/dev/null || true
echo "결과: PASS $pass / FAIL $fail"
[ "$fail" = 0 ]
