// 쿠키·세션 토큰·숨은 CSRF 값·입력값이 DB 저장·AI 전송에 들어가지 않는지 (GPT 리뷰: 쿠키·세션 수집 금지를 테스트로 고정)
// 테스트 화면: fixtures/site/secret.html (쿠키·localStorage·hidden 입력·meta 토큰·미리 채운 입력값·data 속성·주소 쿼리)
import "dotenv/config";
import http from "node:http";
import { eq, sql } from "drizzle-orm";
import { db, project, scan } from "../src/lib/db";
import { processPending } from "../src/lib/ai/judge";
import { runSiteScan } from "../worker/site-scan";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 400));
  if (!ok) process.exitCode = 1;
}
const SECRETS = ["COOKIE_SESSION_SECRET", "LOCAL_STORAGE_SECRET", "HIDDEN_CSRF_SECRET", "META_CSRF_SECRET", "PREFILLED_NAME_SECRET", "010-9999-0000"];
// 주소 쿼리·data 속성은 DB(사용자 자신의 자료)에는 남을 수 있지만 AI 로는 가면 안 됨
const AI_ONLY = ["URL_QUERY_SECRET", "LINK_QUERY_SECRET", "DATA_ATTR_SECRET"];

(async () => {
  const calls: string[] = [];
  const fake = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      calls.push(b);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ content: [{ type: "text", text: "[]" }], usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  await new Promise<void>((r) => fake.listen(4409, "127.0.0.1", r));
  process.env.ANTHROPIC_API_KEY = "test";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:4409/";
  process.env.AI_DAILY_BUDGET_USD = "1000";

  const [p] = await db.insert(project).values({ ownerEmail: "leak@local", name: "leak", baseUrl: "http://localhost:4400/secret.html", maxPages: 1, aiEnabled: true }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running" }).returning();
  try {
    await runSiteScan(s.id);
    while ((await processPending(100)) > 0) { /* */ }
    const dump = await db.execute(sql`
      select coalesce(json_agg(x)::text, '') as t from (
        select row_to_json(ps) as x from a11y.page_state ps where ps.scan_id = ${s.id}
        union all select row_to_json(f) from a11y.finding f where f.scan_id = ${s.id}
        union all select row_to_json(fl) from a11y.flow fl where fl.project_id = ${p.id}
        union all select row_to_json(sc) from a11y.scan sc where sc.id = ${s.id}
      ) q`);
    const text = (dump as unknown as { t: string }[])[0].t;
    check("테스트 전제: 화면이 실제로 검사됨", text.includes("내 정보 수정"), text.length);
    for (const sec of SECRETS) check(`DB 에 저장 안 됨: ${sec}`, !text.includes(sec));
    const ai = calls.join("\n");
    check("테스트 전제: AI 가 실제로 호출됨", calls.length > 0, calls.length);
    for (const sec of [...SECRETS, ...AI_ONLY]) check(`AI 로 전송 안 됨: ${sec}`, !ai.includes(sec));
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
    fake.close();
  }
  process.exit();
})();
