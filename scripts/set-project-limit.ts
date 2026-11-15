// 운영자 전용: 프로젝트의 사용 한도를 바꾼다. 웹에는 변경 화면이 없다.
// 실행: npx tsx scripts/set-project-limit.ts <프로젝트 id> <basic|extended|large> <일수> [메모]
import "dotenv/config";
import os from "node:os";
import { eq } from "drizzle-orm";
import { db, projectLimit, project } from "../src/lib/db";
import { PLANS, usageStatus, type PlanId } from "../src/lib/usage-limits";

async function main() {
  const [projectId, plan, daysRaw, ...note] = process.argv.slice(2);
  const days = Number(daysRaw);
  if (!projectId || !(plan in PLANS) || !Number.isInteger(days) || days < 1 || days > 400) {
    console.error("사용법: npx tsx scripts/set-project-limit.ts <프로젝트 id> <basic|extended|large> <일수 1~400> [메모]");
    process.exit(2);
  }
  const [p] = await db.select().from(project).where(eq(project.id, projectId));
  if (!p) throw new Error("프로젝트 없음");
  const now = new Date();
  const [e] = await db.insert(projectLimit).values({ projectId, plan: plan as PlanId, validFrom: now, validUntil: new Date(now.getTime() + days * 86400_000), grantedBy: `operator:${os.userInfo().username}`, note: note.join(" ") || null }).returning();
  const st = await usageStatus(projectId);
  console.log(`부여: ${p.name} (${p.ownerEmail}) → ${PLANS[plan as PlanId].name}, ${e.validUntil.toISOString()} 까지. 이번 달 ${st.used}/${st.plan.monthlyPages}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
