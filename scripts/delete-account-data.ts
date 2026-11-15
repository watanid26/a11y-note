// 운영자 전용: 계정 삭제 요청 처리 — 그 계정의 모든 프로젝트·회차·화면·발견 사항·캡처 파일·계정 사용량 원장 삭제.
// 실행: npx tsx scripts/delete-account-data.ts <이메일> --confirm <이메일 다시>
// 백업 덤프에 남은 사본은 백업 보관 기간이 지나면 지워진다 (docs/ops-procedures.md 에 안내).
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, project } from "../src/lib/db";
import { deleteProjectData } from "../src/lib/privacy";

(async () => {
  const [raw, flag, again] = process.argv.slice(2);
  const email = (raw ?? "").trim().toLowerCase();
  if (!email || flag !== "--confirm" || (again ?? "").trim().toLowerCase() !== email) {
    console.error("사용법: npx tsx scripts/delete-account-data.ts <이메일> --confirm <이메일 다시>");
    process.exit(2);
  }
  const list = await db.select().from(project).where(eq(project.ownerEmail, email));
  let shots = 0;
  for (const p of list) shots += (await deleteProjectData(p.id)).shots;
  await db.execute(sql`delete from a11y.owner_usage where owner_email = ${email}`);
  const left = await db.select().from(project).where(eq(project.ownerEmail, email));
  console.log(`삭제: 프로젝트 ${list.length}개, 캡처 파일 ${shots}개, 계정 사용량 원장. 남은 프로젝트 ${left.length}개`);
  process.exit(left.length ? 1 : 0);
})();
