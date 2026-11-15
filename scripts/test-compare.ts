// P1-1 통합 테스트: 실제 서버 검사 두 번 → 비교 API (웹 서버 localhost:3200, 테스트 사이트 localhost:4400 필요)
//  1) 같은 사이트를 두 번 검사 → 새로 생김·해결 0, 그대로 남음 > 0, 버전 경고 없음
//  2) 비교는 읽기 전용: 이전 회차의 사람 판정·항목 확정이 새 회차로 복사되지 않음
//  3) 화면 하나를 "검사 못 함"으로 만든 회차 → 그 화면 문제는 해결이 아니라 비교 불가
//  4) 권한: 다른 사용자 404, 다른 프로젝트 회차를 base 로 주면 404, 첫 회차는 409
// 실행: npx tsx scripts/test-compare.ts
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400";
import "dotenv/config";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, finding, itemDecision, pageState, project, scan } from "../src/lib/db";
import { issueUploadToken } from "../src/lib/tokens";

const BASE = "http://localhost:3200";
const OWNER = "compare-a@local";
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
const get = async (path: string, who = OWNER) => {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie: `an_dev_email=${encodeURIComponent(who)}` } });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> };
};

async function main() {
  const { runSiteScan } = await import("../worker/site-scan");
  const { processPending } = await import("../src/lib/ai/judge");
  const [p] = await db.insert(project).values({ ownerEmail: OWNER, name: "compare", baseUrl: "http://localhost:4400/", maxPages: 6, ...issueUploadToken().fields }).returning();
  const [other] = await db.insert(project).values({ ownerEmail: OWNER, name: "compare-other", baseUrl: "http://localhost:4400/", ...issueUploadToken().fields }).returning();
  try {
    const run = async () => {
      const [s] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running" }).returning();
      await runSiteScan(s.id);
      while ((await processPending(100)) > 0) { /* worker/main.ts 와 같이 의미 판단까지 */ }
      await db.update(scan).set({ status: "done", finishedAt: new Date() }).where(eq(scan.id, s.id)); // worker/main.ts 와 같이
      return s.id;
    };
    const s1 = await run();
    check("첫 회차만 있으면 409 (비교 대상 없음)", (await get(`/api/scans/${s1}/compare`)).status === 409);

    // 첫 회차에 사람 판정·항목 확정을 남긴다
    const [f1] = await db.select().from(finding).where(eq(finding.scanId, s1)).limit(1);
    await db.update(finding).set({ humanResult: "pass", reviewNote: "장식 요소", reviewedBy: OWNER, reviewedAt: new Date() }).where(eq(finding.id, f1.id));
    await db.insert(itemDecision).values({ scanId: s1, itemCode: "6.4.4", status: "na", note: "해당 없음", decidedBy: OWNER });

    const s2 = await run();
    const r = await get(`/api/scans/${s2}/compare`);
    check("같은 사이트 재검사: 200, 기본 비교 대상은 직전 회차", r.status === 200 && r.body.baseId === s1, r.body);
    check("새로 생김 0 · 해결 0 · 그대로 남음 > 0", r.body.counts?.new === 0 && r.body.counts?.resolved === 0 && r.body.counts?.persisting > 0, r.body.counts);
    check("버전이 같으면 경고 없음", Array.isArray(r.body.warnings) && r.body.warnings.length === 0, r.body.warnings);
    const carried = (r.body.findings as any[]).find((x) => x.baseFindingId === f1.id);
    check("이전 사람 판정은 참고 이력으로 표시", carried?.previousHuman?.result === "pass" && carried?.previousHuman?.note === "장식 요소", carried);
    const humanOn2 = await db.select().from(finding).where(and(eq(finding.scanId, s2), isNotNull(finding.humanResult)));
    const decOn2 = await db.select().from(itemDecision).where(eq(itemDecision.scanId, s2));
    check("새 회차에 사람 판정·항목 확정이 복사되지 않음", humanOn2.length === 0 && decOn2.length === 0, { humanOn2: humanOn2.length, decOn2: decOn2.length });

    // 3) 검사 못 한 화면: s2 를 복제하되 문제가 있는 화면 하나를 빼고 skipped 에 넣는다
    const pages2 = await db.select().from(pageState).where(eq(pageState.scanId, s2));
    const f2 = await db.select().from(finding).where(eq(finding.scanId, s2));
    const victim = pages2.find((pg) => f2.some((f) => f.pageStateId === pg.id && f.result === "fail"))!;
    const [s3] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "done", packVersion: (await db.select().from(scan).where(eq(scan.id, s2)))[0].packVersion, engineVersion: (await db.select().from(scan).where(eq(scan.id, s2)))[0].engineVersion, aiConfig: (await db.select().from(scan).where(eq(scan.id, s2)))[0].aiConfig, skipped: [{ url: victim.url, reason: "시간 초과" }] }).returning();
    for (const pg of pages2) {
      if (pg.id === victim.id) continue;
      const { id: _old, scanId: _s, createdAt: _c, ...rest } = pg;
      const [np] = await db.insert(pageState).values({ ...rest, scanId: s3.id, screenshotKey: null }).returning();
      for (const f of f2.filter((x) => x.pageStateId === pg.id)) {
        const { id: _i, scanId: _x, pageStateId: _p, createdAt: _y, ...fr } = f;
        await db.insert(finding).values({ ...fr, scanId: s3.id, pageStateId: np.id });
      }
    }
    const r3 = await get(`/api/scans/${s3.id}/compare?base=${s2}`);
    const victimProblems = f2.filter((f) => f.pageStateId === victim.id && f.result !== "pass").length;
    check("검사 못 한 화면의 문제는 해결 0, 비교 불가로", r3.status === 200 && r3.body.counts.resolved === 0 && r3.body.counts.incomparable === victimProblems && victimProblems > 0, { counts: r3.body.counts, victimProblems });
    check("화면 목록에 '검사 못 함'과 사유", (r3.body.pages as any[]).some((pg) => pg.change === "skipped" && String(pg.reason).includes("시간 초과")), r3.body.pages);

    // 4) 권한
    check("다른 사용자는 비교 404", (await get(`/api/scans/${s2}/compare`, "compare-b@local")).status === 404);
    check("다른 사용자 회차를 base 로 줘도 404", (await get(`/api/scans/${s2}/compare?base=${s1}`, "compare-b@local")).status === 404);
    const [os] = await db.insert(scan).values({ projectId: other.id, source: "server", status: "done" }).returning();
    check("다른 프로젝트 회차를 base 로 주면 404", (await get(`/api/scans/${s2}/compare?base=${os.id}`)).status === 404);
    check("비교 화면(페이지)도 소유자만", (await fetch(`${BASE}/app/s/${s2}/compare`, { headers: { cookie: `an_dev_email=compare-b@local` } })).status === 404);
    const page = await fetch(`${BASE}/app/s/${s2}/compare`, { headers: { cookie: `an_dev_email=${OWNER}` } });
    const html = await page.text();
    check("비교 화면 렌더링 (참고용 이력 안내 포함)", page.status === 200 && html.includes("재검사 비교") && html.includes("참고용 이력"), page.status);
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
    await db.delete(project).where(eq(project.id, other.id));
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
