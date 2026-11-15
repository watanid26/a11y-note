// 운영 관측 (P1-8): 경보 조건을 한곳에서 계산한다. 내부 상태 경로와 scripts/ops-status.ts --check 가 함께 쓴다.
import { sql } from "drizzle-orm";
import { db } from "../db";

export const THRESHOLDS = {
  heartbeatMin: 15, // 워커 신호가 이보다 오래 없으면 경보
  queuedMin: 30, // 대기 회차가 이보다 오래 대기하면 경보
  cleanupHours: 48, // 캡처 정리가 이보다 오래 성공하지 않으면 경보
  failedPerDay: 3, // 하루 실패 회차가 이 이상이면 경보
  aiBudgetRatio: 0.8, // 하루 AI 예산의 이 비율 이상 쓰면 경보
};

export interface OpsSnapshot {
  heartbeatAgeMin: number | null;
  /** 최근 heartbeatMin 분 안에 신호를 보낸 워커 수 (worker id 기준, 예전 워커는 1대로 셈) */
  workersAlive: number;
  /** 서버 점검 대기열: 대기 · 처리 중 회차 수 */
  queue: { queued: number; running: number };
  oldestQueuedMin: number | null;
  cleanupOkAgeHours: number | null;
  cleanupLastFailed: boolean;
  failed24h: number;
  aiCostToday: number;
  aiBudget: number | null;
  alerts: string[];
}

export async function opsSnapshot(now = new Date()): Promise<OpsSnapshot> {
  const rows = (await db.execute(sql`
    select
      (select extract(epoch from (${now.toISOString()}::timestamptz - max(created_at))) / 60 from a11y.ops_log where job = 'worker-heartbeat') as hb,
      (select extract(epoch from (${now.toISOString()}::timestamptz - min(created_at))) / 60 from a11y.scan where status = 'queued' and source = 'server') as queued,
      (select count(distinct coalesce(detail->>'worker', '-'))::int from a11y.ops_log where job = 'worker-heartbeat' and created_at > ${now.toISOString()}::timestamptz - make_interval(mins => ${THRESHOLDS.heartbeatMin})) as workers,
      (select count(*)::int from a11y.scan where status = 'queued' and source = 'server') as queued_n,
      (select count(*)::int from a11y.scan where status = 'running' and source = 'server') as running_n,
      (select extract(epoch from (${now.toISOString()}::timestamptz - max(created_at))) / 3600 from a11y.ops_log where job = 'shot-retention' and ok) as cleanup,
      (select not ok from a11y.ops_log where job = 'shot-retention' order by created_at desc limit 1) as cleanup_failed,
      (select count(*)::int from a11y.scan where status = 'failed' and created_at > ${now.toISOString()}::timestamptz - interval '24 hours') as failed,
      (select coalesce(sum(cost_usd), 0)::float from a11y.ai_usage where day = (${now.toISOString()}::timestamptz at time zone 'Asia/Seoul')::date) as ai`)) as unknown as Record<string, number | boolean | null>[];
  const r = rows[0];
  const num = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  const budget = process.env.AI_DAILY_BUDGET_USD ? Number(process.env.AI_DAILY_BUDGET_USD) : null;
  const s: OpsSnapshot = {
    heartbeatAgeMin: num(r.hb),
    workersAlive: Number(r.workers ?? 0),
    queue: { queued: Number(r.queued_n ?? 0), running: Number(r.running_n ?? 0) },
    oldestQueuedMin: num(r.queued),
    cleanupOkAgeHours: num(r.cleanup),
    cleanupLastFailed: Boolean(r.cleanup_failed),
    failed24h: Number(r.failed),
    aiCostToday: Number(r.ai),
    aiBudget: budget,
    alerts: [],
  };
  const T = THRESHOLDS;
  if (s.heartbeatAgeMin === null || s.heartbeatAgeMin > T.heartbeatMin) s.alerts.push(`워커 신호 없음 (${s.heartbeatAgeMin === null ? "기록 없음" : `${s.heartbeatAgeMin}분 전`}) — 워커가 멈췄거나 격리 점검에서 시작을 거부했을 수 있음`);
  if (s.oldestQueuedMin !== null && s.oldestQueuedMin > T.queuedMin) s.alerts.push(`점검 대기 ${s.oldestQueuedMin}분 — 워커 처리 지연`);
  if (s.cleanupOkAgeHours === null || s.cleanupOkAgeHours > T.cleanupHours) s.alerts.push(`캡처 보관기간 정리가 ${T.cleanupHours}시간 넘게 성공하지 않음`);
  if (s.cleanupLastFailed) s.alerts.push("마지막 캡처 정리 실패");
  if (s.failed24h >= T.failedPerDay) s.alerts.push(`최근 24시간 실패 회차 ${s.failed24h}건`);
  if (budget && s.aiCostToday >= budget * T.aiBudgetRatio) s.alerts.push(`오늘 AI 비용 $${s.aiCostToday.toFixed(2)} (예산 $${budget}의 ${Math.round((s.aiCostToday / budget) * 100)}%)`);
  return s;
}
