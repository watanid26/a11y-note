// 운영 상태 확인: 최근 운영 작업(보관기간 정리) 결과, 실패한 검사 회차, AI 사용량
//   npx tsx scripts/ops-status.ts          상태 출력
//   npx tsx scripts/ops-status.ts --check  경보가 있으면 종료 코드 2 (cron·감시 도구에서 알림용)
import "dotenv/config";
import { opsSnapshot } from "../src/lib/ops/health";
import { desc, eq } from "drizzle-orm";
import { aiUsage, db, opsLog, scan } from "../src/lib/db";
(async () => {
  const snap = await opsSnapshot();
  if (process.argv.includes("--check")) {
    for (const a of snap.alerts) console.log(`ALERT  ${a}`);
    console.log(snap.alerts.length ? `경보 ${snap.alerts.length}건` : "정상");
    process.exit(snap.alerts.length ? 2 : 0);
  }
  console.log("== 요약", JSON.stringify({ ...snap, alerts: undefined }));
  for (const a of snap.alerts) console.log(`!! ${a}`);
  const logs = await db.select().from(opsLog).orderBy(desc(opsLog.createdAt)).limit(10);
  console.log("== 운영 작업 (최근 10)");
  for (const l of logs) console.log(`${l.createdAt.toISOString()}  ${l.job}  ${l.ok ? "성공" : "실패"}  ${JSON.stringify(l.detail)}`);
  const lastOk = logs.find((l) => l.job === "shot-retention" && l.ok);
  if (!lastOk || Date.now() - lastOk.createdAt.getTime() > 2 * 86400_000) console.log("!! 캡처 보관기간 정리가 2일 넘게 성공하지 않았습니다. 워커·WORKER_APP_URL 을 확인하세요.");
  const failed = await db.select().from(scan).where(eq(scan.status, "failed")).orderBy(desc(scan.createdAt)).limit(10);
  console.log(`== 실패한 검사 회차 (최근 ${failed.length})`);
  for (const s of failed) console.log(`${s.createdAt.toISOString()}  ${s.id}  ${s.error ?? ""}`);
  const usage = await db.select().from(aiUsage).orderBy(desc(aiUsage.day)).limit(7);
  console.log("== AI 사용량 (최근 7일)");
  for (const u of usage) console.log(`${u.day}  호출 ${u.calls}  $${u.costUsd}`);
  process.exit(0);
})();
