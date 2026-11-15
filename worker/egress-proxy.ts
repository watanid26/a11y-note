// 워커 전용 외부 접속 관문 (SSRF 방어 P0-1).
// - Chromium 은 모든 요청(페이지·이미지·fetch·WebSocket)을 이 로컬 프록시로만 보낸다.
// - 접속할 때마다 직접 DNS 를 조회하고, 조회한 IP 를 검사한 뒤 그 IP 로 바로 접속한다.
//   (조회와 접속이 같은 결과를 쓰므로 DNS 재바인딩으로 우회할 수 없다)
// - 크롤러의 HTML 받기(guardedGet)도 같은 조회 함수를 쓴다.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import type { LookupFunction } from "node:net";
import { EgressBlocked, checkUrl, devAllowed, isBlockedAddress } from "../src/lib/security/egress";

export interface BlockLog {
  at: string;
  target: string;
  code: string;
}
const blocked: BlockLog[] = [];
export function blockedLog(): BlockLog[] {
  return blocked.slice(-200);
}
function logBlock(target: string, code: string) {
  blocked.push({ at: new Date().toISOString(), target: target.replace(/\?.*$/, ""), code });
  if (blocked.length > 1000) blocked.splice(0, blocked.length - 1000);
}

// ── 응답 크기 한도 (GPT 리뷰: 브라우저 응답에도 본문 상한) ──
// 연결 하나당 받을 수 있는 바이트, 회차 전체에서 받을 수 있는 바이트. 넘으면 연결을 끊고 새 연결도 거부한다.
const CONN_BYTES = Number(process.env.PROXY_CONN_BYTES ?? 30 * 1024 * 1024);
const SCAN_BYTES = Number(process.env.PROXY_SCAN_BYTES ?? 500 * 1024 * 1024);
/** 회차(=프록시 하나)별 받은 양. 프록시를 회차마다 따로 띄우므로 동시에 도는 회차끼리 한도를 나눠 쓰지 않는다 (Codex 리뷰 4) */
interface Budget {
  received: number;
}
/** 받은 바이트를 세다가 한도를 넘으면 false */
function account(budget: Budget, conn: { received: number }, n: number): boolean {
  conn.received += n;
  budget.received += n;
  return conn.received <= CONN_BYTES && budget.received <= SCAN_BYTES;
}

/** DNS 조회 함수를 바꿔 끼울 수 있게 한다 (테스트에서 재바인딩 흉내용) */
let resolver: (host: string) => Promise<{ address: string; family: number }[]> = (host) => dns.promises.lookup(host, { all: true, verbatim: true });
export function setResolverForTest(fn: typeof resolver) {
  resolver = fn;
}

/** 이 호스트:포트에 접속해도 되는 IP 하나를 돌려준다. 조회 결과 중 하나라도 내부 주소면 거부 */
export async function resolveAllowed(host: string, port: string): Promise<{ address: string; family: number }> {
  const h = host.replace(/^\[|\]$/g, "");
  if (devAllowed(h, port)) {
    const r = await dns.promises.lookup(h, { all: true, verbatim: true });
    return r.find((a) => a.family === 4) ?? r[0];
  }
  if (port !== "80" && port !== "443") throw new EgressBlocked("E_BAD_PORT", `허용되지 않은 포트 ${port}`);
  const addrs = net.isIP(h) ? [{ address: h, family: net.isIP(h) }] : await resolver(h);
  if (!addrs.length) throw new EgressBlocked("E_DNS", "주소를 찾을 수 없습니다.");
  const bad = addrs.find((a) => isBlockedAddress(a.address));
  if (bad) throw new EgressBlocked("E_BLOCKED_ADDRESS", `내부 주소로 연결됩니다 (${h} → ${bad.address})`);
  return addrs[0];
}

/** http/https 모듈에 넣는 조회 함수: 검사한 IP 만 돌려준다 */
function guardedLookup(port: string): LookupFunction {
  // Node 20 은 연결 시 {all: true} 로 불러 배열 응답을 기대한다 (autoSelectFamily). 두 형식 모두 지원.
  return ((hostname: string, opts: { all?: boolean } | number | undefined, cb: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void) => {
    const all = typeof opts === "object" && opts !== null && opts.all;
    resolveAllowed(hostname, port).then(
      (a) => (all ? cb(null, [{ address: a.address, family: a.family }]) : cb(null, a.address, a.family)),
      (e) => {
        logBlock(`${hostname}:${port}`, (e as EgressBlocked).code ?? "E_DNS");
        cb(e, all ? [] : "", 0);
      },
    );
  }) as unknown as LookupFunction;
}

/** 로컬 프록시 시작. 반환값의 port 를 Chromium --proxy-server 에 넣는다 */
export interface EgressProxy {
  port: number;
  /** 이 프록시(회차)로 받은 바이트 */
  bytes: () => number;
  close: () => Promise<void>;
}

export async function startEgressProxy(): Promise<EgressProxy> {
  const budget: Budget = { received: 0 };
  const server = http.createServer((req, res) => {
    // 일반 http 요청 (절대 주소)
    let u: URL;
    try {
      u = checkUrl(req.url ?? "");
    } catch (e) {
      logBlock(req.url ?? "", (e as EgressBlocked).code ?? "E_BAD_URL");
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("a11ynote: blocked");
    }
    const port = u.port || "80";
    if (budget.received > SCAN_BYTES) {
      logBlock(u.toString(), "E_SCAN_BUDGET");
      res.writeHead(403);
      return res.end();
    }
    const up = http.request(
      { host: u.hostname, port, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host }, lookup: guardedLookup(port), timeout: 30_000 },
      (r) => {
        const declared = Number(r.headers["content-length"] ?? 0);
        if (declared > CONN_BYTES) {
          logBlock(u.toString(), "E_TOO_LARGE");
          r.destroy();
          res.writeHead(413);
          return res.end();
        }
        res.writeHead(r.statusCode ?? 502, r.headers);
        const conn = { received: 0 };
        r.on("data", (c: Buffer) => {
          if (!account(budget, conn, c.length)) {
            logBlock(u.toString(), "E_TOO_LARGE");
            r.destroy();
            res.destroy();
            return;
          }
          res.write(c);
        });
        r.on("end", () => res.end());
        r.on("error", () => res.destroy());
      },
    );
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(403);
      res.end();
    });
    up.on("timeout", () => up.destroy());
    req.pipe(up);
  });

  // https·wss 터널
  server.on("connect", (req, client: net.Socket, head: Buffer) => {
    const m = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? "");
    if (!m) return client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    const [, host, port] = m;
    if (budget.received > SCAN_BYTES) {
      logBlock(`${host}:${port}`, "E_SCAN_BUDGET");
      return client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
    resolveAllowed(host, port).then(
      (a) => {
        const upstream = net.connect({ host: a.address, port: Number(port) }, () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream.write(head);
          const conn = { received: 0 };
          upstream.on("data", (c: Buffer) => {
            if (!account(budget, conn, c.length)) {
              logBlock(`${host}:${port}`, "E_TOO_LARGE");
              upstream.destroy();
              client.destroy();
              return;
            }
            if (!client.write(c)) upstream.pause();
          });
          client.on("drain", () => upstream.resume());
          client.pipe(upstream);
        });
        upstream.setTimeout(60_000, () => upstream.destroy());
        upstream.on("error", () => client.destroy());
        client.on("error", () => upstream.destroy());
      },
      (e) => {
        logBlock(`${host}:${port}`, (e as EgressBlocked).code ?? "E_DNS");
        client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      },
    );
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return { port, bytes: () => budget.received, close: () => new Promise((r) => server.close(() => r())) };
}

/**
 * 크롤러용 HTML 받기: 리다이렉트를 직접 따라가며 매 단계 주소·IP 를 검사한다. 본문은 maxBytes 까지만.
 * 실패·차단 시 null.
 */
export async function guardedGet(raw: string, opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}): Promise<{ url: string; type: string; body: string } | null> {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    let u: URL;
    try {
      u = checkUrl(current);
    } catch (e) {
      logBlock(current, (e as EgressBlocked).code);
      return null;
    }
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const mod = u.protocol === "https:" ? https : http;
    const res = await new Promise<http.IncomingMessage | null>((resolve) => {
      const req = mod.request(u, { method: "GET", headers: { "user-agent": "a11ynote-checker", accept: "text/html,application/xml" }, lookup: guardedLookup(port), timeout: opts.timeoutMs ?? 10_000 }, resolve);
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
    if (!res) return null;
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, u).toString();
      continue;
    }
    if (status < 200 || status >= 300) {
      res.resume();
      return null;
    }
    const type = String(res.headers["content-type"] ?? "");
    const chunks: Buffer[] = [];
    let size = 0;
    const ok = await new Promise<boolean>((resolve) => {
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          res.destroy();
          resolve(false);
        } else chunks.push(c);
      });
      res.on("end", () => resolve(true));
      res.on("error", () => resolve(false));
    });
    if (!ok) return null;
    return { url: u.toString(), type, body: Buffer.concat(chunks).toString("utf8") };
  }
  return null;
}
