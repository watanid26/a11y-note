// 워커가 저장소 서버 키 없이 동작하는지 + 내부 캡처 경로 방어 (GPT 리뷰: service_role 우회 경로 제거)
// 실행: WORKER_SHARED_SECRET=<32자 이상> 로 웹 서버 실행 후
//   WORKER_SHARED_SECRET=같은값 WORKER_DATABASE_URL=... npx tsx scripts/test-worker-no-service-key.ts
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import sharp from "sharp";

const BASE = "http://localhost:3200";
const SECRET = process.env.WORKER_SHARED_SECRET!;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

async function main() {
  const admin = postgres(process.env.DATABASE_URL!, { max: 1 });
  const worker = postgres(process.env.WORKER_DATABASE_URL!, { max: 1 });
  const [role] = await admin`select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, (select count(*)::int from pg_auth_members m where m.member = r.oid) as memberships from pg_roles r where rolname = 'a11y_worker'`;
  check("워커 DB 역할: 슈퍼유저·행 보안 우회·역할/DB 생성 권한 없음, 다른 역할 소속 없음", !role.rolsuper && !role.rolbypassrls && !role.rolcreaterole && !role.rolcreatedb && role.memberships === 0, role);
  check("워커 역할로 auth 스키마(로그인 사용자 표) 접근 불가", await worker`select 1 from auth.users limit 1`.then(() => false, () => true));

  const [p] = await admin`insert into a11y.project (owner_email, name, base_url, max_pages) values ('nokey@local', 'nokey', 'http://localhost:4400/', 2) returning id`;
  const [s] = await admin`insert into a11y.scan (project_id, source, status) values (${p.id}, 'server', 'running') returning id`;
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.WORKER_DATABASE_URL, WORKER_APP_URL: BASE, WORKER_SHARED_SECRET: SECRET, ANTHROPIC_API_KEY: "" };
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.SUPABASE_SECRET_KEY;
    const out = execFileSync("npx", ["tsx", "scripts/worker-once.ts", s.id], { env, encoding: "utf8", timeout: 240_000 });
    check("서버 키 없이 워커 검사 완료", /WORKER_OK pages=[1-9]/.test(out), out.slice(-200));
    const shots = await admin`select screenshot_key from a11y.page_state where scan_id = ${s.id} and screenshot_key is not null`;
    check("캡처가 내부 경로로 저장됨", shots.length > 0 && shots.every((r) => existsSync(path.join(".local-data", "shots", r.screenshot_key))), shots.length);

    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    const put = (key: string, body: Buffer, secret = SECRET) =>
      fetch(`${BASE}/api/internal/shots?key=${encodeURIComponent(key)}`, { method: "PUT", headers: { authorization: `Bearer ${secret}`, "content-type": "application/octet-stream" }, body: new Uint8Array(body) }).then((r) => r.status);
    const k = `${s.id}/${"1".repeat(8)}-1111-1111-1111-${"1".repeat(12)}.png`;
    check("틀린 비밀값 401", (await put(k, png, "x".repeat(40))) === 401);
    check("이미지 아닌 내용 400", (await put(k, Buffer.from("<html></html>"))) === 400);
    check("경로 조작 키 400", (await put(`${s.id}/../../etc/passwd.png`, png)) === 400);
    check("다른 형식 키(.svg) 400", (await put(`${s.id}/${"2".repeat(8)}-2222-2222-2222-${"2".repeat(12)}.svg`, png)) === 400);
    await admin`update a11y.scan set status = 'done' where id = ${s.id}`;
    check("끝난 회차에는 저장 거부 403", (await put(k, png)) === 403);
    const [ext] = await admin`insert into a11y.scan (project_id, source, status) values (${p.id}, 'extension', 'running') returning id`;
    check("확장 회차에는 저장 거부 403", (await put(`${ext.id}/${"3".repeat(8)}-3333-3333-3333-${"3".repeat(12)}.png`, png)) === 403);
    const get = (key: string, secret = SECRET) => fetch(`${BASE}/api/internal/shots?key=${encodeURIComponent(key)}`, { headers: { authorization: `Bearer ${secret}` } }).then((r) => r.status);
    check("저장된 캡처 읽기 200", (await get(shots[0].screenshot_key)) === 200);
    check("목록에 없는 키 읽기 404", (await get(k)) === 404);
    check("비밀값 없이 읽기 401", (await get(shots[0].screenshot_key, "")) === 401);
  } finally {
    await admin`delete from a11y.project where id = ${p.id}`;
    await admin.end();
    await worker.end();
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
