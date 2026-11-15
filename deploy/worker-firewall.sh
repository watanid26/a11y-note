#!/usr/bin/env bash
# 검사 워커 네트워크 격리 (P0-2). 앱 계층 SSRF 방어(egress-proxy)가 뚫려도 내부망·메타데이터에 닿지 못하게 한다.
#
# 사용:
#   docker 모드 (운영 VM):  sudo SUBNET=172.30.0.0/24 DB_HOST=<DB IP> ./deploy/worker-firewall.sh docker apply
#   local 모드 (검증용):     sudo ./deploy/worker-firewall.sh local apply     (사용자 a11yworker 의 나가는 연결 제한)
#   해제:                    ... <mode> remove
#
# 규칙 요약
#   - 사설·루프백(docker 모드)·링크로컬(메타데이터)·통신사 NAT·예약·멀티캐스트 대역으로 나가는 연결 차단
#   - 허용: TCP 80·443(외부), DB 포트(DB_HOST 지정 시 그 주소만), DNS(53, 컨테이너 기본 resolver)
#   - 그 밖의 TCP 포트·UDP 전부 차단 (QUIC·WebRTC 포함)
#   - IPv6 는 같은 원칙으로 ip6tables 에 적용 (전역 유니캐스트 2000::/3 의 80·443 만)
set -euo pipefail
MODE="${1:-}"; ACTION="${2:-}"
CHAIN=A11Y_WORKER_EGRESS
V4_BLOCK="0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.88.99.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4"
DB_PORT="${DB_PORT:-5432}"

build_chain() {
  local ipt=$1
  $ipt -N $CHAIN 2>/dev/null || $ipt -F $CHAIN
  $ipt -A $CHAIN -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  if [ "$ipt" = iptables ]; then
    [ "$MODE" = local ] && $ipt -A $CHAIN -d 127.0.0.0/8 -j RETURN   # local 모드: 같은 PC 의 프록시·DB 접속 허용
    [ -n "${DB_HOST:-}" ] && $ipt -A $CHAIN -p tcp -d "$DB_HOST" --dport "$DB_PORT" -j RETURN
    [ -n "${DNS_HOST:-}" ] && $ipt -A $CHAIN -p udp -d "$DNS_HOST" --dport 53 -j RETURN
    for n in $V4_BLOCK; do $ipt -A $CHAIN -d "$n" -j REJECT; done
  else
    [ "$MODE" = local ] && $ipt -A $CHAIN -d ::1/128 -j RETURN
    $ipt -A $CHAIN ! -d 2000::/3 -j REJECT
    $ipt -A $CHAIN -d 2001:db8::/32 -j REJECT
    $ipt -A $CHAIN -d 2001::/32 -j REJECT
    $ipt -A $CHAIN -d 2002::/16 -j REJECT
  fi
  $ipt -A $CHAIN -p tcp -m multiport --dports 80,443 -j RETURN
  [ -z "${DB_HOST:-}" ] && $ipt -A $CHAIN -p tcp --dport "$DB_PORT" -j RETURN   # DB 주소를 모르면 포트만 허용 (외부 관리형 DB)
  $ipt -A $CHAIN -j REJECT
}

hook() {
  local ipt=$1 op=$2
  if [ "$MODE" = docker ]; then
    : "${SUBNET:?SUBNET (워커 docker 네트워크 대역) 필요}"
    if [ "$ipt" = iptables ]; then $ipt $op DOCKER-USER -s "$SUBNET" -j $CHAIN; fi
  else
    id a11yworker >/dev/null 2>&1 || useradd -r -M -s /usr/sbin/nologin a11yworker
    $ipt $op OUTPUT -m owner --uid-owner a11yworker -j $CHAIN
  fi
}

case "$ACTION" in
  apply)
    for ipt in iptables ip6tables; do build_chain $ipt; hook $ipt -C 2>/dev/null || hook $ipt -I; done
    echo "적용 완료 ($MODE)";;
  remove)
    for ipt in iptables ip6tables; do while hook $ipt -D 2>/dev/null; do :; done; $ipt -F $CHAIN 2>/dev/null || true; $ipt -X $CHAIN 2>/dev/null || true; done
    echo "해제 완료 ($MODE)";;
  *) echo "사용: $0 docker|local apply|remove"; exit 1;;
esac
