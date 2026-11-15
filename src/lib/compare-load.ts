// 재점검 비교 자료를 DB 에서 모은다 (읽기 전용). 두 회차 모두 같은 소유자·같은 프로젝트여야 한다.
import { and, desc, eq, lt, ne } from "drizzle-orm";
import type { AuthUser } from "./auth/session";
import { ownedScan } from "./auth/session";
import { compareScans, type CompareResult } from "./compare";
import { db, scan, type Scan } from "./db";
import { loadScanView, type ScanView } from "./scan-view";
import { dateKst } from "./report/data";
import type { RescanSummary } from "./report/docx";

/** 기본 비교 대상: 같은 프로젝트에서 이 회차보다 먼저 끝난 회차 (같은 점검 방식 우선) */
export async function defaultBase(next: Scan): Promise<Scan | null> {
  const earlier = await db
    .select()
    .from(scan)
    .where(and(eq(scan.projectId, next.projectId), eq(scan.status, "done"), lt(scan.createdAt, next.createdAt), ne(scan.id, next.id)))
    .orderBy(desc(scan.createdAt))
    .limit(20);
  return earlier.find((s) => s.source === next.source) ?? earlier[0] ?? null;
}

export type CompareLoad =
  | { ok: true; base: ScanView; next: ScanView; result: CompareResult; candidates: Scan[] }
  | { ok: false; status: 404 | 409; error: string; candidates?: Scan[] };

export async function loadCompare(user: AuthUser, nextId: string, baseId?: string | null): Promise<CompareLoad> {
  const next = await ownedScan(user, nextId);
  if (!next) return { ok: false, status: 404, error: "없음" };
  const candidates = await db
    .select()
    .from(scan)
    .where(and(eq(scan.projectId, next.project.id), ne(scan.id, next.scan.id)))
    .orderBy(desc(scan.createdAt))
    .limit(50);
  let baseScan: Scan | null;
  if (baseId) {
    const b = await ownedScan(user, baseId);
    // 다른 프로젝트 회차는 존재 여부도 알려 주지 않는다
    if (!b || b.project.id !== next.project.id) return { ok: false, status: 404, error: "없음" };
    baseScan = b.scan;
  } else {
    baseScan = await defaultBase(next.scan);
  }
  if (!baseScan) return { ok: false, status: 409, error: "비교할 이전 회차가 없습니다.", candidates };
  const [base, nextView] = await Promise.all([loadScanView(baseScan, next.project), loadScanView(next.scan, next.project)]);
  const result = compareScans(base, nextView);
  return { ok: true, base, next: nextView, result, candidates };
}

/** 보고서용 재점검 요약: 같은 프로젝트의 직전 회차와 비교한 해결·남음·새로 생김 (없으면 null) */
export async function rescanSummary(v: ScanView): Promise<RescanSummary | null> {
  const baseScan = await defaultBase(v.scan);
  if (!baseScan) return null;
  const base = await loadScanView(baseScan, v.project);
  const r = compareScans(base, v);
  return { baseDate: dateKst(baseScan.createdAt), resolved: r.counts.resolved, persisting: r.counts.persisting + r.counts.changed, added: r.counts.new, warnings: r.warnings };
}
