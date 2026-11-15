#!/usr/bin/env bash
# 운영 VM 에서 검사 워커 실행 (P0-2).
# 1) 워커 전용 docker 네트워크 (IPv6 끔) 2) 네트워크 격리 규칙 3) 비루트·자원 한도로 컨테이너 실행
#   sudo DB_HOST=<DB IP 또는 비움> ./deploy/run-worker.sh
# 워커 환경변수 파일(deploy/worker.env)에는 아래만 넣는다:
#   DATABASE_URL  ← a11y_worker 역할 계정 (drizzle/0002_worker_role.sql)
#   WORKER_APP_URL, WORKER_SHARED_SECRET  ← 캡처 저장은 웹 앱 내부 경로로 (저장소 서버 키는 넣지 않음)
#   ANTHROPIC_API_KEY (AI 사용 시), 기능 플래그
#   ※ 로그인·결제·웹 앱 비밀키는 넣지 않는다
# 정상 종료: docker stop 은 SIGTERM → 워커가 새 회차를 받지 않고 진행 중 회차를 WORKER_STOP_GRACE_MS(기본 50초) 기다린다.
#   --stop-timeout(70초)은 그보다 길어야 한다. 생존 확인은 scripts/worker-health.mjs (docker HEALTHCHECK, 다른 실행 환경도 같은 명령).
set -euo pipefail
cd "$(dirname "$0")/.."
SUBNET=172.30.0.0/24
docker network inspect a11y-worker >/dev/null 2>&1 || docker network create --subnet "$SUBNET" --ipv6=false a11y-worker
SUBNET=$SUBNET DB_HOST="${DB_HOST:-}" DNS_HOST="${DNS_HOST:-}" ./deploy/worker-firewall.sh docker apply
docker build -f Dockerfile.worker -t a11ynote-worker .
docker rm -f a11ynote-worker 2>/dev/null || true
docker run -d --name a11ynote-worker --restart unless-stopped \
  --network a11y-worker \
  --env-file deploy/worker.env \
  --user 10001 \
  --cap-drop ALL --security-opt no-new-privileges \
  --read-only --tmpfs /tmp:size=512m --tmpfs /home/a11yworker:size=256m \
  --cpus 2 --memory 2g --memory-swap 2g --pids-limit 512 \
  --shm-size 256m \
  -e REQUIRE_ISOLATION=1 \
  -e WORKER_ID="${WORKER_ID:-$(hostname)-1}" \
  --stop-timeout 70 \
  --health-cmd "node scripts/worker-health.mjs" --health-interval 30s --health-timeout 5s --health-retries 3 --health-start-period 60s \
  a11ynote-worker
# ── 배포 게이트: 격리가 실제로 작동하는지 컨테이너 안에서 확인, 하나라도 뚫리면 워커를 멈춘다 ──
sleep 3
VM_IP=$(hostname -I | awk '{print $1}')
FAILED=0
for t in 169.254.169.254 10.0.0.1 172.16.0.1 192.168.0.1 "$VM_IP"; do
  for port in 80 443 22; do
    out=$(docker exec a11ynote-worker node scripts/net-probe.mjs "$t" "$port" 2>&1 | tail -1)
    if echo "$out" | grep -q '"socket":"connected"\|"fetched":"status\|"chromium":"status'; then
      echo "격리 실패: $t:$port $out"; FAILED=1
    fi
  done
done
udp=$(docker exec a11ynote-worker node -e 'const s=require("dgram").createSocket("udp4");s.send(Buffer.from("x"),3478,"1.1.1.1",e=>{console.log(e?"blocked":"sent");s.close()})' 2>&1 | tail -1)
[ "$udp" = "sent" ] && { echo "격리 실패: 외부 UDP 가 나감"; FAILED=1; }
if [ "$FAILED" = 1 ]; then
  docker stop a11ynote-worker >/dev/null
  echo "격리 확인 실패 — 워커를 멈췄습니다. deploy/worker-firewall.sh 적용 상태를 확인하세요."; exit 1
fi
date -u +"%Y-%m-%dT%H:%M:%SZ 격리 확인 통과 (내부·메타데이터·VM 자신·UDP 차단)" | tee -a deploy/isolation-checks.log
echo "워커 실행됨."
