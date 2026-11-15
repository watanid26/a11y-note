// DB 마이그레이션 사전 검사 (P1-8)
//  1) 저장소: drizzle/meta/_journal.json 과 SQL 파일이 1:1 인지
//  2) 빈 임시 DB 에 처음부터 적용 → 다시 적용(중복 적용 시 변화 없음) → 표마다 행 보안(RLS) 켜짐, 워커 역할 권한이 기대와 같음 → 임시 DB 삭제
//  3) (선택) --target: 운영 DB 에 아직 적용 안 된 마이그레이션 목록만 보여 줌 (적용은 하지 않음)
// 실행: ADMIN_DATABASE_URL=postgresql://<createdb 권한 계정>@host/postgres npx tsx scripts/migrate-check.ts [--target]
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const problems: string[] = [];
const ok = (m: string) => console.log(`PASS  ${m}`);
const fail = (m: string) => (problems.push(m), console.log(`FAIL  ${m}`));

// 워커 역할이 가져야 할 권한 (이보다 많거나 적으면 실패) — P0-2 최소 권한
const WORKER_GRANTS: Record<string, string[]> = {
  project: ["SELECT"],
  scan: ["SELECT", "UPDATE"],
  page_state: ["INSERT", "SELECT"],
  finding: ["INSERT", "SELECT", "UPDATE"],
  flow: ["INSERT", "SELECT", "UPDATE"],
  ai_usage: ["INSERT", "SELECT", "UPDATE"],
  item_decision: ["SELECT"],
  scan_usage: ["SELECT", "UPDATE"],
  usage_page: ["INSERT", "SELECT"],
  owner_usage: ["INSERT", "SELECT", "UPDATE"],
  // AI 검수 이력은 쌓기만 한다 (0020)
  finding_verification: ["INSERT", "SELECT"],
  // 자동 결과 원본(통과·해당 없음·환경)과 기준 외 참고도 쌓기만 한다 (0022)
  page_evidence: ["INSERT", "SELECT"],
  unmapped_reference: ["INSERT", "SELECT"],
};

function journal(): string[] {
  const j = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  return j.entries.map((e) => e.tag);
}

function migrate(url: string) {
  execFileSync("npx", ["drizzle-kit", "migrate"], { env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url }, stdio: "pipe" });
}

async function main() {
  const tags = journal();
  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
  if (JSON.stringify(tags) === JSON.stringify(files)) ok(`저장소: 마이그레이션 ${tags.length}개, 기록과 파일 일치`);
  else fail(`저장소: 기록(${tags.length})과 SQL 파일(${files.length})이 다름`);

  const admin = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL!;
  const name = `a11ynote_migcheck_${Date.now()}`;
  const a = postgres(admin, { max: 1, onnotice: () => {} });
  await a.unsafe(`create database ${name}`);
  const u = new URL(admin);
  u.pathname = `/${name}`;
  const url = u.toString();
  const t = postgres(url, { max: 1, onnotice: () => {} });
  try {
    migrate(url);
    const [{ n: n1 }] = await t`select count(*)::int n from a11y.__drizzle_migrations`;
    n1 === tags.length ? ok(`빈 DB 에 처음부터 적용: ${n1}개`) : fail(`빈 DB 적용 수 ${n1} ≠ ${tags.length}`);
    migrate(url);
    const [{ n: n2 }] = await t`select count(*)::int n from a11y.__drizzle_migrations`;
    n2 === n1 ? ok("다시 적용해도 변화 없음 (중복 적용 안전)") : fail(`두 번째 적용에서 ${n2 - n1}개가 또 적용됨`);

    const noRls = await t`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'a11y' and c.relkind = 'r' and c.relname <> '__drizzle_migrations' and not c.relrowsecurity`;
    noRls.length === 0 ? ok("a11y 의 모든 표에 행 보안(RLS) 켜짐") : fail(`행 보안 꺼진 표: ${noRls.map((r) => r.relname).join(", ")}`);

    const grants = await t`select table_name, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where grantee = 'a11y_worker' and table_schema = 'a11y' group by table_name`;
    const got = Object.fromEntries(grants.map((g) => [g.table_name as string, (g.p as string).split(",")]));
    const want = WORKER_GRANTS;
    const diff = [...new Set([...Object.keys(got), ...Object.keys(want)])].filter((k) => (got[k] ?? []).join() !== (want[k] ?? []).join());
    diff.length === 0 ? ok("워커 역할 권한이 기대값과 정확히 같음") : fail(`워커 권한 차이: ${diff.map((k) => `${k}: 실제 ${got[k] ?? "없음"} / 기대 ${want[k] ?? "없음"}`).join("; ")}`);

    const noPolicy = await t`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'a11y' and c.relkind = 'r' and c.relname = any(${Object.keys(want)})
        and not exists (select 1 from pg_policies p where p.schemaname = 'a11y' and p.tablename = c.relname and 'a11y_worker' = any(p.roles))`;
    noPolicy.length === 0 ? ok("워커 권한이 있는 표마다 워커 정책 있음") : fail(`워커 정책 없는 표(워커에게 0행으로 보임): ${noPolicy.map((r) => r.relname).join(", ")}`);
  } catch (e) {
    fail(`적용 실패: ${(e as Error).message.slice(0, 300)}`);
  } finally {
    await t.end();
    await a.unsafe(`drop database if exists ${name} with (force)`);
    await a.end();
  }

  if (process.argv.includes("--target")) {
    const target = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const rows = await target`select count(*)::int n from a11y.__drizzle_migrations`.catch(() => [{ n: 0 }]);
    const applied = rows[0].n as number;
    const pending = tags.slice(applied);
    console.log(pending.length ? `대상 DB 에 적용할 마이그레이션 ${pending.length}개: ${pending.join(", ")}` : "대상 DB 는 최신입니다.");
    await target.end();
  }
  console.log(problems.length ? `마이그레이션 검사 실패 ${problems.length}건` : "마이그레이션 검사 통과");
  process.exit(problems.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
