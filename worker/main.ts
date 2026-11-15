// 검사 워커: 대기 중인 서버 검사를 처리하고, AI 판정 대기 건을 처리한다.
//   npm run worker            (계속 실행)
//   npm run worker -- --once  (한 번만 돌고 종료 — 테스트용)
// 브라우저(Chromium)를 띄워야 하므로 Vercel 함수가 아닌 별도 서버·컨테이너에서 돌린다.

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, scan } from "../src/lib/db";
import { processPending } from "../src/lib/ai/judge";
import { processVerifications } from "../src/lib/ai/verify";
import { processPassSamples } from "../src/lib/ai/verify-pass";
import { eq } from "drizzle-orm";
import { runSiteScan } from "./site-scan";
import { scrubLog } from "../src/lib/security/log";
import { isolationCheck } from "./isolation-check";
import { preflight } from "../src/lib/ops/preflight";
import { ENGINE_VERSION } from "../src/core/engine-version";
import { stopGraceMs, WorkerLife, workerId } from "../src/lib/ops/worker-life";

const once = process.argv.includes("--once");
// 생존 확인 상태 파일 (scripts/worker-health.mjs 가 읽는다). 빈 값이면 쓰지 않는다
const life = new WorkerLife(workerId(), ENGINE_VERSION, process.env.WORKER_HEALTH_FILE ?? "/tmp/a11ynote-worker-health.json");

async function claimScan(): Promise<string | null> {
  const rows = await db.execute<{ id: string }>(sql`
    update a11y.scan set status = 'running', started_at = now()
    where id = (select id from a11y.scan where status = 'queued' and source = 'server' order by created_at limit 1 for update skip locked)
    returning id`);
  return (rows as unknown as { id: string }[])[0]?.id ?? null;
}

let lastCleanup = 0;
/** 하루 한 번 보관기간 지난 캡처 정리를 웹 앱에 요청 (P0-9) */
async function dailyCleanup(): Promise<void> {
  if (Date.now() - lastCleanup < 24 * 3600_000) return;
  lastCleanup = Date.now();
  const url = process.env.WORKER_APP_URL;
  if (!url || !process.env.WORKER_SHARED_SECRET) return console.log("[worker] 캡처 정리 생략 (WORKER_APP_URL 미설정)");
  const r = await fetch(`${url.replace(/\/+$/, "")}/api/internal/cleanup`, { method: "POST", headers: { authorization: `Bearer ${process.env.WORKER_SHARED_SECRET}` }, signal: AbortSignal.timeout(300_000) }).catch((e) => e as Error);
  if (r instanceof Error || !r.ok) {
    lastCleanup = Date.now() - 23 * 3600_000; // 1시간 뒤 재시도
    return console.warn("[worker] 캡처 정리 실패", r instanceof Error ? scrubLog(r.message) : r.status);
  }
  console.log("[worker] 보관기간 지난 캡처 정리", await r.json());
}

let lastBeat = 0;
let isolationOk = false;
/** 5분마다 웹 앱에 생존 신호 (P1-8) — 신호가 끊기면 운영 상태 경로가 경보 */
async function heartbeat(): Promise<void> {
  if (Date.now() - lastBeat < 5 * 60_000) return;
  const url = process.env.WORKER_APP_URL;
  if (!url || !process.env.WORKER_SHARED_SECRET) return;
  lastBeat = Date.now();
  const r = await fetch(`${url.replace(/\/+$/, "")}/api/internal/heartbeat`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.WORKER_SHARED_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ version: ENGINE_VERSION, isolation: isolationOk, worker: life.id, state: life.state }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => e as Error);
  if (r instanceof Error || !r.ok) console.warn("[worker] 생존 신호 실패", r instanceof Error ? scrubLog(r.message) : r.status);
}

/**
 * 워커가 중단돼 "검사 중"으로 남은 회차를 실패로 정리한다 .
 * 회차 한도(SCAN_LIMIT_MS)의 2배가 지나도 끝나지 않은 회차만 — 실패가 되면 사용 한도 예약은 다음 예약 때 집계 없이 풀린다.
 */
async function recoverStuck(): Promise<void> {
  const limitMs = Number(process.env.SCAN_LIMIT_MS ?? 20 * 60_000) * 2;
  const rows = await db.execute<{ id: string }>(sql`
    update a11y.scan set status = 'failed', finished_at = now(), error = '워커가 중단돼 검사가 끝나지 않았습니다. 다시 시작해 주세요. (사용량 차감 없음)'
    where status = 'running' and source = 'server' and started_at < now() - make_interval(secs => ${limitMs / 1000})
    returning id`);
  const ids = (rows as unknown as { id: string }[]).map((r) => r.id);
  if (ids.length) console.warn(`[worker] 끝나지 않은 회차 ${ids.length}개를 실패로 정리: ${ids.join(", ")}`);
}

async function tick(): Promise<boolean> {
  await heartbeat().catch(() => {});
  await recoverStuck().catch((e) => console.warn("[worker] 중단 회차 정리 오류", scrubLog((e as Error).message)));
  await dailyCleanup().catch((e) => console.warn("[worker] 캡처 정리 오류", scrubLog((e as Error).message)));
  let worked = false;
  // 종료 요청을 받았으면 새 회차를 가져가지 않는다
  const id = life.stopping ? null : await claimScan();
  if (id) {
    worked = true;
    life.set("busy", id);
    console.log(`[worker] 검사 시작 ${id}`);
    try {
      await runSiteScan(id, { requireAllowance: true });
      await db.update(scan).set({ status: "done", finishedAt: new Date(), progress: { phase: "완료", done: 1, total: 1 } }).where(eq(scan.id, id));
      console.log(`[worker] 검사 완료 ${id}`);
    } catch (e) {
      console.error(`[worker] 검사 실패 ${id}`, scrubLog((e as Error).message));
      await db.update(scan).set({ status: "failed", error: scrubLog((e as Error).message, 500), finishedAt: new Date() }).where(eq(scan.id, id));
    } finally {
      life.set("idle", null);
    }
  }
  if (life.stopping) return worked;
  const judged = await processPending(40);
  if (judged) {
    worked = true;
    console.log(`[worker] 판정 ${judged}건`);
  }
  // 자동검사 결과 AI 2차 검수 (AI_VERIFY_ENABLED=1 일 때만, 원본 결과는 바꾸지 않음)
  // "문제 미발견" 표본 검수는 AI_VERIFY_PASS_ENABLED=1 일 때만 (끝난 회차, 결정적 표본, 회차 상한)
  const verified = (await processVerifications(20).catch(() => 0)) + (await processPassSamples(10).catch(() => 0));
  if (verified) {
    worked = true;
    console.log(`[worker] AI 검수 ${verified}건`);
  }
  return worked;
}

async function main() {
  console.log("[worker] 시작");
  // 운영에서는 네트워크 격리가 확인돼야만 작업한다 (실패 시 기본 거부)
  // 운영에서는 설정 점검을 먼저 (워커 DB 역할·서비스 키 없음·https 등). 실패하면 시작하지 않는다 (P1-8)
  if (process.env.NODE_ENV === "production") {
    const pf = preflight("worker", process.env as Record<string, string | undefined>);
    for (const w of pf.warnings) console.warn(`[worker] 설정 경고: ${w}`);
    if (pf.errors.length) {
      for (const e of pf.errors) console.error(`[worker] 설정 오류: ${e}`);
      process.exit(78);
    }
  }
  if (process.env.NODE_ENV === "production" || process.env.REQUIRE_ISOLATION === "1") {
    const iso = await isolationCheck();
    if (!iso.ok) {
      console.error(`[worker] 네트워크 격리 확인 실패 — 작업을 시작하지 않습니다. 접속된 곳: ${iso.reachable.join(", ")}`);
      process.exit(78);
    }
    console.log("[worker] 네트워크 격리 확인 통과");
    isolationOk = true;
  }
  life.set("idle");
  const beat = setInterval(() => life.writeHealth(), 15_000);
  beat.unref();
  for (;;) {
    const worked = await tick().catch((e) => {
      console.error("[worker]", e);
      return false;
    });
    if (life.stopping) break;
    if (once && !worked) break;
    if (!worked) await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[worker] 종료 (${life.id})`);
  process.exit(0);
}

/**
 * 정상 종료 (SIGTERM: docker stop·배포 교체, SIGINT: Ctrl+C).
 * 진행 중인 회차는 WORKER_STOP_GRACE_MS(기본 50초) 안에 끝나기를 기다리고, 넘으면 실패(사용량 차감 없음)로 정리한 뒤 종료한다.
 * 실행 환경의 강제 종료 대기 시간(docker --stop-timeout 등)은 이 값보다 길게 둔다.
 */
function onStop(signal: string) {
  if (life.stopping) return;
  const running = life.requestStop();
  console.log(`[worker] ${signal} 받음 — 새 회차를 받지 않습니다${running ? `. 진행 중 회차 ${running} 마무리 대기` : ""}`);
  if (!running) return; // 대기 중이면 다음 루프에서 바로 빠져나간다
  setTimeout(async () => {
    const still = life.scanId;
    if (still) {
      console.warn(`[worker] 유예 시간 초과 — 회차 ${still} 를 실패로 정리하고 종료`);
      await db
        .update(scan)
        .set({ status: "failed", finishedAt: new Date(), error: "워커가 종료돼 검사가 끝나지 않았습니다. 다시 시작해 주세요. (사용량 차감 없음)" })
        .where(sql`${scan.id} = ${still} and ${scan.status} = 'running'`)
        .catch((e) => console.error("[worker] 종료 정리 실패", scrubLog((e as Error).message)));
    }
    process.exit(0);
  }, stopGraceMs()).unref();
}
process.on("SIGTERM", () => onStop("SIGTERM"));
process.on("SIGINT", () => onStop("SIGINT"));

main();
