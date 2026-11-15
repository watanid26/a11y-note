// P1-2 통합 테스트: 사용 한도 (DB 직접 + 실제 서버 검사 1회, 테스트 사이트 localhost:4400 필요)
// 실행: npx tsx scripts/test-usage.ts   (EXT_DAILY_LIMIT 를 설정하지 말 것 — 사용 한도 값 확인)
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400";
delete process.env.EXT_DAILY_LIMIT;
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, projectLimit, pageState, project, scan, scanUsage } from "../src/lib/db";
import { OWNER_DEFAULT, LimitError, PLANS, createProjectLimited, extDailyLimit, periodOf, reserveServerScan, settleScan, usageKey, usageStatus } from "../src/lib/usage-limits";
import { issueUploadToken } from "../src/lib/tokens";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
const OWNER = "usage-test@local";
const OWNER2 = "usage-owner2@local";
const made: string[] = [];
async function mkProject(o: { maxPages?: number; baseUrl?: string; plan?: keyof typeof PLANS; expired?: boolean; owner?: string } = {}) {
  const [p] = await db.insert(project).values({ ownerEmail: o.owner ?? OWNER, name: `usage ${made.length}`, baseUrl: o.baseUrl ?? "https://example.com/", maxPages: o.maxPages ?? 40, ...issueUploadToken().fields }).returning();
  made.push(p.id);
  if (o.plan) {
    const now = Date.now();
    await db.insert(projectLimit).values({ projectId: p.id, plan: o.plan, validFrom: new Date(now - 86400_000 * 40), validUntil: new Date(o.expired ? now - 1000 : now + 86400_000 * 30), grantedBy: "test" });
  }
  return p;
}
const finish = (scanId: string, status = "done") => db.update(scan).set({ status, finishedAt: new Date() }).where(eq(scan.id, scanId));
async function fillUsage(projectId: string, n: number) {
  const period = periodOf();
  for (let i = 0; i < n; i++) await db.execute(sql`insert into a11y.usage_page (project_id, period, page_key) values (${projectId}, ${period}, ${`https://filler.example/${i}`})`);
}
const code = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "ok";
  } catch (e) {
    return e instanceof LimitError ? e.code : (e as Error).message;
  }
};

async function main() {
  await db.execute(sql`delete from a11y.owner_usage where owner_email in (${OWNER}, ${OWNER2})`);
  try {
    // 1) 기본 한도 + 예약
    const a = await mkProject({ maxPages: 40 });
    const r1 = await reserveServerScan(a.id);
    check("사용 한도 없음 → 기본 한도, 회차 상한 = min(프로젝트 40, 기본 10), 예약 10", r1.pageCap === 10 && r1.reserved === 10, r1);
    check("동시 검사 제한: 대기 중 회차가 있으면 거부", (await code(() => reserveServerScan(a.id))) === "E_CONCURRENT");

    // 2) 집계: 쿼리만 다른 화면은 하나로, 두 번 집계해도 한 번만
    const s1 = await settleScan(r1.scan.id, ["https://example.com/a?x=1", "https://example.com/a?x=2", "https://example.com/b", "https://example.com/c/"]);
    check("집계: 서로 다른 화면 3개", s1?.counted === 3, s1);
    check("같은 회차 두 번 집계 → 무시(중복 차감 없음)", (await settleScan(r1.scan.id, ["https://example.com/z"])) === null && (await usageStatus(a.id)).used === 3);
    await finish(r1.scan.id);

    // 3) 같은 달 재검사는 다시 세지 않음
    const r2 = await reserveServerScan(a.id);
    const s2 = await settleScan(r2.scan.id, ["https://example.com/a", "https://example.com/b", "https://example.com/d"]);
    await finish(r2.scan.id);
    check("재검사: 이미 센 화면 a·b 는 0, 새 화면 d 만 1", s2?.counted === 1 && (await usageStatus(a.id)).used === 4, s2);

    // 4) 실패한 회차의 예약은 집계 없이 풀림 (새 프로젝트 — 기본 한도는 하루 3회)
    const a4 = await mkProject();
    const r3 = await reserveServerScan(a4.id);
    await finish(r3.scan.id, "failed");
    check("실패 회차 예약은 다음 예약 때 풀림 (동시 제한에 안 걸림, 사용량 0)", (await code(() => reserveServerScan(a4.id).then((x) => finish(x.scan.id)))) === "ok" && (await usageStatus(a4.id)).used === 0);
    const [u3] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, r3.scan.id));
    check("실패 회차 상태 released, 차감 0", u3.state === "released" && u3.counted === 0, u3);

    // 5) 하루 회차 수 (기본 한도 3회)
    const b = await mkProject();
    for (let i = 0; i < 3; i++) await reserveServerScan(b.id).then((x) => finish(x.scan.id));
    check("하루 시작 수 초과 → E_DAILY", (await code(() => reserveServerScan(b.id))) === "E_DAILY");

    // 6) 월 한도 근처: 남은 2개면 예약 2, 한도 도달 후엔 '이미 센 화면만' 회차
    const c = await mkProject();
    await fillUsage(c.id, 28);
    const r6 = await reserveServerScan(c.id);
    check("남은 화면 2 → 예약 2", r6.reserved === 2, r6.reserved);
    await settleScan(r6.scan.id, ["https://example.com/1", "https://example.com/2", "https://example.com/3"]);
    await finish(r6.scan.id);
    check("예약보다 많이 검사해도 예약 수까지만 차감 (30/30)", (await usageStatus(c.id)).used === 30);
    const r7 = await reserveServerScan(c.id);
    check("한도 도달 → 재검사 전용 회차(예약 0)", r7.reserved === 0, r7.reserved);
    const s7 = await settleScan(r7.scan.id, ["https://example.com/1", "https://example.com/new"]);
    await finish(r7.scan.id);
    check("재검사 전용 회차는 새 화면을 세지 않음", s7?.counted === 0 && (await usageStatus(c.id)).used === 30, s7);
    const d = await mkProject({ plan: "basic" });
    await db.update(projectLimit).set({ plan: "zero-test" }).where(eq(projectLimit.projectId, d.id)); // 알 수 없는 한도 → 기본 한도로
    check("알 수 없는 한도 이름은 기본 한도로 처리", (await usageStatus(d.id)).plan.id === "basic");

    // 7) 동시 요청 원자성: 대용량 한도(동시 2) 에 20건 동시 → 정확히 2건
    const e = await mkProject({ plan: "large" });
    const results = await Promise.all(Array.from({ length: 20 }, () => code(() => reserveServerScan(e.id))));
    const n = await db.select().from(scanUsage).where(eq(scanUsage.projectId, e.id));
    check("동시 20건 → 정확히 2건 성공, 18건 E_CONCURRENT, 예약 2행", results.filter((x) => x === "ok").length === 2 && results.filter((x) => x === "E_CONCURRENT").length === 18 && n.length === 2, results);

    // 8) 동시 집계(같은 화면을 두 회차가 동시에) → 한 번만 셈
    const f = await mkProject({ plan: "large" });
    const [fa, fb] = [await reserveServerScan(f.id), await reserveServerScan(f.id)];
    await Promise.all([settleScan(fa.scan.id, ["https://example.com/same"]), settleScan(fb.scan.id, ["https://example.com/same"])]);
    check("두 회차가 같은 화면을 동시에 집계 → 사용량 1", (await usageStatus(f.id)).used === 1);

    // 9) 프로젝트 격리·사용 한도 기간
    check("다른 프로젝트 사용량과 섞이지 않음", (await usageStatus(e.id)).used === 0 && (await usageStatus(a.id)).used === 4);
    const g = await mkProject({ plan: "extended", expired: true });
    check("만료된 사용 한도 → 기본 한도", (await usageStatus(g.id)).plan.id === "basic");
    const h = await mkProject({ plan: "extended" });
    check("유효한 확장 한도 → 월 300", (await usageStatus(h.id)).plan.monthlyPages === 300);
    check("확장 하루 업로드 한도도 사용 한도 값 (기본 50 / 확장 500)", (await extDailyLimit(g.id)) === 50 && (await extDailyLimit(h.id)) === 500);

    // 10) 실제 서버 검사: 예약 안에서만 검사하고, 검사한 화면만 집계
    const { runSiteScan } = await import("../worker/site-scan");
    const w = await mkProject({ baseUrl: "http://localhost:4400/", maxPages: 6 });
    await fillUsage(w.id, 28); // 남은 2개
    const rw = await reserveServerScan(w.id);
    await db.update(scan).set({ status: "running" }).where(eq(scan.id, rw.scan.id));
    await runSiteScan(rw.scan.id, { requireAllowance: true });
    const pages = await db.select().from(pageState).where(eq(pageState.scanId, rw.scan.id));
    const [sw] = await db.select().from(scan).where(eq(scan.id, rw.scan.id));
    const [uw] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, rw.scan.id));
    const distinct = new Set(pages.map((p) => usageKey(p.url))).size;
    check("예약 2 → 실제 검사 화면 2개 이하, 집계 = 검사한 서로 다른 화면 수", pages.length > 0 && distinct <= 2 && uw.state === "settled" && uw.counted === distinct, { pages: pages.length, distinct, uw });
    check("한도로 뺀 화면은 '검사하지 않은 범위'에 사유와 함께", (sw.skipped ?? []).some((s) => s.reason.includes("이번 달 화면 한도")), sw.skipped);
    const [orphan] = await db.insert(scan).values({ projectId: w.id, source: "server", status: "running" }).returning();
    check("워커: 예약 없는 회차는 검사하지 않음", (await code(() => runSiteScan(orphan.id, { requireAllowance: true }))).includes("사용 한도 예약이 없는"));
    // 12) 예약 해제 뒤 늦게 도착한 워커: 검사 거부, 집계 무시
    const late = await mkProject({ plan: "large" });
    const rl = await reserveServerScan(late.id);
    await db.update(scanUsage).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(scanUsage.scanId, rl.scan.id));
    await reserveServerScan(late.id); // 다음 예약이 오래된 예약을 해제
    const [ul] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, rl.scan.id));
    check("24시간 지난 예약은 해제(released)", ul.state === "released", ul);
    check("해제된 회차를 워커가 늦게 집어도 검사 거부", (await code(() => runSiteScan(rl.scan.id, { requireAllowance: true }))).includes("사용 한도 예약이 없는"));
    check("해제된 회차 집계 시도 → 무시, 사용량 0", (await settleScan(rl.scan.id, ["https://example.com/x"])) === null && (await usageStatus(late.id)).used === 0);

    // 13) 기본 한도 계정 단위 한도: 같은 계정의 기본 한도 프로젝트끼리 공유, 프로젝트를 지워도 유지
    await db.execute(sql`delete from a11y.owner_usage where owner_email = ${OWNER2}`);
    const m1 = await mkProject({ owner: OWNER2 });
    const m2 = await mkProject({ owner: OWNER2 });
    const rm1 = await reserveServerScan(m1.id);
    await settleScan(rm1.scan.id, Array.from({ length: 10 }, (_, i) => `https://example.com/m1/${i}`));
    await finish(rm1.scan.id);
    const rm1b = await reserveServerScan(m1.id);
    await settleScan(rm1b.scan.id, Array.from({ length: 10 }, (_, i) => `https://example.com/m1b/${i}`));
    await finish(rm1b.scan.id);
    const before = await usageStatus(m2.id);
    check("다른 기본 한도 프로젝트에도 계정 사용량 반영 (20/30, 남은 10)", before.ownerShared?.used === 20 && before.remaining === 10, before.ownerShared);
    await db.delete(project).where(eq(project.id, m1.id));
    const after = await usageStatus(m2.id);
    check("사용한 프로젝트를 지워도 계정 사용량 유지", after.ownerShared?.used === 20 && after.remaining === 10, after.ownerShared);
    const rm2 = await reserveServerScan(m2.id);
    check("계정 남은 한도만큼만 예약 (10)", rm2.reserved === 10, rm2.reserved);
    await settleScan(rm2.scan.id, Array.from({ length: 10 }, (_, i) => `https://example.com/m2/${i}`));
    await finish(rm2.scan.id);
    const m3 = await mkProject({ owner: OWNER2 });
    const e3 = await code(() => reserveServerScan(m3.id));
    check("계정 기본 한도 소진 → 새 기본 한도 프로젝트도 E_MONTHLY", e3 === "E_MONTHLY", e3);
    // 동시: 같은 계정 두 기본 한도 프로젝트에 동시 예약 → 합계가 계정 한도를 넘지 않음
    await db.execute(sql`delete from a11y.owner_usage where owner_email = ${OWNER2}`);
    await db.execute(sql`insert into a11y.owner_usage (owner_email, period, pages) values (${OWNER2}, ${periodOf()}, 25)`);
    const [c1, c2] = await Promise.all([reserveServerScan(m2.id).catch(() => null), reserveServerScan(m3.id).catch(() => null)]);
    const sum = (c1?.reserved ?? 0) + (c2?.reserved ?? 0);
    check("동시 예약 합계 ≤ 계정 남은 5", sum <= 5 && sum > 0, { a: c1?.reserved, b: c2?.reserved });

    // 14) 기본 한도 계정 프로젝트 수 제한 (동시 생성 포함)
    const OWNER3 = `usage-proj-${Date.now()}@local`;
    const tries = await Promise.all(Array.from({ length: 8 }, (_, i) => code(async () => { const p = await createProjectLimited(OWNER3, { name: `p${i}`, baseUrl: "https://example.com/", ...issueUploadToken().fields }); made.push(p.id); })));
    check(`기본 한도 계정: 동시 8건 생성 → 정확히 ${OWNER_DEFAULT.projects}건`, tries.filter((x) => x === "ok").length === OWNER_DEFAULT.projects && tries.filter((x) => x === "E_PROJECTS").length === 8 - OWNER_DEFAULT.projects, tries);
    const firstOf3 = made[made.length - 1];
    await db.insert(projectLimit).values({ projectId: firstOf3, plan: "extended", validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 86400_000), grantedBy: "test" });
    check("사용 한도가 있는 계정은 프로젝트 수 제한 없음", (await code(async () => { const p = await createProjectLimited(OWNER3, { name: "paid", baseUrl: "https://example.com/", ...issueUploadToken().fields }); made.push(p.id); })) === "ok");

    // 15) 계정 식별자 대소문자: 같은 계정으로 취급, 대문자 저장은 DB 가 거부
    const OWNER4 = `usage-case-${Date.now()}@local`;
    for (let i = 0; i < 3; i++) { const p = await createProjectLimited(i % 2 ? OWNER4.toUpperCase() : ` ${OWNER4} `, { name: `c${i}`, baseUrl: "https://example.com/", ...issueUploadToken().fields }); made.push(p.id); }
    check("대소문자·공백만 다른 이메일은 같은 계정 (4번째는 E_PROJECTS)", (await code(() => createProjectLimited(OWNER4.toUpperCase(), { name: "c4", baseUrl: "https://example.com/", ...issueUploadToken().fields }))) === "E_PROJECTS");
    check("대문자 이메일 직접 저장은 DB 제약이 거부", (await code(() => db.insert(project).values({ ownerEmail: "Mixed@Local", name: "x", baseUrl: "https://example.com/", ...issueUploadToken().fields }))) !== "ok");

    // 11) 화면 표시 (웹 서버 localhost:3200 이 떠 있을 때)
    const html = await fetch(`http://localhost:3200/app/p/${c.id}?limit=E_MONTHLY`, { headers: { cookie: `an_dev_email=${encodeURIComponent(OWNER)}` } }).then((r) => r.text()).then((t) => t.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "")).catch(() => "");
    check("프로젝트 화면에 사용 한도·사용량·한도 안내 표시", html.includes("사용 한도") && html.includes("검사한 화면 30 / 30개") && html.includes("이번 달 검사 화면 한도를 모두 써서"), html.slice(0, 0));
  } finally {
    for (const id of made) await db.delete(project).where(eq(project.id, id));
    await db.execute(sql`delete from a11y.owner_usage where owner_email in (${OWNER}, ${OWNER2})`);
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
