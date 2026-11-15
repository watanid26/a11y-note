// 테스트 사이트 서버: 일부러 접근성 문제를 넣은 "테스트 시청" 사이트 (포트 4400)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(__dirname, "site");
const port = Number(process.env.FIXTURE_PORT ?? 4400);
// 1x1 PNG
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  let p = decodeURIComponent(url.pathname);
  if (p === "/sitemap.xml") {
    res.writeHead(404).end();
    return;
  }
  if (p.endsWith(".png") || p.endsWith(".mp4")) {
    res.writeHead(200, { "content-type": p.endsWith(".png") ? "image/png" : "video/mp4" }).end(p.endsWith(".png") ? png : "");
    return;
  }
  if (p === "/go-out") {
    // 다른 사이트(외부 로그인 등)로 넘기는 화면 — 검사 범위 밖 처리 테스트용
    res.writeHead(302, { location: `http://127.0.0.1:${port}/login.html` }).end();
    return;
  }
  if (p === "/js-out.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html><title>이동</title><h1>잠시만요</h1><script>setTimeout(()=>{location.href="http://127.0.0.1:${port}/login.html"},50)</script>`);
    return;
  }
  if (p === "/robots.txt") {
    // robots.txt 준수 테스트용: /private/ 은 수집하지 않아야 한다
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("User-agent: *\nDisallow: /private/\n");
    return;
  }
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(path.join(root, path.normalize(p)));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" }).end("<!doctype html><title>없음</title><h1>404</h1>");
  }
}).listen(port, () => console.log(`fixture site http://localhost:${port}`));
