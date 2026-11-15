// 통합 점검 묶음 자료를 DB 에서 모은다 (읽기 전용). 묶는 회차는 모두 같은 소유자·같은 프로젝트여야 한다.
import { and, desc, eq, inArray } from "drizzle-orm";
import { buildProjectBundle, pickBundleScans, type ProjectBundle } from "./bundle";
import { db, scan, type Project } from "./db";
import { loadScanView } from "./scan-view";

export const BUNDLE_MAX_SCANS = 6;

export type BundleLoad = { ok: true; bundle: ProjectBundle } | { ok: false; status: 400 | 404 | 409; error: string };

/** p 는 호출하는 쪽에서 소유 확인(ownedProject)을 마친 프로젝트. scanIds 를 주지 않으면 출처마다 가장 최근에 끝난 회차 하나씩 묶는다 */
export async function loadProjectBundle(p: Project, scanIds?: string[] | null): Promise<BundleLoad> {
  if (scanIds && scanIds.length > BUNDLE_MAX_SCANS) return { ok: false, status: 400, error: `회차는 ${BUNDLE_MAX_SCANS}개까지 묶을 수 있습니다.` };
  if (scanIds?.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return { ok: false, status: 404, error: "없음" };
  const scans = scanIds?.length
    ? await db.select().from(scan).where(and(eq(scan.projectId, p.id), inArray(scan.id, scanIds)))
    : await db.select().from(scan).where(eq(scan.projectId, p.id)).orderBy(desc(scan.createdAt)).limit(200);
  let ids: string[];
  if (scanIds?.length) {
    const mine = new Map(scans.map((s) => [s.id, s]));
    // 다른 프로젝트·남의 회차는 존재 여부도 알려 주지 않는다
    if (scanIds.some((id) => !mine.has(id))) return { ok: false, status: 404, error: "없음" };
    if (scanIds.some((id) => mine.get(id)!.status !== "done")) return { ok: false, status: 409, error: "끝난 회차만 묶을 수 있습니다." };
    ids = [...new Set(scanIds)];
  } else {
    ids = pickBundleScans(scans);
  }
  if (!ids.length) return { ok: false, status: 409, error: "묶을 수 있는 끝난 회차가 없습니다." };
  const byId = new Map(scans.map((s) => [s.id, s]));
  const views = await Promise.all(ids.map((id) => loadScanView(byId.get(id)!, p)));
  return { ok: true, bundle: buildProjectBundle(views) };
}
