// 운영 빌드(next start, NODE_ENV=production) 회귀 검사 (P1-8). scripts/test-prod-build.sh 가 띄운 서버(PROD_BASE)에 대고 확인한다.
//  - 개발 로그인 쿠키가 무시되는지(설정에 DEV_LOGIN_ENABLED=1 을 일부러 넣어도), 인증·인가, 내부 경로 비밀값, 확장 출처 제한, 헬스 체크
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, project, scan } from "../src/lib/db";
import { issueUploadToken } from "../src/lib/tokens";
import { checkUrl } from "../src/lib/security/egress";

const BASE = process.env.PROD_BASE ?? "http://localhost:3300";
const ALLOWED = `chrome-extension://${"b".repeat(32)}`;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}
const dev = { cookie: "an_dev_email=prod-test%40local" };

async function main() {
  const issued = issueUploadToken();
  const [p] = await db.insert(project).values({ ownerEmail: "prod-test@local", name: "prod", baseUrl: "https://example.com/", ...issued.fields }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "extension", status: "done" }).returning();
  try {
    const h = await fetch(`${BASE}/api/health`);
    check("헬스 체크 200", h.status === 200);
    const app = await fetch(`${BASE}/app`, { headers: dev, redirect: "manual" });
    check("운영: 개발 로그인 쿠키로 /app 접근 불가 (로그인으로 이동)", app.status >= 300 && app.status < 400 && String(app.headers.get("location")).includes("/login"), { status: app.status, loc: app.headers.get("location") });
    for (const path of [`/api/scans/${s.id}`, `/api/scans/${s.id}/compare`, `/api/scans/${s.id}/report?format=docx`]) {
      const r = await fetch(`${BASE}${path}`, { headers: dev });
      check(`운영: 개발 쿠키로 ${path.split("/").slice(0, 4).join("/")}… 401`, r.status === 401, r.status);
    }
    const del = await fetch(`${BASE}/api/projects/${p.id}`, { method: "DELETE", headers: { ...dev, "content-type": "application/json" }, body: JSON.stringify({ confirmName: p.name }) });
    check("운영: 개발 쿠키로 프로젝트 삭제 불가 401", del.status === 401 && (await db.select().from(project).where(eq(project.id, p.id))).length === 1, del.status);
    for (const [method, path] of [["GET", "/api/internal/status"], ["POST", "/api/internal/cleanup"], ["POST", "/api/internal/heartbeat"], ["GET", "/api/internal/shots?key=x/y.png"], ["PUT", "/api/internal/shots?key=x/y.png"]]) {
      const r = await fetch(`${BASE}${path}`, { method, headers: { authorization: "Bearer wrong-secret-wrong-secret-wrong-secret!!" } });
      check(`내부 경로 잘못된 비밀값 401: ${method} ${path.split("?")[0]}`, r.status === 401, r.status);
    }
    const ok = await fetch(`${BASE}/api/ext/project`, { headers: { authorization: `Bearer ${issued.token}`, origin: ALLOWED } });
    check("확장: 허용한 확장 출처는 CORS 허용", ok.status === 200 && ok.headers.get("access-control-allow-origin") === ALLOWED, ok.status);
    const other = await fetch(`${BASE}/api/ext/project`, { headers: { authorization: `Bearer ${issued.token}`, origin: `chrome-extension://${"c".repeat(32)}` } });
    check("확장: 목록에 없는 확장 출처는 CORS 허용 안 함 (운영)", other.headers.get("access-control-allow-origin") === null);
    let blocked = false;
    try {
      checkUrl("http://localhost:4400/", { NODE_ENV: "production", EGRESS_ALLOW_HOSTS: "localhost:4400" });
    } catch {
      blocked = true;
    }
    check("운영 환경에서는 개발용 허용 목록을 무시하고 내부 주소 차단", blocked);
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
