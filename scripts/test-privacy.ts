// P0-9 통합 테스트 (웹 서버를 WORKER_SHARED_SECRET 로 실행한 상태에서)
//  1) 90일 지난 캡처 정리: 내부 경로 호출 → 파일 삭제·기록, 최근 캡처는 유지, 발견 사항은 유지
//  2) 화면 삭제: 소유자만, 캡처 파일·발견 사항까지
//  3) 프로젝트 삭제: 이름 확인, 모든 회차·화면·캡처 파일
//  4) 외부 AI: 프로젝트에서 끄면(기본) 호출 0건, 켜면 호출되고 보낸 내용에 주소 쿼리 없음
// 실행: WORKER_SHARED_SECRET=같은값 npx tsx scripts/test-privacy.ts
import "dotenv/config";
import http from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, finding, pageState, project, scan } from "../src/lib/db";
import { processPending } from "../src/lib/ai/judge";

const BASE = "http://localhost:3200";
const SECRET = process.env.WORKER_SHARED_SECRET!;
const SHOTS = path.join(".local-data", "shots");
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}
const cookie = (who: string) => ({ cookie: `an_dev_email=${encodeURIComponent(who)}` });

async function seed(owner: string, opts: { ageDays?: number; aiEnabled?: boolean } = {}) {
  const [p] = await db.insert(project).values({ ownerEmail: owner, name: `privacy ${owner}`, baseUrl: "https://example.com/", aiEnabled: opts.aiEnabled ?? false }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "extension", status: "done" }).returning();
  const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).png().toBuffer();
  const mk = async (age: number) => {
    const id = crypto.randomUUID();
    const key = `${s.id}/${id}.png`;
    mkdirSync(path.join(SHOTS, s.id), { recursive: true });
    writeFileSync(path.join(SHOTS, key), png);
    const created = new Date(Date.now() - age * 86400_000);
    await db.insert(pageState).values({ id, scanId: s.id, url: "https://example.com/p", applicable: { images: 1 } as never, screenshotKey: key, createdAt: created });
    await db.insert(finding).values({ scanId: s.id, pageStateId: id, itemCode: "5.1.1", method: "ai", result: "pending", ruleId: "ai-image", message: "m", box: { x: 0, y: 0, w: 10, h: 10 }, candidate: { kind: "image", selector: "img", box: { x: 0, y: 0, w: 10, h: 10 }, text: { alt: "배너", src: "https://example.com/b.png?user=hong&token=SECRET1" } } });
    return { id, key };
  };
  const old = await mk(opts.ageDays ?? 91);
  const fresh = await mk(1);
  return { p, s, old, fresh };
}

async function main() {
  // 1) 보관기간 정리
  const a = await seed("privacy-a@local");
  const r = await fetch(`${BASE}/api/internal/cleanup`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });
  const body = await r.json();
  const [oldRow] = await db.select().from(pageState).where(eq(pageState.id, a.old.id));
  const [freshRow] = await db.select().from(pageState).where(eq(pageState.id, a.fresh.id));
  check("정리 경로 호출 성공", r.status === 200 && body.purged >= 1, body);
  check("90일 지난 캡처: 파일 삭제 + 키 비움 + 삭제 시각 기록", !existsSync(path.join(SHOTS, a.old.key)) && oldRow.screenshotKey === null && oldRow.screenshotDeletedAt !== null);
  check("최근 캡처는 유지", existsSync(path.join(SHOTS, a.fresh.key)) && freshRow.screenshotKey === a.fresh.key);
  check("캡처를 지워도 발견 사항은 유지", (await db.select().from(finding).where(eq(finding.pageStateId, a.old.id))).length === 1);
  check("비밀값 없이 정리 경로 401", (await fetch(`${BASE}/api/internal/cleanup`, { method: "POST" })).status === 401);

  // 2) 화면 삭제
  const delOther = await fetch(`${BASE}/api/pages/${a.fresh.id}`, { method: "DELETE", headers: cookie("privacy-b@local") });
  check("다른 사용자는 화면 삭제 불가 404", delOther.status === 404 && existsSync(path.join(SHOTS, a.fresh.key)));
  const delOwn = await fetch(`${BASE}/api/pages/${a.fresh.id}`, { method: "DELETE", headers: cookie("privacy-a@local") });
  check("소유자 화면 삭제: 행·캡처 파일·발견 사항 모두 삭제", delOwn.status === 200 && !existsSync(path.join(SHOTS, a.fresh.key)) && (await db.select().from(pageState).where(eq(pageState.id, a.fresh.id))).length === 0 && (await db.select().from(finding).where(eq(finding.pageStateId, a.fresh.id))).length === 0);

  // 3) 프로젝트 삭제
  const b = await seed("privacy-a@local", { ageDays: 10 });
  const keep = await seed("privacy-a@local", { ageDays: 10 }); // 같은 사용자의 다른 프로젝트 — 지워지면 안 됨
  const wrong = await fetch(`${BASE}/api/projects/${b.p.id}`, { method: "DELETE", headers: { ...cookie("privacy-a@local"), "content-type": "application/json" }, body: JSON.stringify({ confirmName: "틀린 이름" }) });
  check("이름이 틀리면 프로젝트 삭제 거부 400", wrong.status === 400);
  const other = await fetch(`${BASE}/api/projects/${b.p.id}`, { method: "DELETE", headers: { ...cookie("privacy-b@local"), "content-type": "application/json" }, body: JSON.stringify({ confirmName: b.p.name }) });
  check("다른 사용자는 프로젝트 삭제 불가 404", other.status === 404);
  const ok = await fetch(`${BASE}/api/projects/${b.p.id}`, { method: "DELETE", headers: { ...cookie("privacy-a@local"), "content-type": "application/json" }, body: JSON.stringify({ confirmName: b.p.name }) });
  const left = { project: (await db.select().from(project).where(eq(project.id, b.p.id))).length, scans: (await db.select().from(scan).where(eq(scan.projectId, b.p.id))).length, pages: (await db.select().from(pageState).where(eq(pageState.scanId, b.s.id))).length };
  check("프로젝트 삭제: 프로젝트·회차·화면 0, 캡처 파일 삭제", ok.status === 200 && left.project + left.scans + left.pages === 0 && !existsSync(path.join(SHOTS, b.old.key)) && !existsSync(path.join(SHOTS, b.fresh.key)), left);
  const keepRows = (await db.select().from(pageState).where(eq(pageState.scanId, keep.s.id))).length;
  check("다른 프로젝트의 캡처 파일·화면은 그대로", existsSync(path.join(SHOTS, keep.old.key)) && existsSync(path.join(SHOTS, keep.fresh.key)) && keepRows === 2, keepRows);
  await db.delete(project).where(eq(project.id, keep.p.id));

  // 4) 외부 AI 사용 여부
  const calls: string[] = [];
  const fake = http.createServer((req, res) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      calls.push(s);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text: "[]" }], usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((r2) => fake.listen(4408, "127.0.0.1", r2));
  process.env.ANTHROPIC_API_KEY = "test";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:4408/";
  process.env.AI_DAILY_BUDGET_USD = "1000";
  const off = await seed("privacy-c@local", { ageDays: 1 });
  while ((await processPending(100)) > 0) { /* */ }
  check("AI 끔(기본): 키가 있어도 외부 AI 호출 0건, 규칙 판정으로 처리", calls.length === 0 && (await db.select().from(finding).where(eq(finding.scanId, off.s.id))).every((f) => f.result !== "pending"), calls.length);
  const on = await seed("privacy-d@local", { ageDays: 1, aiEnabled: true });
  while ((await processPending(100)) > 0) { /* */ }
  check("AI 켬: 외부 AI 호출됨", calls.length > 0, calls.length);
  check("보낸 내용에 주소 쿼리·토큰 없음", calls.length > 0 && calls.every((c) => !c.includes("token=SECRET1") && !c.includes("user=hong")), calls[0]?.slice(0, 300));
  fake.close();

  for (const x of [a, off, on]) await db.delete(project).where(eq(project.id, x.p.id));
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
