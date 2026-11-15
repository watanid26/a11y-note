// 원격 브라우저(CDP) 안전장치 (Codex 보안 리스크 1)
//  - 운영에서는 명시적으로 켜지 않으면 거부
//  - 연결 시 격리 검사: 내부 주소에 닿으면 fail-closed, 닿지 않으면 통과
//  - 원격 모드 요청마다 우리 쪽 DNS 검사: 내부 IP·메타데이터·사설 대역·DNS 재바인딩(두 번째 조회가 내부 주소) 차단
//  - 정확한 origin 범위: 다른 하위 도메인으로의 이동 차단
// 실행 (테스트 사이트 localhost:4400 필요: 다른 터미널에서 `npm run fixture`):
//   npx tsx scripts/test-remote-isolation.ts
//   CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx scripts/test-remote-isolation.ts   (macOS)
//   CHROMIUM_PATH=/usr/bin/chromium npx tsx scripts/test-remote-isolation.ts                                                  (Linux)
// 브라우저는 CHROMIUM_PATH → macOS Chrome·Chromium → Linux Chromium·Chrome 순으로 찾고, 없으면 안내 후 종료 코드 2 로 멈춘다.
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400";
import { chromium } from "playwright-core";
import { IsolationFailed, newContext, openBrowser } from "../worker/browser";
import { setResolverForTest } from "../worker/egress-proxy";
import { inScope } from "../src/lib/sampling";
import { requireChromium } from "./lib/find-chromium";

const EXE = requireChromium();
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
const errOf = async (p: Promise<unknown>) => p.then(() => null, (e) => e as Error);

(async () => {
  // "원격" 역할: 관문 프록시 없이 띄운 브라우저 (격리 안 된 원격 서비스 흉내)
  const open = await chromium.launch({ executablePath: EXE, args: ["--remote-debugging-port=9334"] });
  const ws = "http://127.0.0.1:9334";
  // 격리된 원격 흉내: 모든 연결이 실패하는 브라우저
  const sealed = await chromium.launch({ executablePath: EXE, args: ["--remote-debugging-port=9335", "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>"] });

  const e1 = await errOf(openBrowser({ NODE_ENV: "production", BROWSER_WS_ENDPOINT: ws, CHROMIUM_PATH: EXE }));
  check("운영에서 BROWSER_REMOTE_ENABLED 없이 원격 브라우저 거부", Boolean(e1 && /기본으로 꺼져/.test(e1.message)), e1?.message);

  const e2 = await errOf(openBrowser({ BROWSER_WS_ENDPOINT: ws, REMOTE_ISOLATION_PROBES: "http://127.0.0.1:4400/" }));
  check("내부 주소에 닿는 원격 브라우저는 연결 거부 (fail-closed)", e2 instanceof IsolationFailed, e2?.message);

  const ok = await errOf(openBrowser({ NODE_ENV: "production", BROWSER_REMOTE_ENABLED: "1", BROWSER_WS_ENDPOINT: "http://127.0.0.1:9335", CHROMIUM_PATH: EXE, REMOTE_ISOLATION_PROBES: "http://127.0.0.1:4400/" }));
  check("내부 주소에 닿지 않는 원격 브라우저는 통과", ok === null, ok?.message);

  // 원격 모드 요청 검사 (격리 안 된 브라우저에 붙어서 우리 쪽 검사만으로 막히는지)
  const remote = await chromium.connectOverCDP(ws);
  const blocked: { url: string; code: string }[] = [];
  let flip = 0;
  setResolverForTest(async (host) => {
    if (host === "internal.test") return [{ address: "10.0.0.9", family: 4 }];
    if (host === "meta.test") return [{ address: "169.254.169.254", family: 4 }];
    if (host === "v6.test") return [{ address: "fd12::1", family: 6 }];
    if (host === "flip.test") return [{ address: flip++ === 0 ? "93.184.216.34" : "10.0.0.9", family: 4 }]; // 재바인딩
    return [{ address: "93.184.216.34", family: 4 }];
  });
  const ctx = await newContext(remote, { blockWrites: true, scope: "http://localhost:4400/", remote: true, onBlock: (url, code) => blocked.push({ url, code }) });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4400/help.html");
  await page.evaluate(async () => {
    const urls = [
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/x",
      "http://[::1]:4400/",
      "http://[fd00::1]/",
      "http://127.0.0.1:4400/",
      "http://internal.test/a.png",
      "http://meta.test/b.png",
      "http://v6.test/c.png",
      "http://flip.test/1.png",
      "http://flip.test/2.png",
    ];
    for (const u of urls) await fetch(u, { mode: "no-cors" }).catch(() => null);
  });
  const codes = (u: string) => blocked.filter((b) => b.url.startsWith(u)).map((b) => b.code);
  check("메타데이터 IP 직접 요청 차단", codes("http://169.254.169.254").length > 0, blocked);
  check("사설 IPv4·IPv6·루프백 직접 요청 차단", ["http://10.0.0.5", "http://[::1]", "http://[fd00::1]", "http://127.0.0.1"].every((u) => codes(u).length > 0), blocked);
  check("이름이 내부 IP 로 풀리는 주소 차단 (IPv4·메타데이터·IPv6 사설)", ["http://internal.test", "http://meta.test", "http://v6.test"].every((u) => codes(u).includes("E_BLOCKED_ADDRESS")), blocked);
  check("DNS 재바인딩: 첫 조회는 통과, 두 번째(내부 주소) 조회는 차단", codes("http://flip.test/1.png").length === 0 && codes("http://flip.test/2.png").includes("E_BLOCKED_ADDRESS"), blocked);

  // 정확한 origin 범위
  check("범위: 같은 origin·www·http→https 만 허용", inScope("https://localhost:4400/x", "http://localhost:4400/") && inScope("https://www.a.go.kr/", "https://a.go.kr/") && inScope("http://a.go.kr/", "http://www.a.go.kr/"), null);
  check("범위: 다른 하위 도메인·다른 포트·비슷한 이름은 범위 밖", !inScope("https://m.a.go.kr/", "https://a.go.kr/") && !inScope("https://a.go.kr:8443/", "https://a.go.kr/") && !inScope("https://a.go.kr.evil.com/", "https://a.go.kr/"), null);
  check("범위: 운영 설정으로 명시한 origin 만 추가", inScope("https://m.a.go.kr/", "https://a.go.kr/", { A11Y_SCOPE_EXTRA_ORIGINS: "https://m.a.go.kr" }) && !inScope("https://x.a.go.kr/", "https://a.go.kr/", { A11Y_SCOPE_EXTRA_ORIGINS: "https://m.a.go.kr" }), null);

  const sub = await page.goto("http://sub.localhost:4400/").then(() => page.url(), (e) => String(e).slice(0, 80));
  check("주 문서가 범위 밖 하위 도메인으로 이동하면 차단", !String(sub).startsWith("http://sub.localhost"), sub);

  await remote.close().catch(() => {});
  await open.close();
  await sealed.close();
  process.exit();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
