// 확장 자동 검사 처음부터 끝까지: 확장을 올린 크롬 → 로그인 → 주소 입력 → (자동 연결) → 확장이 화면을 돌며 검사 → 결과 화면.
import { chromium } from "playwright-core";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { requireChromium } from "./lib/find-chromium";

const CHROMIUM = requireChromium();

async function main() {
  const out = process.argv[2] ?? ".";
  const target = process.argv[3] ?? "http://localhost:4400/";
  const ext = path.resolve("extension");
  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), "a11yauto-")), {
    executablePath: CHROMIUM,
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("[page]", m.text().slice(0, 200)));
  await page.goto("http://localhost:3200/login?next=/app");
  await page.getByRole("button", { name: "개발용으로 들어가기" }).click();
  await page.waitForURL("**/app");
  await page.getByText("검사는 이 크롬의 새 창에서 진행돼요").waitFor({ timeout: 10000 });
  console.log("PASS 시작 화면이 확장을 알아봄");
  await page.screenshot({ path: `${out}/auto-0-start.png` });
  await page.getByLabel("사이트 주소").fill(target);
  await page.getByRole("button", { name: "검사 시작" }).click();
  await page.waitForURL("**/app/s/**");
  const t0 = Date.now();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${out}/auto-1-scanning.png` });
  console.log("windows/pages open:", ctx.pages().map((p) => p.url()).join(" | "));
  await page.getByRole("link", { name: "보고서 받기" }).waitFor({ timeout: 300000 });
  console.log("PASS 확장 검사 완료", Math.round((Date.now() - t0) / 1000), "s");
  console.log("headline:", await page.locator("h1").first().textContent());
  await page.screenshot({ path: `${out}/auto-2-results.png`, fullPage: true });
  const first = page.locator("#issues a").first();
  await first.click();
  await page.waitForURL("**/f/**");
  await page.waitForTimeout(1500);
  const img = page.locator("section[aria-label='화면 캡처'] img");
  const ok = (await img.count()) ? await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0) : "no-box";
  console.log("캡처 이미지:", ok);
  await page.screenshot({ path: `${out}/auto-3-issue.png`, fullPage: true });
  await ctx.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
