import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, aiUsage, finding, pageState, project, scan } from "../src/lib/db";
import { deleteProjectData } from "../src/lib/privacy";

const owner = `codex-gemini-${Date.now()}@local`;
const baseUrl = "https://www.seoul.go.kr/main/index.jsp";

async function usageSnapshot() {
  const rows = await db.select().from(aiUsage);
  return rows.reduce(
    (a, r) => ({ calls: a.calls + r.calls, inputTokens: a.inputTokens + r.inputTokens, outputTokens: a.outputTokens + r.outputTokens, costUsd: a.costUsd + Number(r.costUsd) }),
    { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
}

async function main() {
  const before = await usageSnapshot();
  const [p] = await db.insert(project).values({ ownerEmail: owner, name: "Gemini 서울시 1페이지 테스트", baseUrl, maxPages: 1, aiEnabled: true }).returning();
  let scanId = "";
  try {
    const [s] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running", label: "Gemini 연결·실사이트 스모크" }).returning();
    scanId = s.id;
    const { runSiteScan } = await import("../worker/site-scan");
    const { processPending } = await import("../src/lib/ai/judge");
    await runSiteScan(s.id);
    while ((await processPending(100, s.id)) > 0) { /* drain */ }
    await db.update(scan).set({ status: "done", finishedAt: new Date() }).where(eq(scan.id, s.id));

    const pages = await db.select().from(pageState).where(eq(pageState.scanId, s.id));
    const findings = await db.select().from(finding).where(eq(finding.scanId, s.id));
    const [finalScan] = await db.select().from(scan).where(eq(scan.id, s.id));
    const after = await usageSnapshot();
    const delta = {
      calls: after.calls - before.calls,
      inputTokens: after.inputTokens - before.inputTokens,
      outputTokens: after.outputTokens - before.outputTokens,
      costUsd: Number((after.costUsd - before.costUsd).toFixed(6)),
    };
    const counts = findings.reduce<Record<string, number>>((a, f) => { a[`${f.method}:${f.result}`] = (a[`${f.method}:${f.result}`] ?? 0) + 1; return a; }, {});
    console.log(JSON.stringify({
      ok: true,
      provider: process.env.AI_PROVIDER,
      model: process.env.GEMINI_MODEL,
      scanId: scanId.slice(0, 8),
      status: finalScan?.status,
      pages: pages.length,
      findings: findings.length,
      findingCounts: counts,
      aiConfig: finalScan?.aiConfig,
      skipped: finalScan?.skipped?.length ?? 0,
      usageDelta: delta,
    }, null, 2));
  } finally {
    await deleteProjectData(p.id);
  }
}

main().catch((e) => {
  console.error("GEMINI_SEOUL_TEST_FAIL", (e as Error).message);
  process.exitCode = 1;
});
