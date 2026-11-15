// 회차 하나를 지금 프로세스의 DATABASE_URL 권한으로 처리 (워커 역할 검증용)
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pageState } from "../src/lib/db";
import { processPending } from "../src/lib/ai/judge";
import { runSiteScan } from "../worker/site-scan";

async function main() {
  const id = process.argv[2];
  await runSiteScan(id);
  while ((await processPending(100)) > 0) { /* */ }
  const rows = await db.select().from(pageState).where(eq(pageState.scanId, id));
  console.log(`WORKER_OK pages=${rows.length}`);
  process.exit(0);
}
main().catch((e) => {
  console.error("WORKER_FAIL", (e as Error).message);
  process.exit(1);
});
