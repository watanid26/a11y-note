// 사용량 한 사이클 통합 테스트: 실제 워커 프로세스로 한 사이클 + 워커 중단 + 계정 삭제
// 필요: 테스트 사이트 localhost:4400, 웹 서버 localhost:3200 (개발 로그인)
// 실행: npx tsx scripts/test-usage-cycle.ts
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { eq, sql } from "drizzle-orm";
import { db, projectLimit, pageState, project, scan, scanUsage } from "../src/lib/db";
import { createProjectLimited, reserveServerScan, usageStatus } from "../src/lib/usage-limits";
import { issueUploadToken } from "../src/lib/tokens";

const BASE = "http://localhost:3200";
const OWNER = `cycle-${Date.now()}@cycle.local`;
const WENV = { ...process.env, NODE_ENV: "development", EGRESS_ALLOW_HOSTS: "localhost:4400", WORKER_APP_URL: "", REQUIRE_ISOLATION: "" };
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
const workerOnce = () => spawnSync("npx", ["tsx", "worker/main.ts", "--once"], { env: WENV, encoding: "utf8", timeout: 300_000 });
const get = (path: string) => fetch(`${BASE}${path}`, { headers: { cookie: `an_dev_email=${encodeURIComponent(OWNER)}` } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const p = await createProjectLimited(OWNER, { name: "extended", baseUrl: "http://localhost:4400/", maxPages: 5, ...issueUploadToken().fields });
  await db.insert(projectLimit).values({ projectId: p.id, plan: "extended", validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 30 * 86400_000), grantedBy: "test", note: "사용량 사이클 테스트" });
  try {
    // 1) 신규 검사 → 재검사 → 비교 → 사용량 집계
    const r1 = await reserveServerScan(p.id);
    workerOnce();
    const [s1] = await db.select().from(scan).where(eq(scan.id, r1.scan.id));
    const [u1] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, r1.scan.id));
    const pages1 = await db.select().from(pageState).where(eq(pageState.scanId, r1.scan.id));
    check("1회차: 워커가 처리해 완료, 검사 화면 수만큼 집계", s1.status === "done" && pages1.length > 0 && u1.state === "settled" && u1.counted === pages1.length, { status: s1.status, err: s1.error, pages: pages1.length, u1 });
    check("1회차: 의미 판단 설정·엔진 버전 기록", Boolean(s1.aiConfig) && String(s1.engineVersion).includes("axe-core"), { ai: s1.aiConfig, eng: s1.engineVersion });

    const r2 = await reserveServerScan(p.id);
    workerOnce();
    const [u2] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, r2.scan.id));
    check("2회차(재검사): 같은 화면이라 사용량 0", u2.state === "settled" && u2.counted === 0, u2);
    const cmp = await get(`/api/scans/${r2.scan.id}/compare`);
    const cj = await cmp.json();
    check("비교: 직전 회차와 신규·해결 0, 경고 없음", cmp.status === 200 && cj.baseId === r1.scan.id && cj.counts.new === 0 && cj.counts.resolved === 0 && cj.warnings.length === 0, { status: cmp.status, counts: cj.counts, warnings: cj.warnings });
    const rep = await get(`/api/scans/${r2.scan.id}/report`);
    check("보고서 내려받기 200 (docx)", rep.status === 200 && String(rep.headers.get("content-type")).includes("word"), rep.status);
    const st = await usageStatus(p.id);
    check("이번 달 사용량 = 서로 다른 화면 수", st.used === pages1.length && st.plan.id === "extended", { used: st.used });

    // 2) 워커 중단: 검사 중에 강제 종료 → 다음 워커가 실패로 정리 → 예약은 집계 없이 해제
    const r3 = await reserveServerScan(p.id);
    const w = spawn("npx", ["tsx", "worker/main.ts"], { env: WENV, stdio: "ignore", detached: true });
    let running = false;
    for (let i = 0; i < 60 && !running; i++) {
      await sleep(500);
      running = (await db.select().from(scan).where(eq(scan.id, r3.scan.id)))[0].status === "running";
    }
    process.kill(-w.pid!, "SIGKILL");
    await sleep(1000);
    const [s3a] = await db.select().from(scan).where(eq(scan.id, r3.scan.id));
    check("워커 강제 종료 직후: 회차가 '검사 중'으로 남음", running && s3a.status === "running", s3a.status);
    await db.update(scan).set({ startedAt: new Date(Date.now() - 3 * 3600_000) }).where(eq(scan.id, r3.scan.id)); // 시간 경과 흉내
    workerOnce();
    const [s3b] = await db.select().from(scan).where(eq(scan.id, r3.scan.id));
    check("다음 워커가 끝나지 않은 회차를 실패로 정리 (사유 안내)", s3b.status === "failed" && String(s3b.error).includes("워커가 중단"), s3b);
    const r4 = await reserveServerScan(p.id); // 다음 예약이 실패 회차의 예약을 해제
    const [u3] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, r3.scan.id));
    check("중단된 회차 예약은 집계 없이 해제", u3.state === "released" && u3.counted === 0, u3);
    await db.update(scan).set({ status: "failed" }).where(eq(scan.id, r4.scan.id));
  } finally {
    // 4) 계정 삭제 요청 처리 (운영자 스크립트)
    const d = spawnSync("npx", ["tsx", "scripts/delete-account-data.ts", OWNER, "--confirm", OWNER.toUpperCase()], { encoding: "utf8", timeout: 120_000 });
    const left = await db.select().from(project).where(eq(project.ownerEmail, OWNER));
    const ledger = (await db.execute(sql`select count(*)::int n from a11y.owner_usage where owner_email = ${OWNER}`)) as unknown as { n: number }[];
    check("계정 삭제: 프로젝트·원장 모두 삭제", d.status === 0 && left.length === 0 && ledger[0].n === 0, d.stdout + d.stderr);
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
