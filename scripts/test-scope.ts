// 검사 범위 밖으로 넘어간 화면 (Codex 리뷰 3·9): 서버 리다이렉트·자바스크립트 이동 모두 이 사이트 결과로 쓰지 않는다
// 실행: npx tsx scripts/test-scope.ts  (테스트 사이트 localhost:4400 필요)
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400,127.0.0.1:4400";
import { OffScope, assertInScope, launch, newContext } from "../worker/browser";
import { inScope } from "../src/lib/sampling";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

(async () => {
  check("www 유무는 같은 범위, 다른 하위 도메인은 범위 밖 (정확한 origin)", inScope("https://www.a.go.kr/x", "https://a.go.kr/") && !inScope("https://m.a.go.kr/", "https://www.a.go.kr/"), null);
  check("다른 기관·로그인 대행 주소는 범위 밖", !inScope("https://sso.other.kr/login", "https://a.go.kr/") && !inScope("https://a.go.kr.evil.com/", "https://a.go.kr/"), null);
  const base = "http://localhost:4400/";
  const browser = await launch();
  const ctx = await newContext(browser, { blockWrites: true, scope: base });
  const page = await ctx.newPage();

  await page.goto("http://localhost:4400/help.html");
  let ok = true;
  try {
    assertInScope(page, base);
  } catch {
    ok = false;
  }
  check("같은 사이트 화면은 통과", ok, page.url());

  let err: unknown = null;
  try {
    await page.goto("http://localhost:4400/go-out");
    assertInScope(page, base);
  } catch (e) {
    err = e;
  }
  check("서버 리다이렉트로 다른 사이트에 도착하면 범위 밖으로 처리", err instanceof OffScope || /ERR_BLOCKED_BY_CLIENT/.test(String(err)), [String(err), page.url()]);

  await page.goto("http://localhost:4400/js-out.html");
  await page.waitForTimeout(800);
  let jsErr: unknown = null;
  try {
    assertInScope(page, base);
  } catch (e) {
    jsErr = e;
  }
  check("자바스크립트로 다른 사이트로 넘어가는 이동은 막히고, 그 화면은 범위 밖으로 처리", !page.url().includes("127.0.0.1") && jsErr instanceof OffScope, page.url());

  await browser.close();
  process.exit();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
