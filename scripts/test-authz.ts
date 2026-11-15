// P0-3 인가 회귀 테스트: 사용자 A 의 자료를 사용자 B·비로그인으로 호출 → 전부 401/404(또는 로그인 화면), DB 변경 0건.
// 확장 키 교차: A 의 키로 B 의 회차·흐름에 쓰기 → B 자료 변경 0건.
// 실행: 웹 서버(localhost:3200, DEV_LOGIN_ENABLED=1) 실행 후 npx tsx scripts/test-authz.ts
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db, finding, flow, itemDecision, pageState, project, scan } from "../src/lib/db";
import { issueUploadToken } from "../src/lib/tokens";

const BASE = "http://localhost:3200";
const A = "authz-a@local";
const B = "authz-b@local";
let fails = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 200));
  if (!ok) {
    fails++;
    process.exitCode = 1;
  }
}

async function call(method: string, path: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (who) h.cookie = `an_dev_email=${encodeURIComponent(who)}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: payload, redirect: "manual" });
  const text = await r.text().catch(() => "");
  return { status: r.status, location: r.headers.get("location") ?? "", text };
}

async function seed(owner: string) {
  const t = issueUploadToken();
  const [p] = await db.insert(project).values({ ownerEmail: owner, name: `authz ${owner}`, baseUrl: "https://example.com/", ...t.fields }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "extension", status: "done" }).returning();
  const [ps] = await db.insert(pageState).values({ scanId: s.id, url: "https://example.com/", applicable: { images: 1 } as never }).returning();
  const [f] = await db.insert(finding).values({ scanId: s.id, pageStateId: ps.id, itemCode: "5.1.1", method: "auto", result: "fail", ruleId: "image-alt", message: "m" }).returning();
  const [fl] = await db.insert(flow).values({ projectId: p.id, name: "흐름", kind: "apply" }).returning();
  return { p, s, f, fl, token: t.token };
}

async function snapshot(projectId: string, scanId: string) {
  const [p] = await db.select().from(project).where(eq(project.id, projectId));
  const fs = await db.select().from(finding).where(eq(finding.scanId, scanId));
  const ds = await db.select().from(itemDecision).where(eq(itemDecision.scanId, scanId));
  const scans = await db.select().from(scan).where(eq(scan.projectId, projectId));
  const pages = await db.select().from(pageState).where(eq(pageState.scanId, scanId));
  const flows = await db.select().from(flow).where(eq(flow.projectId, projectId));
  return JSON.stringify({ p: { ...p, createdAt: 0 }, fs: fs.map((x) => [x.id, x.humanResult, x.result]), ds: ds.length, scans: scans.length, pages: pages.length, flows: flows.map((x) => [x.id, x.status]) });
}

const denied = (s: number) => s === 401 || s === 403 || s === 404;

async function main() {
  const a = await seed(A);
  const b = await seed(B);
  const before = await snapshot(a.p.id, a.s.id);
  const beforeB = await snapshot(b.p.id, b.s.id);
  try {
    // 0) 테스트 전제: 소유자 A 는 접근 가능
    check("전제: A 는 자기 회차 조회 가능", (await call("GET", `/api/scans/${a.s.id}`, A)).status === 200);
    check("전제: A 는 자기 캡처 경로 접근 시 404(캡처 없음)가 아닌 권한 오류가 아님", [200, 404].includes((await call("GET", `/api/shots/${a.f.id}`, A)).status));

    for (const who of [B, null] as const) {
      const tag = who ? "다른 사용자" : "비로그인";
      const reqs: [string, string, unknown?][] = [
        ["GET", `/api/scans/${a.s.id}`],
        ["POST", `/api/scans/${a.s.id}/review`, { findingIds: [a.f.id], humanResult: "pass" }],
        ["POST", `/api/scans/${a.s.id}/items`, { itemCode: "5.1.1", status: "pass" }],
        ["GET", `/api/scans/${a.s.id}/checklist`],
        ["GET", `/api/scans/${a.s.id}/report`],
        ["GET", `/api/scans/${a.s.id}/fixes`],
        ["GET", `/api/shots/${a.f.id}`],
        ["GET", `/api/shots/${a.f.id}?full=1`],
      ];
      for (const [m, path, body] of reqs) {
        const r = await call(m, path, who, body);
        check(`${tag}: ${m} ${path.replace(a.s.id, "{A회차}").replace(a.f.id, "{A발견}")} → 거부`, denied(r.status), r.status);
      }
      const dp = await call("DELETE", `/api/projects/${a.p.id}`, who, { confirmName: a.p.name });
      check(`${tag}: 프로젝트 삭제 → 거부`, denied(dp.status), dp.status);
      const [pg] = await db.select().from(pageState).where(eq(pageState.scanId, a.s.id));
      const dg = await call("DELETE", `/api/pages/${pg.id}`, who);
      check(`${tag}: 화면 삭제 → 거부`, denied(dg.status), dg.status);
      const fd = new FormData();
      fd.append("file", new Blob([JSON.stringify({ format: "a11ynote-export-v1", states: [] })], { type: "application/json" }), "x.json");
      const imp = await call("POST", `/api/projects/${a.p.id}/import`, who, fd);
      check(`${tag}: 결과 파일 올리기 → 거부`, denied(imp.status), imp.status);
      for (const page of [`/app/p/${a.p.id}`, `/app/s/${a.s.id}`]) {
        const r = await call("GET", page, who);
        const blocked = (who ? r.status === 404 : r.status >= 300 && r.status < 400 && r.location.includes("/login")) && !r.text.includes(`authz ${A}`);
        check(`${tag}: 화면 ${page.replace(a.p.id, "{A}").replace(a.s.id, "{A회차}")} → ${who ? "없음" : "로그인으로"}`, blocked, [r.status, r.location]);
      }
    }

    // ID 변조: B 가 자기 회차 경로에 A 의 발견 사항 ID 를 섞어 보냄 → A 발견 사항은 바뀌지 않아야 함
    const mix = await call("POST", `/api/scans/${b.s.id}/review`, B, { findingIds: [b.f.id, a.f.id], humanResult: "pass" });
    check("ID 변조: B 회차 경로에 A 발견 사항 ID 섞기 → 요청은 처리돼도 A 쪽은 무변경", mix.status === 200, mix.status);
    for (const bad of ["../../etc/passwd", "1 or 1=1", "00000000-0000-0000-0000-000000000000", "%00", "x".repeat(300)]) {
      const r = await call("GET", `/api/scans/${encodeURIComponent(bad)}`, A);
      check(`이상한 회차 ID "${bad.slice(0, 20)}" → 404`, r.status === 404 || r.status === 400, r.status);
    }
    const badItem = await call("POST", `/api/scans/${a.s.id}/items`, A, { itemCode: "99.9.9'; drop table a11y.finding;--", status: "pass" });
    check("없는 항목 코드·주입 문자열 → 400", badItem.status === 400, badItem.status);
    const badBody = await call("POST", `/api/scans/${a.s.id}/review`, A, { findingIds: Array(501).fill(a.f.id), humanResult: "pass" });
    check("발견 사항 501개 한 번에 → 400", badBody.status === 400, badBody.status);

    // 다른 사용자·비로그인 호출 뒤 A 자료 비교 (아래 확장 단계는 A 자기 키로 A 에 쓰므로 그 전에 비교)
    const after = await snapshot(a.p.id, a.s.id);
    check("다른 사용자·비로그인 호출 뒤 A 의 자료 변경 0건 (발견 사항·항목 결정·회차·흐름)", before === after, { before, after });

    // 확장 키 교차: A 의 키로 B 의 회차·흐름을 지정
    const ext = { origin: `chrome-extension://${"a".repeat(32)}`, authorization: `Bearer ${a.token}` };
    const st = await call("POST", "/api/ext/states", null, { scanId: b.s.id, state: { url: "https://example.com/x", title: "t", label: "l", flowId: b.fl.id, snapshot: { results: [], candidates: [], applicable: { images: 0 }, outline: {}, templateSignature: "x" } } }, ext);
    const stBody = JSON.parse(st.text || "{}");
    check("A 키 + B 회차 지정: B 회차에 붙지 않음", st.status === 200 && stBody.scanId !== b.s.id, stBody);
    const [stPage] = await db.select().from(pageState).where(eq(pageState.id, String(stBody.pageStateId)));
    check("A 키 + B 흐름 지정: 흐름 연결이 지워짐", stPage?.flowId === null, stPage?.flowId);
    const fr = await call("POST", `/api/ext/flows/${b.fl.id}`, null, { status: "recorded" }, ext);
    check("A 키로 B 흐름 상태 바꾸기 → 404", fr.status === 404, fr.status);
    const noKey = await call("GET", "/api/ext/project", null, undefined, { origin: ext.origin });
    check("키 없이 확장 API → 401", noKey.status === 401, noKey.status);

    // B 는 자기 발견 사항을 pass 로 바꿨으므로 그것만 바뀌었는지 확인하기 위해 되돌린 뒤 비교
    await db.update(finding).set({ humanResult: null, reviewedBy: null, reviewedAt: null, reviewNote: null }).where(eq(finding.id, b.f.id));
    const afterB = await snapshot(b.p.id, b.s.id);
    check("B 의 자료 변경 0건 (A 키로 시도한 쓰기)", beforeB === afterB, { beforeB, afterB });
    const leakA = await db.select().from(itemDecision).where(and(eq(itemDecision.scanId, a.s.id)));
    check("A 회차에 항목 결정이 생기지 않음", leakA.length === 0, leakA);
  } finally {
    await db.delete(project).where(eq(project.id, a.p.id));
    await db.delete(project).where(eq(project.id, b.p.id));
  }
  console.log(fails ? `실패 ${fails}건` : "전부 통과");
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
