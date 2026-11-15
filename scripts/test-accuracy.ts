// P0-8 정확성 회귀 테스트: 정답 화면 세트(fixtures/accuracy/cases.ts)를 실제 엔진으로 검사해
//   거짓 문제 미발견(문제 있는 화면인데 해당 항목이 부적합·검토 필요 둘 다 아님) → 1건이라도 있으면 실패
//   거짓 부적합(문제 없는 화면인데 해당 항목이 부적합) → 개수 보고, 1건이라도 있으면 실패
// KWCAG 2.2 와 JIS X 8341-3:2016 두 기준으로 모두 판정한다. axe-core·Playwright·자체 규칙을 바꿀 때 반드시 실행.
// 실행: npx tsx scripts/test-accuracy.ts   (결과 표는 docs/accuracy-report.md 로도 저장)
import http from "node:http";
import { writeFileSync } from "node:fs";
import sharp from "sharp";
process.env.EGRESS_ALLOW_HOSTS = "localhost:4410";
import { CASES, CASES_VERSION, render } from "../fixtures/accuracy/cases";

type Outcome = "fail" | "review" | "none";

async function main() {
  const png = await sharp({ create: { width: 120, height: 40, channels: 3, background: "#1d4ed8" } }).png().toBuffer();
  const server = http.createServer((req, res) => {
    const [, id, kind] = (req.url ?? "").split("?")[0].split("/");
    if (id === "logo.png") return res.writeHead(200, { "content-type": "image/png" }).end(png);
    const c = CASES.find((x) => x.id === id);
    if (!c || (kind !== "bad" && kind !== "good")) return res.writeHead(200, { "content-type": "text/html" }).end(render({ body: "<p>다른 화면</p>" }));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(render(c[kind]));
  });
  await new Promise<void>((r) => server.listen(4410, "127.0.0.1", r));
  const { launch, newContext, captureState, settle } = await import("../worker/browser");
  const { findingsFromState } = await import("../src/core/judge");
  const { getPack } = await import("../src/core/packs");
  const kr = getPack("kwcag22");
  const jis = getPack("jis2016");

  const browser = await launch();
  const ctx = await newContext(browser, { blockWrites: true });
  const rows: string[] = [];
  let falseClear = 0;
  let falseFail = 0;
  let badTotal = 0;
  let badDetected = 0;
  let goodTotal = 0;
  let goodClean = 0;
  const perItem = new Map<string, { bad: number; hit: number; good: number; clean: number }>();
  const outcome = (fs: { itemCode: string; result: string }[], code: string): Outcome => (fs.some((f) => f.itemCode === code && f.result === "fail") ? "fail" : fs.some((f) => f.itemCode === code && (f.result === "review" || f.result === "pending")) ? "review" : "none");

  for (const c of CASES) {
    const res: Record<string, { kr: Outcome; jis?: Outcome }> = {};
    for (const kind of ["bad", "good"] as const) {
      const page = await ctx.newPage();
      await page.goto(`http://localhost:4410/${c.id}/${kind}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const state = await captureState(page, `${c.id}-${kind}`, { keyboard: true, locale: "ko" });
      await page.close();
      res[kind] = { kr: outcome(findingsFromState(kr, state), c.kr), jis: c.jis ? outcome(findingsFromState(jis, state), c.jis) : undefined };
    }
    const judge = (std: "kr" | "jis") => {
      const bad = res.bad[std];
      const good = res.good[std];
      if (bad === undefined || good === undefined) return "—";
      const missed = c.expect === "fail" ? bad !== "fail" : bad === "none";
      const fp = good === "fail";
      if (missed) falseClear++;
      if (fp) falseFail++;
      badTotal++;
      goodTotal++;
      if (!missed) badDetected++;
      if (!fp) goodClean++;
      const key = `${std === "kr" ? "KWCAG" : "JIS"} ${std === "kr" ? c.kr : c.jis}`;
      const m = perItem.get(key) ?? { bad: 0, hit: 0, good: 0, clean: 0 };
      m.bad++;
      m.good++;
      if (!missed) m.hit++;
      if (!fp) m.clean++;
      perItem.set(key, m);
      return `${missed ? "❌거짓 미발견" : "✅"} bad=${bad} / ${fp ? "❌거짓 부적합" : "✅"} good=${good}`;
    };
    const line = `| ${c.id} | ${c.kr} | ${c.jis ?? "—"} | ${c.what} | ${judge("kr")} | ${c.jis ? judge("jis") : "—"} |`;
    rows.push(line);
    console.log(line);
  }
  await browser.close();
  server.close();

  const { ENGINE } = await import("../fixtures/accuracy/version");
  const recall = badTotal ? (badDetected / badTotal) * 100 : 0;
  const cleanRate = goodTotal ? (goodClean / goodTotal) * 100 : 0;
  // 3의 법칙: n 건 중 0 건이면 95% 신뢰 상한 ≈ 3/n
  const bound = (n: number, x: number) => (x === 0 && n > 0 ? `0건 (95% 상한 약 ${((3 / n) * 100).toFixed(1)}%)` : `${x}건`);
  const itemRows = [...perItem].sort().map(([k, m]) => `| ${k} | ${m.hit}/${m.bad} | ${m.clean}/${m.good} |`).join("\n");
  const report = `# 정확성 회귀 결과 (정답 화면 세트)\n\n실행: ${new Date().toISOString()} · 정답 세트 ${CASES_VERSION} · 엔진 ${ENGINE}\n\n## 요약\n\n- 문제 탐지율 (문제 있는 화면에서 해당 항목을 부적합/검토 필요로 올린 비율): ${badDetected}/${badTotal} = ${recall.toFixed(1)}%\n- 거짓 문제 미발견: ${bound(badTotal, falseClear)}\n- 문제 없는 화면에서 부적합을 내지 않은 비율: ${goodClean}/${goodTotal} = ${cleanRate.toFixed(1)}%\n- 거짓 부적합: ${bound(goodTotal, falseFail)}\n\n**해석 주의**: 표본이 작고(${CASES.length}개 사례 × 기준 2개) 자체 제작이라, 0건이 실제 사이트에서의 정확도를 보장하지 않는다. 항목당 사례가 1~2개뿐이다.\n\n## 사례별\n\n| 사례 | KWCAG | JIS | 내용 | KWCAG 판정 | JIS 판정 |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n\n## 항목별 (탐지 / 문제 없는 화면 통과)\n\n| 항목 | 탐지 | 정상 통과 |\n|---|---|---|\n${itemRows}\n\n## 한계\n\n자동 판정 항목의 대표 사례만 담는다. 의미 판단·사람 확인 항목은 대상이 아니다. 외부 실무자 검토 전에는 검증된 정확도의 근거로 내세우지 않는다 (검토 기록: docs/pilot-review-log.md).\n`;
  writeFileSync("docs/accuracy-report.md", report);
  writeFileSync(
    "fixtures/expected.kwcag22.json",
    JSON.stringify(
      {
        casesVersion: CASES_VERSION,
        engine: ENGINE,
        packs: { kwcag22: kr.version, jis2016: jis.version },
        note: "bad: 해당 항목이 기대 결과여야 함 / good: 해당 항목에 부적합이 없어야 함. 실무자 검토 전 자체 정답.",
        cases: CASES.map((c) => ({
          id: c.id,
          kwcag: { code: c.kr, title: kr.items.find((i) => i.code === c.kr)?.title },
          jis: c.jis ? { code: c.jis, title: jis.items.find((i) => i.code === c.jis)?.title } : null,
          wcag: kr.items.find((i) => i.code === c.kr)?.wcag ?? [],
          what: c.what,
          basis: c.basis,
          condition: c.condition,
          bad: { expect: c.expect === "fail" ? "부적합" : "부적합 또는 검토 필요", html: render(c.bad) },
          good: { expect: "부적합 아님", html: render(c.good) },
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\n거짓 문제 미발견 ${falseClear}건 · 거짓 부적합 ${falseFail}건`);
  console.log(falseClear === 0 && falseFail === 0 ? "PASS  정확성 회귀" : "FAIL  정확성 회귀");
  process.exit(falseClear === 0 && falseFail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
