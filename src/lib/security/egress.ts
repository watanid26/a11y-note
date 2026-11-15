// 서버가 대신 열어 주는 주소(점검 대상)가 내부망·클라우드 내부 주소인지 판별한다 (SSRF 방어, P0-1).
// 순수 함수만 둔다 — 웹(프로젝트 생성 시 안내)과 워커(실제 차단)가 함께 쓴다.
// 실제 차단은 워커의 egress-proxy 가 "DNS 조회 결과 IP" 로 한다. 여기 checkUrl 은 1차 걸러내기.

import { isIP } from "node:net";

export class EgressBlocked extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443"]);
const BLOCKED_NAME = /(^|\.)(localhost|local|internal|lan|intranet|corp|home|home\.arpa|localdomain)$/i;

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

// IANA IPv4 특수 목적 주소 레지스트리(2026-10 확인)의 "전역 도달 불가" 대역 전부 + 웹 콘텐츠가 없는 인프라 대역
export const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // 이 네트워크
  ["10.0.0.0", 8], // 사설
  ["100.64.0.0", 10], // 통신사 공용 NAT
  ["127.0.0.0", 8], // 루프백
  ["169.254.0.0", 16], // 링크로컬 (클라우드 메타데이터 169.254.169.254 포함)
  ["172.16.0.0", 12], // 사설
  ["192.0.0.0", 24], // IETF 예약
  ["192.0.2.0", 24], // 문서용
  ["192.31.196.0", 24], // AS112 (DNS 인프라, 웹 없음)
  ["192.52.193.0", 24], // AMT (멀티캐스트 터널)
  ["192.88.99.0", 24], // 6to4 릴레이 (폐지)
  ["192.175.48.0", 24], // AS112 직접 위임
  ["192.168.0.0", 16], // 사설
  ["198.18.0.0", 15], // 벤치마크
  ["198.51.100.0", 24], // 문서용
  ["203.0.113.0", 24], // 문서용
  ["224.0.0.0", 4], // 멀티캐스트
  ["240.0.0.0", 4], // 예약 + 브로드캐스트
];

function v4Blocked(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(base) & mask);
  });
}

/** IPv6 를 8개 16비트 숫자로 펼친다 (끝부분 IPv4 표기 포함) */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const v4tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4tail) {
    const n = v4ToInt(v4tail[1]);
    s = s.slice(0, -v4tail[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => parseInt(g || "0", 16));
  return out.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff) ? null : out;
}

function embeddedV4(g: number[], from: number): string {
  return [g[from] >> 8, g[from] & 0xff, g[from + 1] >> 8, g[from + 1] & 0xff].join(".");
}

function v6Blocked(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return true; // 해석 못 하면 차단
  // IPv4 매핑 ::ffff:a.b.c.d, IPv4 호환 ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true; // :: , ::1
    return v4Blocked(embeddedV4(g, 6));
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4Blocked(embeddedV4(g, 6)); // NAT64
  if (g[0] === 0x2002) return v4Blocked(embeddedV4(g, 1)); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // 문서용
  // 전역 유니캐스트(2000::/3)만 허용 → ULA fc00::/7, 링크로컬 fe80::/10, 멀티캐스트 ff00::/8 등 전부 차단
  return (g[0] & 0xe000) !== 0x2000;
}

/** IP 주소가 외부(공인) 주소가 아니면 true */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip.replace(/^\[|\]$/g, ""));
  const clean = ip.replace(/^\[|\]$/g, "");
  if (v === 4) return v4Blocked(clean);
  if (v === 6) return v6Blocked(clean);
  return true;
}

/**
 * 개발용 허용 목록 (예: 테스트 사이트 localhost:4400). 운영(NODE_ENV=production)에서는 무시한다.
 * 값: "host:port,host:port"
 */
export function devAllowed(host: string, port: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  const list = (env.EGRESS_ALLOW_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(`${host.toLowerCase()}:${port}`);
}

function defaultPort(u: URL): string {
  return u.port || (u.protocol === "https:" ? "443" : "80");
}

/**
 * 주소 문자열 1차 점검. 통과하면 URL 을 돌려주고, 아니면 EgressBlocked 예외.
 * (호스트 이름의 실제 IP 확인은 워커 프록시가 접속 시점에 한다)
 */
export function checkUrl(raw: string, env: Record<string, string | undefined> = process.env): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new EgressBlocked("E_BAD_URL", "주소 형식이 올바르지 않습니다.");
  }
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (devAllowed(host, defaultPort(u), env)) return u;
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new EgressBlocked("E_BAD_SCHEME", "http 또는 https 주소만 점검할 수 있습니다.");
  if (u.username || u.password) throw new EgressBlocked("E_USERINFO", "주소에 아이디·비밀번호를 넣을 수 없습니다.");
  if (!ALLOWED_PORTS.has(u.port)) throw new EgressBlocked("E_BAD_PORT", "기본 포트(80, 443)만 점검할 수 있습니다.");
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new EgressBlocked("E_BLOCKED_ADDRESS", "내부망·예약 주소는 서버에서 점검할 수 없습니다. 크롬 확장으로 점검해 주세요.");
    return u;
  }
  if (!host.includes(".") || BLOCKED_NAME.test(host)) throw new EgressBlocked("E_BLOCKED_ADDRESS", "내부망 주소로 보이는 이름은 서버에서 점검할 수 없습니다. 크롬 확장으로 점검해 주세요.");
  return u;
}
