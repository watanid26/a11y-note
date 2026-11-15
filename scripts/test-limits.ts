// 실행 한도가 실제로 작동하는지 (GPT 리뷰: "20분·60초 제한이 실제 강제 종료로 이어지는지 검증")
//   MODE=page : 화면 한도 4초 — 응답 없는 화면·스크립트가 멈춘 화면은 4초 안에 끊고 다음 화면을 검사해야 함
//   MODE=scan : 회차 한도 15초 — 느린 화면이 많아도 회차가 15초 + 여유 안에 끝나야 함
// 실행: MODE=page npx tsx scripts/test-limits.ts ; MODE=scan npx tsx scripts/test-limits.ts
import "dotenv/config";
import http from "node:http";

const MODE = process.env.MODE ?? "page";
process.env.EGRESS_ALLOW_HOSTS = "localhost:4405"; // .env 값보다 우선
process.env.PAGE_LIMIT_MS = "4000";
process.env.SCAN_LIMIT_MS = MODE === "scan" ? "15000" : "600000";

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  [${MODE}] ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

const html = (title: string, body = "") => `<!doctype html><html lang="ko"><head><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const SLOW = MODE === "scan" ? ["slow-a", "slow-b", "slow-c", "slow-d", "slow-e", "slow-f", "slow-g", "slow-h"] : ["slow"];

async function main() {
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/") {
      const links = ["fast1", ...SLOW, "busy", "fast2"].map((p) => `<a href="/${p}/x.html">${p}</a>`).join(" ");
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(html("홈", links));
    }
    if (path.startsWith("/slow")) return; // 응답하지 않음
    res.writeHead(200, { "content-type": "text/html" });
    if (path.startsWith("/busy")) return res.end(html("멈춤", "<script>setTimeout(()=>{for(;;){}},300)</script>"));
    res.end(html(path.slice(1, 6)));
  });
  server.keepAliveTimeout = 1;
  await new Promise<void>((r) => server.listen(4405, "127.0.0.1", r));

  const { db, project, scan, pageState } = await import("../src/lib/db");
  const { eq } = await import("drizzle-orm");
  const { issueUploadToken } = await import("../src/lib/tokens");
  const { runSiteScan } = await import("../worker/site-scan");

  const [p] = await db.insert(project).values({ ownerEmail: "limit-test@local", name: "limit", baseUrl: "http://localhost:4405/", maxPages: 20, ...issueUploadToken().fields }).returning();
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running" }).returning();
  const t0 = Date.now();
  await runSiteScan(s.id);
  const sec = (Date.now() - t0) / 1000;
  const pages = (await db.select().from(pageState).where(eq(pageState.scanId, s.id))).map((x) => x.url.replace("http://localhost:4405", ""));
  console.log(`  소요 ${sec.toFixed(1)}초, 검사된 화면:`, pages);
  if (MODE === "page") {
    check("응답 없는 화면·멈춘 화면은 저장되지 않음", !pages.some((u) => u.startsWith("/slow") || u.startsWith("/busy")), pages);
    check("멈춘 화면 뒤의 화면도 계속 검사됨 (탭을 새로 열어 이어감)", pages.includes("/fast1/x.html") && pages.includes("/fast2/x.html"), pages);
    check("전체 시간이 한도 합보다 크게 넘지 않음 (< 40초)", sec < 40, sec);
  } else {
    check("회차 한도 15초 + 여유 10초 안에 종료", sec < 25, sec);
  }
  await db.delete(project).where(eq(project.id, p.id));
  server.close();
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
