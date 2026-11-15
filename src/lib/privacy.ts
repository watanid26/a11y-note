// 개인정보 보관·삭제 (P0-9). 웹 앱에서만 실행한다 (저장소 삭제 권한 필요).
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db, pageState, project, scan } from "./db";
import { deleteShots } from "./storage";

/** 캡처 보관 일수 */
export const SHOT_RETENTION_DAYS = Number(process.env.SHOT_RETENTION_DAYS ?? 90);

/** 보관기간이 지난 캡처 파일을 지우고 기록을 남긴다. 발견 사항·점검표 결과는 그대로 둔다 */
export async function purgeExpiredShots(now = new Date(), batch = 500): Promise<number> {
  const cutoff = new Date(now.getTime() - SHOT_RETENTION_DAYS * 86400_000);
  let total = 0;
  for (;;) {
    const rows = await db
      .select({ id: pageState.id, key: pageState.screenshotKey })
      .from(pageState)
      .where(and(isNotNull(pageState.screenshotKey), lt(pageState.createdAt, cutoff)))
      .limit(batch);
    if (!rows.length) break;
    await deleteShots(rows.map((r) => r.key!));
    await db.update(pageState).set({ screenshotKey: null, screenshotDeletedAt: now }).where(inArray(pageState.id, rows.map((r) => r.id)));
    total += rows.length;
    if (rows.length < batch) break;
  }
  return total;
}

/** 프로젝트와 모든 회차·화면·발견 사항·캡처 파일 삭제 */
export async function deleteProjectData(projectId: string): Promise<{ shots: number }> {
  const keys = await db
    .select({ key: pageState.screenshotKey })
    .from(pageState)
    .innerJoin(scan, eq(scan.id, pageState.scanId))
    .where(and(eq(scan.projectId, projectId), isNotNull(pageState.screenshotKey)));
  const shots = await deleteShots(keys.map((k) => k.key!));
  await db.delete(project).where(eq(project.id, projectId)); // 회차·화면·발견 사항·흐름·한도 기록은 연쇄 삭제
  return { shots };
}

/** 화면 하나(개인정보가 찍힌 캡처 등)와 그 발견 사항 삭제 */
export async function deletePageData(pageId: string): Promise<void> {
  const [row] = await db.select({ key: pageState.screenshotKey }).from(pageState).where(eq(pageState.id, pageId));
  if (row?.key) await deleteShots([row.key]);
  await db.delete(pageState).where(eq(pageState.id, pageId)); // 발견 사항 연쇄 삭제
}
