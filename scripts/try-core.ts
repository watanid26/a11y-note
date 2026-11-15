// 개발용: 검사 코어를 한 페이지에 돌려 요약을 출력한다.  npx tsx scripts/try-core.ts <url>
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

async function main() {
  const url = process.argv[2] ?? "http://localhost:4400/";
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.addScriptTag({ content: readFileSync("public/a11y-core.js", "utf8") });
  const snap = await page.evaluate(() => (window as any).__a11yCore.run());
  for (const r of snap.results) console.log(r.outcome.padEnd(10), r.ruleId.padEnd(28), r.wcag.join(","), r.nodes.length);
  console.log("candidates", snap.candidates.map((c: any) => c.kind).join(","));
  console.log("applicable", JSON.stringify(snap.applicable));
  console.log("outline", JSON.stringify(snap.outline).slice(0, 400));
  console.log("sig", snap.templateSignature);
  await browser.close();
}
main();
