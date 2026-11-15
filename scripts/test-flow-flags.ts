// P0-6 통합 테스트: 테스트 사이트(localhost:4400)를 실제로 검사해서
//   1) 기본값(플래그 없음) → 흐름 자동 시도 0건, 흐름 화면 0개, 모든 흐름 "suggested"
//   2) FLOW_AUTOTRY+FLOW_SEARCH → 검색만 자동 실행, 빈 칸 제출 없음
//   3) FLOW_AUTOTRY+FLOW_SEARCH+FLOW_EMPTY_SUBMIT → 기존 동작 (검색 + 빈 칸 제출)
// 실행: npm run fixture (다른 창) 후  npx tsx scripts/test-flow-flags.ts
import "dotenv/config";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, flow, pageState, project, scan } from "../src/lib/db";
import { issueUploadToken } from "../src/lib/tokens";
import { runSiteScan } from "../worker/site-scan";

const FLAG_KEYS = ["FLOW_AUTOTRY", "FLOW_SEARCH", "FLOW_EMPTY_SUBMIT", "AI_FLOWS"];

async function run(label: string, env: Record<string, string>) {
  for (const k of FLAG_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const [p] = await db.insert(project).values({ ownerEmail: "flag-test@local", name: `flag-test ${label}`, baseUrl: "http://localhost:4400/", maxPages: 4, ...issueUploadToken().fields }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running" }).returning();
  await runSiteScan(s.id);
  const flows = await db.select().from(flow).where(eq(flow.projectId, p.id));
  const flowPages = await db.select().from(pageState).where(and(eq(pageState.scanId, s.id), isNotNull(pageState.flowId)));
  const allPages = await db.select().from(pageState).where(eq(pageState.scanId, s.id));
  await db.delete(project).where(eq(project.id, p.id));
  return {
    label,
    pages: allPages.length,
    flowPages: flowPages.map((x) => x.label),
    tried: flows.filter((f) => f.autoTried).map((f) => f.kind).sort(),
    autoDone: flows.filter((f) => f.status === "auto_done").map((f) => f.kind).sort(),
    suggested: flows.filter((f) => f.status === "suggested").length,
    total: flows.length,
  };
}

function check(name: string, ok: boolean, detail: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok ? "" : JSON.stringify(detail));
  if (!ok) process.exitCode = 1;
}

async function main() {
  const a = await run("기본값", {});
  console.log(a);
  check("기본값: 흐름 제안은 만들어짐", a.total > 0, a);
  check("기본값: 자동 시도 0건", a.tried.length === 0, a);
  check("기본값: 흐름 화면 0개", a.flowPages.length === 0, a);
  check("기본값: 모든 흐름이 suggested", a.suggested === a.total, a);
  check("기본값: 대표 페이지 검사는 그대로", a.pages > 0, a);

  const b = await run("검색만", { FLOW_AUTOTRY: "on", FLOW_SEARCH: "on" });
  console.log(b);
  check("검색만: search 만 자동 완료", JSON.stringify(b.autoDone) === JSON.stringify(["search"]), b);
  check("검색만: 빈 칸 제출 화면 없음", !b.flowPages.some((l) => l.includes("빈 칸")), b);

  const c = await run("전부", { FLOW_AUTOTRY: "on", FLOW_SEARCH: "on", FLOW_EMPTY_SUBMIT: "on" });
  console.log(c);
  check("전부: 검색 + 빈 칸 제출 흐름이 자동 완료 (기존 동작)", c.autoDone.includes("search") && c.autoDone.length > 1, c);

  const d = await run("세부만", { FLOW_SEARCH: "on", FLOW_EMPTY_SUBMIT: "on" });
  check("전체 스위치 없이 세부만 켜면 자동 시도 0건", d.tried.length === 0 && d.flowPages.length === 0, d);
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
