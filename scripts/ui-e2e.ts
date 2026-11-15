// 처음부터 끝까지 (새 화면): 주소 입력 → 자동 검사(진행 화면) → 결과 요약 → 문제 자세히·확인 → 보고서 → 다시 검사
import { chromium } from "playwright-core";

async function main() {
  const out = process.argv[2] ?? ".";
  const target = process.argv[3] ?? "http://localhost:4400/";
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3200/login?next=/app");
  await page.getByRole("button", { name: "개발용으로 들어가기" }).click();
  await page.waitForURL("**/app");
  await page.screenshot({ path: `${out}/e2e-0-start.png` });
  await page.getByLabel(/주소/).first().fill(target);
  await page.getByRole("button", { name: "검사 시작" }).click();
  await page.waitForURL("**/app/s/**");
  const t0 = Date.now();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/e2e-1-scanning.png` });
  await page.getByRole("link", { name: "보고서 받기" }).waitFor({ timeout: 300000 });
  console.log("scan done in", Math.round((Date.now() - t0) / 1000), "s");
  await page.screenshot({ path: `${out}/e2e-2-results.png`, fullPage: true });
  console.log("headline:", await page.locator("h1").first().textContent());
  const first = page.locator("#issues a").first();
  if (await first.count()) {
    await first.click();
    await page.waitForURL("**/f/**");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/e2e-3-issue.png`, fullPage: true });
    const url1 = page.url();
    await page.getByRole("button", { name: "문제 맞음" }).click();
    await page.waitForURL((u) => u.toString() !== url1, { timeout: 15000 });
    console.log("review moved to", page.url());
  }
  await page.goto(page.url().replace(/\/f\/.*$/, "") + "/report");
  await page.screenshot({ path: `${out}/e2e-4-report.png`, fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "내려받기" }).first().click()]);
  await dl.saveAs(`${out}/checklist.xlsx`);
  console.log("download ok");
  await page.getByRole("button", { name: "지금 다시 검사" }).click();
  await page.waitForURL((u) => !u.toString().endsWith("/report"), { timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log("rescan at", page.url());
  await page.goto("http://localhost:3200/app/history");
  await page.screenshot({ path: `${out}/e2e-5-history.png`, fullPage: true });
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
