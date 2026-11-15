// P0-7 통합 테스트: 테스트 사이트를 실제로 검사한 뒤
//   1) 의미 판단(AI·규칙) 발견 사항 중 결과가 pass 인 것이 0건
//   2) 사람 확정 전 점검표(엑셀)에 "적합·부적합·해당 없음"이 하나도 없음 (전부 (자동)·검토 필요·미검사)
//   3) 점검자가 항목 하나를 적합으로 확정하면 그 행만 "적합"으로 바뀜
//   4) 준수율은 확정 전이면 "확정 전" 표시
// 실행: npm run fixture (다른 창) 후  npx tsx scripts/test-judgement-labels.ts
import "dotenv/config";
import ExcelJS from "exceljs";
import http from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import { db, finding, itemDecision, project, scan } from "../src/lib/db";
import { processPending } from "../src/lib/ai/judge";
import { buildChecklist } from "../src/lib/report/checklist";
import { buildReport } from "../src/lib/report/docx";
import { loadScanView } from "../src/lib/scan-view";
import { issueUploadToken } from "../src/lib/tokens";
import { runSiteScan } from "../worker/site-scan";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}

let lastInfo: Record<string, string> = {};
async function resultColumn(buf: Buffer): Promise<{ rows: string[]; auto: string[]; summary: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("자체진단 점검표")!;
  // 머리글 행("번호")과 "결과 요약" 행을 찾아서 읽는다 (상단 정보 행 수가 바뀌어도 되도록)
  let head = 0;
  let summaryRow = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(1).value === "번호" && !head) head = n;
    if (row.getCell(1).value === "결과 요약") summaryRow = n;
  });
  const rows: string[] = [];
  const auto: string[] = [];
  // 점검자 판정 = 8열, 자동 결과 = 7열
  for (let r = head + 1; r < head + 1 + 33; r++) {
    rows.push(String(ws.getRow(r).getCell(8).value ?? ""));
    auto.push(String(ws.getRow(r).getCell(7).value ?? ""));
  }
  const info: Record<string, string> = {};
  for (let r = 2; r < head; r++) info[String(ws.getRow(r).getCell(1).value ?? "")] = String(ws.getRow(r).getCell(4).value ?? "");
  lastInfo = info;
  return { rows, auto, summary: String(ws.getRow(summaryRow).getCell(4).value ?? "") };
}

async function main() {
  delete process.env.ANTHROPIC_API_KEY; // AI 없이 규칙 판정 경로로 검사
  const [p] = await db.insert(project).values({ ownerEmail: "label-test@local", name: "label-test", baseUrl: "http://localhost:4400/", maxPages: 6, aiEnabled: true, ...issueUploadToken().fields }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running" }).returning();
  try {
    await runSiteScan(s.id);
    await db.update(scan).set({ status: "done" }).where(eq(scan.id, s.id));
    while ((await processPending(100)) > 0) { /* AI 대기 건을 규칙 판정으로 처리 */ }

    const semantic = await db.select().from(finding).where(and(eq(finding.scanId, s.id), eq(finding.method, "ai")));
    check("의미 판단 발견 사항이 있음 (테스트 전제)", semantic.length > 0, semantic.length);
    check("의미 판단 결과 중 pass 0건", semantic.every((f) => f.result !== "pass"), semantic.filter((f) => f.result === "pass").map((f) => f.ruleId));
    const refs = semantic.filter((f) => (f.aiReason ?? "").includes("참고("));
    console.log(`  참고 의견으로 바뀐 판정: ${refs.length}건`, refs.slice(0, 3).map((f) => f.aiReason));

    const [row] = await db.select().from(scan).where(eq(scan.id, s.id));
    let view = await loadScanView(row, p);
    let x = await resultColumn(await buildChecklist(view));
    console.log("  결과 열 분포:", Object.entries(x.rows.reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {})));
    const confirmedLabels = ["적합", "부적합", "해당 없음"];
    check("확정 전 점검표에 적합·부적합·해당 없음 0개", !x.rows.some((v) => confirmedLabels.includes(v)), x.rows);
    check("확정 전에는 준수율 수치 없음", x.summary.includes("모든 항목 확정 후 계산") && !/준수율 \d/.test(x.summary), x.summary);
    check("자동 결과 열에 '문제 미발견' 항목이 존재", x.auto.includes("문제 미발견"), x.auto);
    // P0-10: 점검표 첫 장에 기준·엔진 버전·범위·선정 방식·미검사 범위·판정 구분
    check("점검 기준 버전 표시", lastInfo["점검 기준"]?.includes("KWCAG 2.2") && lastInfo["점검 기준"].includes("연결표 r"), lastInfo["점검 기준"]);
    check("검사 엔진 버전 표시 (axe-core 포함)", /a11ynote-core [\d.]+ \/ axe-core [\d.]+/.test(lastInfo["검사 엔진"] ?? ""), lastInfo["검사 엔진"]);
    check("의미 판단 설정·검사 시각 표시", (lastInfo["의미 판단 설정"] ?? "").length > 3 && /KST/.test(lastInfo["검사 시각"] ?? ""), [lastInfo["의미 판단 설정"], lastInfo["검사 시각"]]);
    check("범위·선정 방식·미검사 범위·판정 구분 표시", ["점검 범위", "화면 선정 방식", "검사하지 않은 범위", "판정 구분"].every((k) => (lastInfo[k] ?? "").length > 10) && lastInfo["판정 구분"].includes("인증이 아닙니다"), Object.keys(lastInfo));

    // 점검자가 7.1.1 을 적합으로 확정
    const idx = view.items.findIndex((i) => i.code === "7.1.1");
    await db.insert(itemDecision).values({ scanId: s.id, itemCode: "7.1.1", status: "pass", decidedBy: "label-test@local" });
    view = await loadScanView(row, p);
    x = await resultColumn(await buildChecklist(view));
    check("확정한 항목만 '적합'", x.rows[idx] === "적합" && x.rows.filter((v) => v === "적합").length === 1, x.rows);
    check("확정 1개 반영된 요약, 전체 확정 전이라 준수율 없음", x.summary.includes("점검자 확정 1개") && x.summary.includes("현재 1/33개 확정") && !/준수율 \d/.test(x.summary), x.summary);

    const docx = await buildReport(view);
    check("워드 보고서 생성", docx.length > 1000, docx.length);

    // ── AI 오류·이상 응답 (가짜 AI 서버) ──
    let mode = "500";
    const fake = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (mode === "drop") return req.socket.destroy();
        if (mode === "500") { res.writeHead(500); return res.end("overloaded"); }
        const ids = [...body.matchAll(/id=([0-9a-f-]{36})/g)].map((m) => m[1]);
        const text = mode === "garbage" ? "죄송합니다. 판단할 수 없습니다." : JSON.stringify(ids.map((id) => ({ id, verdict: mode === "pass" ? "pass" : "fail", confidence: 0.99, reason: mode === "noreason" ? "" : "AI 가 적절하다고 봄" })));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 10 } }));
      });
    });
    await new Promise<void>((r) => fake.listen(4402, "127.0.0.1", r));
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:4402/";
    process.env.AI_DAILY_BUDGET_USD = "1000";
    const aiIds = semantic.map((f) => f.id);
    for (const m of ["500", "drop", "garbage", "noreason", "pass"]) {
      mode = m;
      await db.update(finding).set({ result: "pending", aiReason: null }).where(inArray(finding.id, aiIds));
      while ((await processPending(100)) > 0) { /* */ }
      const after = await db.select().from(finding).where(inArray(finding.id, aiIds));
      const passCount = after.filter((f) => f.result === "pass").length;
      const failCount = after.filter((f) => f.result === "fail").length;
      const ruleCount = after.filter((f) => (f.aiReason ?? "").startsWith("[규칙 판정]")).length;
      if (m === "500" || m === "drop" || m === "garbage") check(`AI ${m}: 규칙 판정으로 대체, pass 0건`, passCount === 0 && ruleCount === after.length, { passCount, ruleCount, n: after.length });
      if (m === "noreason") check("AI 근거 없는 fail: 문제 후보로 올리지 않음", failCount === after.filter((f) => (f.aiReason ?? "").startsWith("[규칙 판정]") && f.result === "fail").length && passCount === 0, { failCount });
      if (m === "pass") check("AI 가 전부 pass(0.99): pass 0건, 참고 의견으로 남음", passCount === 0 && after.every((f) => f.result === "review" && (f.aiReason ?? "").includes("참고(AI 의견")), after.slice(0, 2).map((f) => [f.result, f.aiReason]));
    }
    fake.close();

    // ── 사람 판정 보존: 재처리·추가 업로드 뒤에도 사람이 정한 값은 바뀌지 않음 ──
    const target = semantic[0];
    await db.update(finding).set({ humanResult: "fail", reviewedBy: "label-test@local", reviewedAt: new Date() }).where(eq(finding.id, target.id));
    mode = "pass";
    const fake2 = http.createServer((req, res) => { req.resume(); req.on("end", () => { res.writeHead(500); res.end(); }); });
    await new Promise<void>((r) => fake2.listen(4402, "127.0.0.1", r));
    await db.update(finding).set({ result: "pending" }).where(and(inArray(finding.id, aiIds)));
    while ((await processPending(100)) > 0) { /* */ }
    const [kept] = await db.select().from(finding).where(eq(finding.id, target.id));
    const decisions = await db.select().from(itemDecision).where(eq(itemDecision.scanId, s.id));
    check("재처리 후 발견 사항의 사람 판정 유지", kept.humanResult === "fail" && kept.reviewedBy === "label-test@local", kept);
    check("재처리 후 항목 단위 결정 유지", decisions.some((d) => d.itemCode === "7.1.1" && d.status === "pass"), decisions);
    view = await loadScanView(row, p);
    check("사람이 문제로 확인한 항목은 '부적합' 확정", view.items.some((i) => i.code === target.itemCode && i.decidedBy === "human" && i.status === "fail"), view.items.find((i) => i.code === target.itemCode));
    fake2.close();
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
  }
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
