// Shift+Tab 역방향 키보드 함정 (Codex 리뷰 7): 실제 브라우저에서 키를 눌러 확인
// 실행: npx tsx scripts/test-reverse-trap.ts  (테스트 사이트 localhost:4400 필요)
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400";
import { keyboardTrace, launch, newContext } from "../worker/browser";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

(async () => {
  const browser = await launch();
  const page = await (await newContext(browser, { blockWrites: true, scope: "http://localhost:4400/" })).newPage();
  await page.goto("http://localhost:4400/trap-back.html");
  const kb = await keyboardTrace(page);
  check("정방향(Tab)에는 함정 없음", kb.trappedAt === null, kb.trappedAt);
  check("역방향(Shift+Tab) 함정을 찾음", kb.reverseTrappedAt === "#q", kb.reverseTrappedAt);
  await page.goto("http://localhost:4400/help.html");
  const ok = await keyboardTrace(page);
  check("정상 화면은 양방향 모두 함정 없음", !ok.trappedAt && !ok.reverseTrappedAt, ok);
  await browser.close();
  process.exit();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
