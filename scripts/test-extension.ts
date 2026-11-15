// 확장 동작 확인: 실제 크롬에 확장을 올려 현재 화면 검사 → 흐름 녹화(위험 버튼 차단 포함) → 서버 업로드까지.
import { chromium } from "playwright-core";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { extVariant } from "./ext-variant";
import { requireChromium } from "./lib/find-chromium";

const CHROMIUM = requireChromium();

async function main() {
  const token = process.argv[2];
  const flowId = process.argv[3];
  // 테스트 사이트 한 곳·디버거·다운로드만 허용한 상태 (P0-5 이후 배포본은 모두 선택 권한)
  const ext = extVariant("granted-capture");
  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), "a11yext-")), {
    executablePath: CHROMIUM,
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    viewport: { width: 1280, height: 900 },
  });
  let sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js"));
  while (!sw) {
    const w = await ctx.waitForEvent("serviceworker");
    if (w.url().endsWith("/background.js")) sw = w;
  }
  console.log("sw", sw.url(), await sw.evaluate(() => typeof chrome?.storage));
  console.log("extension loaded");
  // 기존 흐름 확인용: 올리기 전 확인 끔 (확인 흐름은 test-extension-privacy.ts 에서)
  await sw.evaluate(async ([t]) => chrome.storage.local.set({ server: "http://localhost:3200", token: t, keyboard: true, offline: false, review: false }), [token]);

  const page = await ctx.newPage();
  await page.goto("http://localhost:4400/login.html");
  page.on("dialog", (d) => { console.log("!! dialog appeared:", d.message()); d.dismiss(); });

  // 1) 현재 화면 검사
  const r1 = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost:4400/*" });
    return (globalThis as any).__a11yExt.scanTab(tab.id, { label: "로그인 화면 (확장)" });
  });
  console.log("scanTab:", JSON.stringify(r1));

  // 2) 예약 흐름 녹화: 시작 → '다음' 클릭(화면 바뀜) → '예약 확정'(위험 버튼) 시도 → 끝
  await page.goto("http://localhost:4400/reserve.html");
  await sw.evaluate(async ([fid]) => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost:4400/*" });
    await (globalThis as any).__a11yExt.startRecording(tab.id, { id: fid, name: "예약 단계별 화면", stopBefore: "예약 확정·결제 버튼" });
  }, [flowId]);
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: "예약 확정" }).click();
  await page.waitForTimeout(1500);
  const banner = await page.locator("#__a11y_rec_banner").textContent().catch(() => null);
  console.log("blocked banner:", banner);
  await sw.evaluate(async () => {
    await (globalThis as any).__a11yExt.stopRecording(true);
  });
  const st = await sw.evaluate(() => ({ log: (globalThis as any).__a11yExt.state.log.map((l: any) => `${l.kind}: ${l.text}`), scanId: (globalThis as any).__a11yExt.state.scanId }));
  console.log(st.log.reverse().join("\n"));
  console.log("scanId", st.scanId);

  // 3) 인터넷 안 되는 PC 모드: 파일로 보관
  await sw.evaluate(async () => chrome.storage.local.set({ offline: true }));
  const r3 = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost:4400/*" });
    return (globalThis as any).__a11yExt.scanTab(tab.id, { label: "오프라인 저장 테스트", keyboard: false });
  });
  console.log("offline:", JSON.stringify(r3));
  await ctx.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
