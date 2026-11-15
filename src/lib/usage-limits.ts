// 사용 한도 (P1-2)
// 단위: 프로젝트별 사용 한도 + "이번 달(KST) 점검한 서로 다른 화면 수" 사용량. 회차 수·동시 점검은 보조 제한.
//  - 페이지 1개 = 서버 점검에서 실제로 점검을 마친 화면의 주소(쿼리·조각 제외, compare.normalizeUrl)
//  - 같은 달에 같은 페이지를 다시 점검하면 다시 세지 않는다 (재점검 비교를 막지 않기 위해)
//  - 시스템 오류·시간 초과·차단으로 점검하지 못한 화면은 세지 않는다
//  - 점검 시작 때 상한을 예약(원자적)하고, 끝나면 실제로 점검한 새 페이지만 집계 — 집계은 한 번만 된다
//  - 모든 판단은 서버에서. 클라이언트가 보낸 값으로 한도를 정하지 않는다
// 한도 수치는 임시값이다.

import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { normalizeUrl } from "./compare";
import { db, projectLimit, project, scan, scanUsage, type Scan } from "./db";

export type PlanId = "basic" | "extended" | "large";
export interface Plan {
  id: PlanId;
  name: string;
  /** 한 달 동안 점검할 수 있는 서로 다른 화면 수 */
  monthlyPages: number;
  /** 한 회차 최대 화면 수 */
  pagesPerScan: number;
  /** 동시에 대기·진행 중일 수 있는 서버 점검 수 */
  concurrentScans: number;
  /** 하루(KST) 서버 점검 시작 수 */
  scansPerDay: number;
  /** 확장 업로드 하루 화면 수 */
  extDailyScreens: number;
}

export const PLANS: Record<PlanId, Plan> = {
  basic: { id: "basic", name: "기본 한도", monthlyPages: 30, pagesPerScan: 10, concurrentScans: 1, scansPerDay: 3, extDailyScreens: 50 },
  extended: { id: "extended", name: "확장 한도", monthlyPages: 300, pagesPerScan: 40, concurrentScans: 1, scansPerDay: 10, extDailyScreens: 500 },
  large: { id: "large", name: "대용량 한도", monthlyPages: 1000, pagesPerScan: 100, concurrentScans: 2, scansPerDay: 20, extDailyScreens: 1000 },
};

/** 기본 한도는 계정(이메일) 단위로도 묶는다 — 프로젝트를 새로 만들어 한도를 늘리는 것 방지 (GPT 리뷰) */
export const OWNER_DEFAULT = { monthlyPages: 30, projects: 3 };

/** 예약이 이 시간보다 오래 집계되지 않으면(워커 중단 등) 풀어 준다 — 집계하지 않음 */
export const STALE_RESERVATION_MS = 24 * 3600_000;

export function periodOf(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}
function kstDayStart(d = new Date()): Date {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600_000);
}

export function usageKey(url: string): string {
  return normalizeUrl(url);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Q = typeof db | Tx;

export interface ActivePlan {
  plan: Plan;
  validUntil: Date | null;
  projectLimitId: string | null;
}

export async function activePlan(projectId: string, q: Q = db, now = new Date()): Promise<ActivePlan> {
  const [e] = await q
    .select()
    .from(projectLimit)
    .where(and(eq(projectLimit.projectId, projectId), lte(projectLimit.validFrom, now), gt(projectLimit.validUntil, now)))
    .orderBy(desc(projectLimit.createdAt))
    .limit(1);
  const plan = e && e.plan in PLANS ? PLANS[e.plan as PlanId] : PLANS.basic;
  return { plan, validUntil: e?.validUntil ?? null, projectLimitId: e?.id ?? null };
}

export interface UsageStatus extends ActivePlan {
  period: string;
  /** 이번 달 센 화면 수 */
  used: number;
  /** 진행 중인 회차가 잡아 둔 화면 수 */
  held: number;
  remaining: number;
  activeScans: number;
  scansToday: number;
  /** 기본 한도일 때 계정 전체 사용량 (모든 기본 한도 프로젝트 합계) */
  ownerShared: { used: number; held: number; limit: number } | null;
}

async function releaseStale(projectId: string, q: Q) {
  // 집계 안 된 채 끝난 회차(완료·실패) 또는 너무 오래된 예약 → 풀어 줌(집계 없음)
  await q.execute(sql`
    update a11y.scan_usage u set state = 'released', settled_at = now()
    from a11y.scan s
    where u.scan_id = s.id and u.project_id = ${projectId} and u.state = 'reserved'
      and (s.status in ('done', 'failed') or u.created_at < ${new Date(Date.now() - STALE_RESERVATION_MS).toISOString()}::timestamptz)`);
}

export async function usageStatus(projectId: string, q: Q = db, now = new Date()): Promise<UsageStatus> {
  const ap = await activePlan(projectId, q, now);
  const period = periodOf(now);
  // 끝난(완료·실패) 회차나 너무 오래된 예약은 "잡아 둔 화면"으로 세지 않는다 — 다른 프로젝트에 남은 예약이 한도를 막지 않게
  const staleBefore = new Date(now.getTime() - STALE_RESERVATION_MS).toISOString();
  const rows = (await q.execute(sql`
    select
      (select count(*)::int from a11y.usage_page where project_id = ${projectId} and period = ${period}) as used,
      (select coalesce(sum(u.reserved), 0)::int from a11y.scan_usage u join a11y.scan s on s.id = u.scan_id
        where u.project_id = ${projectId} and u.state = 'reserved' and s.status in ('queued', 'running') and u.created_at > ${staleBefore}::timestamptz) as held,
      (select count(*)::int from a11y.scan_usage u join a11y.scan s on s.id = u.scan_id
        where u.project_id = ${projectId} and u.state = 'reserved' and s.status in ('queued', 'running') and u.created_at > ${staleBefore}::timestamptz) as active,
      (select count(*)::int from a11y.scan_usage where project_id = ${projectId} and created_at >= ${kstDayStart(now).toISOString()}::timestamptz) as today`)) as unknown as { used: number; held: number; active: number; today: number }[];
  const r = rows[0];
  let remaining = Math.max(0, ap.plan.monthlyPages - r.used - r.held);
  let ownerShared: UsageStatus["ownerShared"] = null;
  if (ap.plan.id === "basic") {
    const o = (await q.execute(sql`
      select
        (select coalesce(max(pages), 0)::int from a11y.owner_usage where owner_email = p.owner_email and period = ${period}) as used,
        (select coalesce(sum(u.reserved), 0)::int from a11y.scan_usage u join a11y.project p2 on p2.id = u.project_id join a11y.scan s on s.id = u.scan_id
          where p2.owner_email = p.owner_email and u.plan = 'basic' and u.state = 'reserved'
            and s.status in ('queued', 'running') and u.created_at > ${staleBefore}::timestamptz) as held
      from a11y.project p where p.id = ${projectId}`)) as unknown as { used: number; held: number }[];
    ownerShared = { used: o[0]?.used ?? 0, held: o[0]?.held ?? 0, limit: OWNER_DEFAULT.monthlyPages };
    remaining = Math.min(remaining, Math.max(0, ownerShared.limit - ownerShared.used - ownerShared.held));
  }
  return { ...ap, period, used: r.used, held: r.held, remaining, activeScans: r.active, scansToday: r.today, ownerShared };
}

export class LimitError extends Error {
  constructor(public code: "E_CONCURRENT" | "E_DAILY" | "E_MONTHLY" | "E_PROJECTS", message: string) {
    super(message);
  }
}

/**
 * 서버 점검을 예약하고 회차를 만든다. 프로젝트 행을 잠가 같은 프로젝트의 동시 요청을 줄 세운다.
 * 남은 화면이 0이어도 이번 달에 이미 센 페이지가 있으면 "재점검만" 가능한 회차로 연다 (새 페이지 0개).
 */
export async function reserveServerScan(projectId: string, opts: { label?: string; source?: "server" | "browser" } = {}): Promise<{ scan: Scan; reserved: number; pageCap: number }> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(project).where(eq(project.id, projectId)).for("update");
    if (!p) throw new Error("사이트 없음");
    await releaseStale(projectId, tx);
    // 기본 한도이면 계정 원장 행도 잠가 같은 계정의 다른 프로젝트 예약과 줄 세운다 (잠금 순서: 프로젝트 → 계정)
    if ((await activePlan(projectId, tx)).plan.id === "basic") {
      const period = periodOf();
      await tx.execute(sql`insert into a11y.owner_usage (owner_email, period, pages) values (${p.ownerEmail}, ${period}, 0) on conflict do nothing`);
      await tx.execute(sql`select pages from a11y.owner_usage where owner_email = ${p.ownerEmail} and period = ${period} for update`);
    }
    const st = await usageStatus(projectId, tx);
    if (st.activeScans >= st.plan.concurrentScans) throw new LimitError("E_CONCURRENT", `이미 진행 중인 점검이 있습니다 (${st.plan.name}: 동시 ${st.plan.concurrentScans}개). 끝난 뒤 다시 시작해 주세요.`);
    if (st.scansToday >= st.plan.scansPerDay) throw new LimitError("E_DAILY", `오늘 시작할 수 있는 점검 수(${st.plan.scansPerDay}회)를 모두 썼습니다. 내일 다시 시도해 주세요.`);
    const pageCap = Math.min(p.maxPages, st.plan.pagesPerScan);
    const reserved = Math.min(pageCap, st.remaining);
    if (reserved <= 0 && st.used === 0)
      throw new LimitError("E_MONTHLY", st.ownerShared && st.ownerShared.used + st.ownerShared.held >= st.ownerShared.limit ? `이번 달 기본 한도 화면 한도(계정 전체 ${st.ownerShared.limit}개)를 모두 썼습니다.` : `이번 달 점검 화면 한도(${st.plan.monthlyPages}개)를 모두 썼습니다.`);
    if (reserved <= 0 && st.used > 0 && st.held > 0) throw new LimitError("E_MONTHLY", `이번 달 점검 화면 한도(${st.plan.monthlyPages}개)에 도달했습니다. 진행 중인 점검이 끝난 뒤 다시 시도해 주세요.`);
    const [s] = await tx
      .insert(scan)
      .values({ projectId, source: opts.source ?? "server", status: "queued", label: opts.label ?? "자동 점검", progress: { phase: "대기 중", done: 0, total: 0, message: reserved > 0 ? `이번 회차 새 페이지 최대 ${reserved}개` : "이번 달 한도 도달 — 이미 점검한 페이지만 다시 점검합니다" } })
      .returning();
    await tx.insert(scanUsage).values({ scanId: s.id, projectId, period: st.period, plan: st.plan.id, reserved, pageCap });
    return { scan: s, reserved, pageCap };
  });
}

export interface ScanAllowance {
  reserved: number;
  pageCap: number;
  /** 이번 달 이미 센 페이지 키 */
  counted: Set<string>;
}

/** 워커: 회차의 예약을 읽는다. 예약이 없거나 이미 집계된 회차는 null (점검하지 않음) */
export async function scanAllowance(scanId: string): Promise<ScanAllowance | null> {
  const [u] = await db.select().from(scanUsage).where(eq(scanUsage.scanId, scanId));
  if (!u || u.state !== "reserved") return null;
  const rows = (await db.execute(sql`select page_key from a11y.usage_page where project_id = ${u.projectId} and period = ${u.period}`)) as unknown as { page_key: string }[];
  return { reserved: u.reserved, pageCap: u.pageCap, counted: new Set(rows.map((r) => r.page_key)) };
}

/**
 * 점검할 화면을 예약 안에서 고른다: 이미 센 페이지는 자유롭게, 새 페이지는 reserved 개까지, 전체는 pageCap 까지.
 * 순서는 대표 페이지 선택 순서를 따른다.
 */
export function fitToAllowance<T extends { url: string }>(list: T[], a: Pick<ScanAllowance, "reserved" | "pageCap" | "counted">): { keep: T[]; dropped: T[] } {
  const keep: T[] = [];
  const dropped: T[] = [];
  const seenNew = new Set<string>();
  for (const it of list) {
    const k = usageKey(it.url);
    const isNew = !a.counted.has(k) && !seenNew.has(k);
    if (keep.length >= a.pageCap || (isNew && seenNew.size >= a.reserved)) {
      dropped.push(it);
      continue;
    }
    if (isNew) seenNew.add(k);
    keep.push(it);
  }
  return { keep, dropped };
}

/** 집계: 실제로 점검을 마친 화면 중 이번 달 처음인 것만 reserved 개까지 센다. 두 번 불려도 한 번만 반영 */
export async function settleScan(scanId: string, checkedUrls: string[]): Promise<{ counted: number } | null> {
  return db.transaction(async (tx) => {
    const locked = (await tx.execute(sql`select * from a11y.scan_usage where scan_id = ${scanId} for update`)) as unknown as { project_id: string; period: string; reserved: number; state: string; plan: string }[];
    const u = locked[0];
    if (!u || u.state !== "reserved") return null;
    const keys = [...new Set(checkedUrls.map(usageKey))];
    let counted = 0;
    for (const k of keys) {
      if (counted >= u.reserved) break;
      const ins = (await tx.execute(sql`insert into a11y.usage_page (project_id, period, page_key, scan_id) values (${u.project_id}, ${u.period}, ${k}, ${scanId}) on conflict do nothing returning page_key`)) as unknown as unknown[];
      counted += ins.length;
    }
    await tx.update(scanUsage).set({ state: "settled", counted, settledAt: new Date() }).where(eq(scanUsage.scanId, scanId));
    if (u.plan === "basic" && counted > 0) {
      await tx.execute(sql`insert into a11y.owner_usage (owner_email, period, pages)
        select owner_email, ${u.period}, ${counted} from a11y.project where id = ${u.project_id}
        on conflict (owner_email, period) do update set pages = a11y.owner_usage.pages + ${counted}`);
    }
    return { counted };
  });
}

/** 확장 업로드 하루 한도: 환경변수로 덮어쓰기(테스트·운영 비상용), 아니면 사용 한도 값 */
export async function extDailyLimit(projectId: string): Promise<number> {
  if (process.env.EXT_DAILY_LIMIT) return Number(process.env.EXT_DAILY_LIMIT);
  return (await activePlan(projectId)).plan.extDailyScreens;
}

/**
 * 프로젝트 만들기: 별도 한도가 없는 계정(기본 한도)은 프로젝트 OWNER_DEFAULT.projects 개까지.
 * 계정별 advisory 잠금으로 동시 생성도 한도를 넘지 않는다.
 */
export async function createProjectLimited(rawEmail: string, values: Omit<typeof project.$inferInsert, "ownerEmail">) {
  const ownerEmail = rawEmail.trim().toLowerCase(); // 계정 원장·소유 확인과 같은 키 (DB 제약으로도 강제)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"project-create:" + ownerEmail}))`);
    const rows = (await tx.execute(sql`
      select
        (select count(*)::int from a11y.project where owner_email = ${ownerEmail}) as projects,
        (select count(*)::int from a11y.project_limit e join a11y.project p on p.id = e.project_id
          where p.owner_email = ${ownerEmail} and e.plan <> 'basic' and e.valid_from <= now() and e.valid_until > now()) as paid`)) as unknown as { projects: number; paid: number }[];
    if (rows[0].paid === 0 && rows[0].projects >= OWNER_DEFAULT.projects) {
      throw new LimitError("E_PROJECTS", `기본 한도는 사이트 ${OWNER_DEFAULT.projects}개까지 만들 수 있습니다. 쓰지 않는 사이트를 지우거나 다른 사이트를 다시 점검해 주세요.`);
    }
    // 새 사이트는 점검노트 항목 판정(AI)을 기본으로 켠다. 끄면 규칙 판정만 쓴다 (lib/ai/item-judge.ts)
    const [p] = await tx.insert(project).values({ aiEnabled: true, ...values, ownerEmail }).returning();
    return p;
  });
}
