// 브라우저 응답 크기 한도 테스트 (GPT 리뷰). 연결당 5MB·회차 12MB 로 낮춰서 확인.
import http from "node:http";
process.env.EGRESS_ALLOW_HOSTS = "localhost:4406";
process.env.PROXY_CONN_BYTES = String(5 * 1024 * 1024);
process.env.PROXY_SCAN_BYTES = String(12 * 1024 * 1024);

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

async function main() {
  const sent: Record<string, number> = {};
  const server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    if (path.startsWith("/big")) {
      // 20MB 를 길이 표시 없이 조금씩 보냄 (chunked)
      res.writeHead(200, { "content-type": "application/octet-stream" });
      let n = 0;
      const chunk = Buffer.alloc(256 * 1024, 120);
      const pump = () => {
        while (n < 80) {
          n++;
          sent[path] = (sent[path] ?? 0) + chunk.length;
          if (!res.write(chunk)) return res.once("drain", pump);
        }
        res.end();
      };
      res.on("error", () => {});
      return pump();
    }
    if (path === "/declared") {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(50 * 1024 * 1024) });
      return res.end(Buffer.alloc(1024));
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><title>ok ${path}</title><h1>ok</h1>`);
  });
  await new Promise<void>((r) => server.listen(4406, "127.0.0.1", r));
  const { launch, newContext, proxyBytes } = await import("../worker/browser");
  const { blockedLog } = await import("../worker/egress-proxy");

  // 동시에 도는 두 회차 (Codex 리뷰 4): A 가 한도를 다 써도 B 는 영향 없어야 함
  const browser = await launch();
  const other = await launch();
  const otherPage = await (await newContext(other, { blockWrites: true })).newPage();
  const ctx = await newContext(browser, { blockWrites: true });
  const page = await ctx.newPage();
  const fetched = await page.goto("http://localhost:4406/").then(() =>
    page.evaluate(async () => {
      const r = await fetch("/big1").then((x) => x.arrayBuffer()).then((b) => b.byteLength).catch((e) => `error:${e}`);
      return r;
    }),
  );
  check("한 연결에서 5MB 를 넘는 응답은 끊김 (20MB 중 일부만)", typeof fetched === "string" || (fetched as number) < 6 * 1024 * 1024, fetched);
  const declared = await page.evaluate(async () => fetch("/declared").then((r) => r.status).catch((e) => `error:${e}`));
  check("길이를 50MB 로 밝힌 응답은 바로 거부 (413)", declared === 413 || String(declared).startsWith("error"), declared);
  const afterBig = await page.goto("http://localhost:4406/after").then((r) => r?.status()).catch((e) => String(e).slice(0, 60));
  check("한도에 걸린 뒤에도 다음 화면은 열림", afterBig === 200, afterBig);

  // 회차 한도 12MB: 큰 응답을 여러 번 받으면 이후 연결 거부
  for (let i = 2; i <= 5; i++) await page.evaluate(async (n) => fetch(`/big${n}`).then((x) => x.arrayBuffer()).catch(() => null), i);
  const overBudget = await page.goto("http://localhost:4406/late").then((r) => r?.status()).catch((e) => String(e).slice(0, 60));
  check(`회차 한도(12MB) 넘은 뒤 새 요청 거부 (받은 양 ${(proxyBytes(browser) / 1024 / 1024).toFixed(1)}MB)`, overBudget !== 200, overBudget);
  const codes = new Set(blockedLog().map((l) => l.code));
  check("차단 기록: E_TOO_LARGE, E_SCAN_BUDGET", codes.has("E_TOO_LARGE") && codes.has("E_SCAN_BUDGET"), [...codes]);
  const concurrent = await otherPage.goto("http://localhost:4406/other-scan").then((r) => r?.status()).catch((e) => String(e).slice(0, 300));
  check(`동시에 도는 다른 회차는 영향 없음 (B 받은 양 ${(proxyBytes(other) / 1024).toFixed(0)}KB)`, concurrent === 200 && proxyBytes(other) < 1024 * 1024, concurrent);
  await browser.close();
  const next = await launch();
  const reset = await (await (await newContext(next, { blockWrites: true })).newPage()).goto("http://localhost:4406/next-scan").then((r) => r?.status()).catch((e) => String(e).slice(0, 300));
  check("다음 회차(새 브라우저)는 새 한도로 열림", reset === 200, reset);
  await next.close();
  await other.close();
  server.close();
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
