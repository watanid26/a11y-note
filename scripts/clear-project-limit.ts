// 운영자 전용: 사용 한도 회수 (지금 시각으로 만료). 데이터는 그대로 두고 기본 한도로 돌아간다.
// 실행: npx tsx scripts/clear-project-limit.ts <프로젝트 id> [사유]
import "dotenv/config";
import os from "node:os";
import { and, eq, gt } from "drizzle-orm";
import { db, projectLimit } from "../src/lib/db";
import { usageStatus } from "../src/lib/usage-limits";

(async () => {
  const [projectId, ...why] = process.argv.slice(2);
  if (!projectId) {
    console.error("사용법: npx tsx scripts/clear-project-limit.ts <프로젝트 id> [사유]");
    process.exit(2);
  }
  const now = new Date();
  const rows = await db
    .update(projectLimit)
    .set({ validUntil: now, note: `회수 ${now.toISOString()} by operator:${os.userInfo().username}${why.length ? ` — ${why.join(" ")}` : ""}` })
    .where(and(eq(projectLimit.projectId, projectId), gt(projectLimit.validUntil, now)))
    .returning();
  const st = await usageStatus(projectId);
  console.log(`회수한 사용 한도 ${rows.length}개. 지금 적용: ${st.plan.name} (이번 달 ${st.used}/${st.plan.monthlyPages})`);
  process.exit(0);
})();
