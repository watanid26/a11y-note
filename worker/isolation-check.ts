// 워커 시작 시 네트워크 격리 자체 점검 (GPT 리뷰: 배포 게이트 우회 실행 경로 차단).
// 운영(NODE_ENV=production)에서는 이 점검이 통과해야만 작업을 시작한다. 배포 스크립트를 거치지 않고 실행해도 마찬가지.
// 프록시를 거치지 않는 직접 소켓으로 클라우드 메타데이터·기본 게이트웨이(VM 자신)·사설망에 접속을 시도하고,
// 하나라도 연결되면 실패. (방화벽이 있으면 즉시 거부되거나 응답이 없다)
import { readFileSync } from "node:fs";
import net from "node:net";

function defaultGateway(): string | null {
  try {
    for (const line of readFileSync("/proc/net/route", "utf8").split("\n").slice(1)) {
      const [, dest, gw] = line.trim().split(/\s+/);
      if (dest === "00000000" && gw && gw !== "00000000") {
        const n = parseInt(gw, 16);
        return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255].join(".");
      }
    }
  } catch {
    /* 리눅스가 아니면 생략 */
  }
  return null;
}

function tryConnect(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, timeout: timeoutMs }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

export async function isolationCheck(): Promise<{ ok: boolean; reachable: string[] }> {
  const gw = defaultGateway();
  const targets: [string, number][] = [
    ["169.254.169.254", 80],
    ["169.254.169.254", 443],
    ["10.0.0.1", 80],
    ["172.16.0.1", 80],
    ["192.168.0.1", 80],
    ...(gw ? ([22, 80, 443, 5432].map((p) => [gw, p]) as [string, number][]) : []),
  ];
  const reachable: string[] = [];
  await Promise.all(targets.map(async ([h, p]) => ((await tryConnect(h, p)) ? reachable.push(`${h}:${p}`) : null)));
  return { ok: reachable.length === 0, reachable };
}
