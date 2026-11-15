// 운영자 전용: 계정 이메일 변경(소유 이전). 이메일이 소유 키이므로 이 절차로만 바꾼다.
// 확인 절차(docs/ops-procedures.md 6절)를 먼저 끝낸 뒤 실행: 두 이메일 모두로 로그인 확인, 기존 이메일에서 요청.
// 한 트랜잭션에서 프로젝트 소유와 계정 사용량 원장을 함께 옮기고(원장은 합산), 운영 기록에는 이메일 해시만 남긴다.
// 실행: npx tsx scripts/transfer-account.ts <기존 이메일> <새 이메일> --confirm <새 이메일 다시>
import "dotenv/config";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, opsLog } from "../src/lib/db";

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 12);

(async () => {
  const [a, b, flag, again] = process.argv.slice(2);
  const from = norm(a);
  const to = norm(b);
  if (!from || !to || from === to || flag !== "--confirm" || norm(again) !== to || !/^[^@\s]+@[^@\s]+$/.test(to)) {
    console.error("사용법: npx tsx scripts/transfer-account.ts <기존 이메일> <새 이메일> --confirm <새 이메일 다시>");
    process.exit(2);
  }
  const r = await db.transaction(async (tx) => {
    // 두 계정의 프로젝트 생성·예약과 겹치지 않게 잠근다 (같은 잠금 키를 usage-limits 에서도 씀)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"project-create:" + from}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"project-create:" + to}))`);
    const moved = (await tx.execute(sql`update a11y.project set owner_email = ${to} where owner_email = ${from} returning id`)) as unknown as unknown[];
    await tx.execute(sql`insert into a11y.owner_usage (owner_email, period, pages)
      select ${to}, period, pages from a11y.owner_usage where owner_email = ${from}
      on conflict (owner_email, period) do update set pages = a11y.owner_usage.pages + excluded.pages`);
    await tx.execute(sql`delete from a11y.owner_usage where owner_email = ${from}`);
    await tx.insert(opsLog).values({ job: "account-transfer", ok: true, detail: { from: h(from), to: h(to), projects: moved.length } });
    return moved.length;
  });
  console.log(`옮긴 프로젝트 ${r}개 (계정 사용량 원장 합산). 운영 기록에는 이메일 해시만 남김.`);
  process.exit(0);
})();
