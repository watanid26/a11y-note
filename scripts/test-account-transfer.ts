// 계정 이메일 이전(scripts/transfer-account.ts) 확인. 실행: npx tsx scripts/test-account-transfer.ts
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { eq, like, sql } from "drizzle-orm";
import { db, project } from "../src/lib/db";
import { createProjectLimited, periodOf } from "../src/lib/usage-limits";
import { issueUploadToken } from "../src/lib/tokens";
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
(async () => {
  const A = `tr-a-${Date.now()}@local`;
  const B = `tr-b-${Date.now()}@local`;
  try {
    await createProjectLimited(A, { name: "a1", baseUrl: "https://example.com/", ...issueUploadToken().fields });
    await createProjectLimited(B, { name: "b1", baseUrl: "https://example.com/", ...issueUploadToken().fields });
    await db.execute(sql`insert into a11y.owner_usage values (${A}, ${periodOf()}, 7), (${B}, ${periodOf()}, 5)`);
    const bad = spawnSync("npx", ["tsx", "scripts/transfer-account.ts", A, B, "--confirm", "other@x.com"], { encoding: "utf8" });
    check("확인 이메일이 다르면 거부, 아무것도 안 바뀜", bad.status === 2 && (await db.select().from(project).where(eq(project.ownerEmail, A))).length === 1);
    const r = spawnSync("npx", ["tsx", "scripts/transfer-account.ts", A, B.toUpperCase(), "--confirm", B], { encoding: "utf8" });
    const pa = await db.select().from(project).where(eq(project.ownerEmail, A));
    const pb = await db.select().from(project).where(eq(project.ownerEmail, B));
    const led = (await db.execute(sql`select owner_email, pages from a11y.owner_usage where owner_email in (${A}, ${B})`)) as unknown as { owner_email: string; pages: number }[];
    const log = (await db.execute(sql`select detail::text d from a11y.ops_log where job = 'account-transfer' order by created_at desc limit 1`)) as unknown as { d: string }[];
    check("이전: 프로젝트 이동(대문자 입력도 정규화), 계정 원장 합산 12", r.status === 0 && pa.length === 0 && pb.length === 2 && led.length === 1 && led[0].owner_email === B && led[0].pages === 12, { out: r.stdout + r.stderr, pa: pa.length, pb: pb.length, led });
    check("운영 기록에는 이메일 대신 해시만", Boolean(log[0]) && !log[0].d.includes("@"), log[0]);
  } finally {
    await db.delete(project).where(like(project.ownerEmail, "tr-%@local"));
    await db.execute(sql`delete from a11y.owner_usage where owner_email like 'tr-%@local'`);
  }
  process.exit();
})();
