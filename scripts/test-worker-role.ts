// P0-2: 워커 전용 DB 역할(a11y_worker)로 검사가 정상 동작하고, 그 밖의 작업은 거부되는지 확인.
// 준비: drizzle/0002_worker_role.sql 적용 + ALTER ROLE a11y_worker LOGIN PASSWORD '...'
// 실행: WORKER_DATABASE_URL=postgresql://a11y_worker:pw@localhost:5432/a11ynote npx tsx scripts/test-worker-role.ts
import "dotenv/config";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const adminUrl = process.env.DATABASE_URL!;
const workerUrl = process.env.WORKER_DATABASE_URL!;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : String(detail).slice(0, 200));
  if (!ok) process.exitCode = 1;
}

async function denied(sql: postgres.Sql, q: string): Promise<boolean> {
  try {
    await sql.unsafe(q);
    return false;
  } catch (e) {
    return /permission denied|must be owner|must be superuser|must have/i.test(String((e as Error).message));
  }
}

async function main() {
  const admin = postgres(adminUrl, { max: 1 });
  const worker = postgres(workerUrl, { max: 1 });
  const [p] = await admin`insert into a11y.project (owner_email, name, base_url, max_pages, upload_token_hash) values ('role-test@local', 'role', 'http://localhost:4400/', 3, ${"b".repeat(64)}) returning id`;
  const [s] = await admin`insert into a11y.scan (project_id, source, status) values (${p.id}, 'server', 'running') returning id`;
  try {
    // 워커 역할로 실제 검사 + AI 대기 처리 (별도 프로세스, DATABASE_URL 만 워커 계정)
    const out = execFileSync("npx", ["tsx", "scripts/worker-once.ts", s.id], { env: { ...process.env, DATABASE_URL: workerUrl, ANTHROPIC_API_KEY: "" }, encoding: "utf8", timeout: 240_000 });
    check("워커 역할로 서버 검사·규칙 판정 정상 완료", /WORKER_OK pages=[1-9]/.test(out), out.slice(-300));
    const [{ n }] = await admin`select count(*)::int as n from a11y.page_state where scan_id = ${s.id}`;
    check("검사 결과가 저장됨", n > 0, n);

    check("프로젝트 만들기 거부", await denied(worker, `insert into a11y.project (owner_email, name, base_url) values ('x','x','http://x')`));
    check("프로젝트 수정 거부 (업로드 키 바꾸기 등)", await denied(worker, `update a11y.project set name = 'x'`));
    check("프로젝트 삭제 거부", await denied(worker, `delete from a11y.project`));
    check("발견 사항 삭제 거부", await denied(worker, `delete from a11y.finding`));
    check("사람 결정(항목 단위) 쓰기 거부", await denied(worker, `insert into a11y.item_decision (scan_id, item_code, status, decided_by) values ('${s.id}', '5.1.1', 'pass', 'w')`));
    check("표 삭제 거부", await denied(worker, `drop table a11y.finding`));
    check("다른 스키마(public) 표 만들기 거부", await denied(worker, `create table public.x (id int)`));
    check("a11y 스키마에 표 만들기 거부", await denied(worker, `create table a11y.x (id int)`));
    check("역할 권한 올리기 거부", await denied(worker, `alter role a11y_worker superuser`));
  } finally {
    await admin`delete from a11y.project where id = ${p.id}`;
    await admin.end();
    await worker.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
