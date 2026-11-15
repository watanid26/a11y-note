// P0-1 통합 테스트: 실제 Chromium·크롤러로 내부 주소 접근을 시도하고, 내부 서버 접속 기록이 0건인지 확인한다.
//   내부 서버  127.0.0.1:80   (기본 포트라 포트 제한으로는 못 막음 → IP 검사로 막혀야 함)
//   공격 페이지 localhost:4403 (개발 허용 목록에 넣은 "외부 사이트" 역할)
// 실행: npx tsx scripts/test-ssrf.ts   (80 포트를 열어야 하므로 root 권한 필요)
import http from "node:http";
import { setResolverForTest, guardedGet, blockedLog } from "../worker/egress-proxy";
import { launch, newContext } from "../worker/browser";

process.env.EGRESS_ALLOW_HOSTS = "localhost:4403";

const hits: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

async function main() {
  const internal = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.end("SECRET");
  });
  await new Promise<void>((r) => internal.listen(80, "127.0.0.1", r));

  const attack = http.createServer((req, res) => {
    if (req.url === "/redir") {
      res.writeHead(302, { location: "http://127.0.0.1/from-redirect" });
      return res.end();
    }
    if (req.url === "/redir-meta") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      return res.end();
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html><body><h1>attack</h1>
      <img src="http://127.0.0.1/img">
      <img src="http://[::1]/img6">
      <img src="http://0x7f000001/imghex">
      <iframe src="http://127.0.0.1/iframe"></iframe>
      <link rel="stylesheet" href="http://localhost/css">
      <script>
        fetch("http://127.0.0.1/fetch").catch(()=>{});
        fetch("http://rebind.test/fetch-rebind").catch(()=>{});
        try { new WebSocket("ws://127.0.0.1/ws"); } catch (e) {}
        navigator.sendBeacon && navigator.sendBeacon("http://127.0.0.1/beacon", "x");
      </script></body></html>`);
  });
  await new Promise<void>((r) => attack.listen(4403, "127.0.0.1", r));

  // DNS 재바인딩 흉내: rebind.test 는 첫 조회에 공인 IP, 이후 127.0.0.1
  let calls = 0;
  setResolverForTest(async (host) => {
    if (host === "rebind.test") return calls++ === 0 ? [{ address: "1.1.1.1", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
    if (host === "mixed.test") return [{ address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 }];
    if (host === "inside.test") return [{ address: "127.0.0.1", family: 4 }];
    return [{ address: "1.1.1.1", family: 4 }];
  });

  // 1) 크롤러 경로
  check("크롤러: 내부 IP 직접", (await guardedGet("http://127.0.0.1/crawl")) === null);
  check("크롤러: 공개 주소 → 302 → 내부 IP", (await guardedGet("http://localhost:4403/redir")) === null);
  check("크롤러: 공개 주소 → 302 → 메타데이터", (await guardedGet("http://localhost:4403/redir-meta")) === null);
  check("크롤러: 이름이 내부 IP 로 풀림", (await guardedGet("http://inside.test/")) === null);
  check("크롤러: 조회 결과에 내부 IP 가 섞임", (await guardedGet("http://mixed.test/")) === null);
  // 재바인딩: 같은 이름을 두 번 요청 — 첫 조회는 공인 IP(그 IP 로만 접속), 두 번째 조회는 127.0.0.1 → 차단돼야 함
  calls = 0;
  await guardedGet("http://rebind.test/first", { timeoutMs: 3000 });
  const second = await guardedGet("http://rebind.test/second", { timeoutMs: 3000 });
  check("재바인딩: 두 번째 요청은 다시 조회 → 127.0.0.1 → 차단", second === null && blockedLog().some((l) => l.target.startsWith("rebind.test")));
  const ok = await guardedGet("http://localhost:4403/");
  check("크롤러: 허용된 공격 페이지 자체는 받아짐 (테스트 전제)", ok !== null && ok.body.includes("attack"));

  // 2) 브라우저 경로
  const browser = await launch();
  const routeBlocks: string[] = [];
  const ctx = await newContext(browser, { blockWrites: true, onBlock: (url) => routeBlocks.push(url) });
  const page = await ctx.newPage();
  for (const u of ["http://127.0.0.1/direct", "http://localhost/direct-name", "http://[::1]/direct6", "http://inside.test/direct-dns"]) {
    await page.goto(u, { timeout: 8000 }).catch(() => null);
  }
  await page.goto("http://localhost:4403/redir", { timeout: 8000 }).catch(() => null);
  calls = 0;
  await page.goto("http://localhost:4403/", { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(3000);
  const attackLoaded = (await page.content()).includes("attack");
  check("브라우저: 허용된 공격 페이지는 열림 (테스트 전제)", attackLoaded);
  await browser.close();

  // 3) 프록시가 죽었을 때 실패해야 함 (fail-closed): 프록시 주소를 닫힌 포트로 지정한 Chromium 은 어디에도 접속하지 못함
  const { chromium } = await import("playwright-core");
  const dead = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"] });
  const dp = await dead.newPage();
  const r1 = await dp.goto("http://localhost:4403/", { timeout: 6000 }).then(() => "opened", (e) => String(e.message).split("\n")[0]);
  const r2 = await dp.goto("http://127.0.0.1/dead-proxy", { timeout: 6000 }).then(() => "opened", (e) => String(e.message).split("\n")[0]);
  await dead.close();
  check("프록시 장애 시 허용 사이트도 열리지 않음 (우회 접속 없음)", r1 !== "opened", r1);
  check("프록시 장애 시 내부 주소 열리지 않음", r2 !== "opened", r2);

  await new Promise((r) => setTimeout(r, 500));
  check("내부 서버 접속 기록 0건 (직접·이름·IPv6·DNS·리다이렉트·img·iframe·css·fetch·재바인딩·WebSocket·beacon·프록시 장애)", hits.length === 0, hits);
  const log = blockedLog();
  console.log(`  차단 기록 ${log.length}건:`, [...new Set(log.map((l) => `${l.code} ${l.target}`))].slice(0, 30));
  check("차단 기록이 남음", log.length >= 5, log.length);
  const targets = log.map((l) => l.target).join(" ");
  check("리다이렉트 목적지가 실제로 차단됨 (공격 페이지까지는 도달)", targets.includes("127.0.0.1/from-redirect") && targets.includes("169.254.169.254"), targets);
  // 하위 요청은 이제 브라우저 쪽 1차 검사(주소 문자열)에서 먼저 막히고, 통과한 것은 프록시가 다시 막는다 (두 겹)
  const both = `${targets} ${routeBlocks.join(" ")}`;
  check("페이지 안 하위 요청(img·fetch)이 실제로 차단됨 (브라우저 1차 검사 또는 프록시)", both.includes("127.0.0.1/img") && both.includes("127.0.0.1/fetch"), both);


  internal.close();
  attack.close();
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
