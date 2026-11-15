// 서버리스 검사 엔진 테스트 (테스트 사이트 localhost:4400 필요). 브라우저는 이 컴퓨터의 Chromium(관문 프록시 포함).
// 실행: npx tsx scripts/test-engine.ts
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pageState, project, scan, scanUsage } from "../src/lib/db";
import { createProjectLimited, reserveServerScan } from "../src/lib/usage-limits";
import { issueUploadToken } from "../src/lib/tokens";
import { stepScan, tick } from "../src/lib/scan/engine";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
(async () => {
  const owner = `engine-${Date.now()}@local`;
  const p = await createProjectLimited(owner, { name: "engine", baseUrl: "http://localhost:4400/", maxPages: 5, ...issueUploadToken().fields });
  try {
    const r = await reserveServerScan(p.id);
    // 같은 회차를 동시에 두 번 → 하나만 일함
    const [a, b] = await Promise.all([stepScan(r.scan.id, 12_000), stepScan(r.scan.id, 12_000)]);
    check("동시 실행 시 한 쪽만 진행 (점유)", [a.worked, b.worked].filter(Boolean).length === 1, { a, b });
    const [mid] = await db.select().from(scan).where(eq(scan.id, r.scan.id));
    check("중간 저장: 계획(대표 화면)과 진행 상황", Boolean(mid.plan && mid.plan.pages.length > 0) && mid.status === "running" && mid.leaseUntil === null, { plan: mid.plan?.pages.length, status: mid.status, lease: mid.leaseUntil });
    let last = "running";
    for (let i = 0; i < 20 && last === "running"; i++) last = (await stepScan(r.scan.id, 25_000)).status;
    const [done] = await db.select().from(scan).where(eq(scan.id, r.scan.id));
    const pages = await db.select().from(pageState).where(eq(pageState.scanId, r.scan.id));
    const [u] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, r.scan.id));
    check("여러 번 나눠 실행해 완료", done.status === "done" && pages.length > 0 && pages.length === done.plan!.checked.length, { status: done.status, pages: pages.length, checked: done.plan?.checked.length, err: done.error });
    check("완료 뒤 사용량 집계 = 검사한 화면 수", u.state === "settled" && u.counted === pages.length, u);
    check("완료 회차는 다시 불러도 아무것도 안 함", (await stepScan(r.scan.id, 5_000)).worked === false);

    // tick 이 대기 회차를 이어 감
    const r2 = await reserveServerScan(p.id).catch((e) => e);
    if (r2 instanceof Error) check("두 번째 예약", false, r2.message);
    else {
      const t = await tick(20_000);
      const [s2] = await db.select().from(scan).where(eq(scan.id, r2.scan.id));
      check("tick 이 대기 회차를 진행시킴", t.advanced >= 1 && (s2.status === "running" || s2.status === "done") && Boolean(s2.plan), { t, status: s2.status });
    }
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
  }
  process.exit();
})();
