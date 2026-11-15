// P1-8 운영 관측 통합 테스트 (웹 서버 localhost:3200 을 WORKER_SHARED_SECRET 로 실행한 상태)
// 실행: WORKER_SHARED_SECRET=같은값 npx tsx scripts/test-ops.ts
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, opsLog, project, scan } from "../src/lib/db";
import { issueUploadToken } from "../src/lib/tokens";

const BASE = "http://localhost:3200";
const SECRET = process.env.WORKER_SHARED_SECRET!;
const auth = { authorization: `Bearer ${SECRET}` };
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}

async function main() {
  const h = await fetch(`${BASE}/api/health`);
  const hb = await h.json();
  check("공개 헬스 체크 200 + DB 연결, 내부 정보 없음", h.status === 200 && hb.ok === true && Object.keys(hb).sort().join() === "ok,version", hb);

  check("생존 신호: 비밀값 없이 401", (await fetch(`${BASE}/api/internal/heartbeat`, { method: "POST" })).status === 401);
  check("운영 상태: 비밀값 없이 401", (await fetch(`${BASE}/api/internal/status`)).status === 401);

  const since = new Date(Date.now() - 1000);
  // 실제 워커 한 번 실행 → 생존 신호가 기록되는지 (격리 점검은 개발 환경이라 생략)
  const w = spawnSync("npx", ["tsx", "worker/main.ts", "--once"], { env: { ...process.env, WORKER_APP_URL: BASE, NODE_ENV: "development" }, encoding: "utf8", timeout: 120_000 });
  const beats = await db.select().from(opsLog).where(and(eq(opsLog.job, "worker-heartbeat"), gt(opsLog.createdAt, since))).orderBy(desc(opsLog.createdAt));
  check("워커 실행 시 생존 신호 기록 (엔진 버전 포함)", beats.length >= 1 && String((beats[0].detail as { version: string }).version).includes("axe-core"), { beats: beats.length, out: (w.stdout + w.stderr).slice(-300) });

  const s1 = await fetch(`${BASE}/api/internal/status`, { headers: auth });
  const j1 = await s1.json();
  check("운영 상태: 신호 직후 워커 경보 없음", !j1.alerts.some((a: string) => a.includes("워커 신호")), j1.alerts);

  // 오래 대기한 회차 → 경보 + 503
  const [p] = await db.insert(project).values({ ownerEmail: "ops-test@local", name: "ops", baseUrl: "https://example.com/", ...issueUploadToken().fields }).returning();
  try {
    await db.insert(scan).values({ projectId: p.id, source: "server", status: "queued", createdAt: new Date(Date.now() - 45 * 60_000) });
    const s2 = await fetch(`${BASE}/api/internal/status`, { headers: auth });
    const j2 = await s2.json();
    check("40분 넘게 대기한 회차 → 경보, 503", s2.status === 503 && j2.alerts.some((a: string) => a.includes("검사 대기")), { status: s2.status, alerts: j2.alerts });
    const cli = spawnSync("npx", ["tsx", "scripts/ops-status.ts", "--check"], { encoding: "utf8", timeout: 60_000 });
    check("ops-status --check: 경보가 있으면 종료 코드 2", cli.status === 2 && cli.stdout.includes("ALERT"), { code: cli.status, out: cli.stdout.slice(0, 300) });
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
