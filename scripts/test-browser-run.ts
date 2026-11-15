// 확장 자동 검사의 서버 쪽 규칙 (브라우저 없이): 계획·소유 확인·재시도 무시·링크로 다시 계획·집계·멈춘 회차 정리.
// 실행: npx tsx scripts/test-browser-run.ts  (테스트 사이트 localhost:4400 필요 — 주소 모으기용)
process.env.EGRESS_ALLOW_HOSTS = "localhost:4400";
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, project, scan, scanUsage } from "../src/lib/db";
import { createProjectLimited, reserveServerScan } from "../src/lib/usage-limits";
import { issueUploadToken } from "../src/lib/tokens";
import { nextPage, submitPage } from "../src/lib/scan/browser-run";
import { tick } from "../src/lib/scan/engine";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
const fakeState = (url: string) =>
  ({ url, title: "t", label: "t", snapshot: { results: [], candidates: [], applicable: {}, outline: {}, templateSignature: "x" }, keyboard: null, screenshot: null, screenshotScale: 1 }) as never;

(async () => {
  const owner = `brun-${Date.now()}@local`;
  const p = await createProjectLimited(owner, { name: "brun", baseUrl: "http://localhost:4400/spa/", maxPages: 4, ...issueUploadToken().fields });
  try {
    const r = await reserveServerScan(p.id, { source: "browser" });
    const ticked = await tick(5_000);
    const [afterTick] = await db.select().from(scan).where(eq(scan.id, r.scan.id));
    check("서버 tick 은 확장 회차를 건드리지 않음", afterTick.status === "queued" && !afterTick.plan, { ticked, status: afterTick.status });

    const other = await nextPage(r.scan.id, "someone-else@local");
    check("다른 계정은 회차를 볼 수 없음", "error" in other && other.status === 404, other);

    // 서버가 주소를 거의 못 모은 상황을 만든다 (자바스크립트로 그리는 사이트)
    await db.update(scan).set({ plan: { found: 1, pages: [{ url: "http://localhost:4400/spa/", reason: "홈", templateKey: null, groupSize: 1 }], next: 0, checked: [], skipped: [] }, status: "running" }).where(eq(scan.id, r.scan.id));
    const n1 = await nextPage(r.scan.id, owner);
    check("첫 화면 + 링크 요청", !("error" in n1) && !n1.done && n1.page.url.endsWith("/spa/") && n1.wantLinks === true, n1);
    const s1 = await submitPage(r.scan.id, owner, {
      url: "http://localhost:4400/spa/",
      state: fakeState("http://localhost:4400/spa/"),
      links: [
        { url: "http://localhost:4400/help.html", text: "도움말" },
        { url: "http://localhost:4400/contact.html", text: "문의" },
        { url: "http://localhost:4400/logout", text: "로그아웃" },
        { url: "http://localhost:4400/private/members.html", text: "회원 전용(robots 금지)" },
        { url: "https://other.example/x", text: "바깥" },
      ],
    });
    const [mid] = await db.select().from(scan).where(eq(scan.id, r.scan.id));
    const urls = mid.plan!.pages.map((x) => x.url);
    check("확장이 보낸 링크로 다시 계획 (로그아웃·바깥 주소·robots 금지 경로 제외)", !("error" in s1) && urls.length === 3 && urls.includes("http://localhost:4400/help.html") && !urls.some((u) => /logout|other\.example|private/.test(u)), urls);
    const dup = await submitPage(r.scan.id, owner, { url: "http://localhost:4400/spa/", state: fakeState("x") });
    check("이미 올린 화면을 다시 올리면 무시", !("error" in dup) && dup.stale === true, dup);

    for (let i = 0; i < 5; i++) {
      const n = await nextPage(r.scan.id, owner);
      if ("error" in n || n.done) break;
      // 두 번째 화면은 열어 보니 외부 로그인(SSO)으로 넘어간 경우 → 이 사이트 결과로 저장하지 않음
      await submitPage(r.scan.id, owner, i === 0 ? { url: n.page.url, error: "화면 검사 시간 초과" } : { url: n.page.url, state: fakeState("https://sso.other-agency.kr/login") });
    }
    const [done] = await db.select().from(scan).where(eq(scan.id, r.scan.id));
    const [u] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, r.scan.id));
    check("끝까지 진행 → 완료", done.status === "done" && done.plan!.checked.length === 1 && done.plan!.skipped.length === 2, { status: done.status, plan: done.plan });
    check("다른 사이트로 넘어간 화면은 '검사 범위 밖'으로 건너뜀 (Codex 리뷰 9)", done.plan!.skipped.some((x) => /검사 범위 밖/.test(x.reason)), done.plan!.skipped);
    check("사용량 = 실제 검사한 화면 수 (실패·범위 밖 화면은 빼고)", u.state === "settled" && u.counted === 1, u);

    // 확장이 사라진 회차는 10분 뒤 정리 → 다음 검사를 막지 않음
    const r2 = await reserveServerScan(p.id, { source: "browser" });
    await db.execute(sql`update a11y.scan set created_at = now() - interval '11 minutes' where id = ${r2.scan.id}`);
    await tick(3_000);
    const [s2] = await db.select().from(scan).where(eq(scan.id, r2.scan.id));
    check("소식 없는 확장 회차는 실패로 정리", s2.status === "failed", s2.status);
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
  }
  process.exit();
})();
