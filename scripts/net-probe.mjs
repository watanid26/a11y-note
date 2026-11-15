// 네트워크 계층 격리 확인용 탐침. 앱 방어(프록시)를 일부러 거치지 않고 직접 접속을 시도한다.
// 사용: node scripts/net-probe.mjs <host> [port]   → 결과 JSON 출력
import net from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const host = process.argv[2];
const port = Number(process.argv[3] ?? 80);

const socket = await new Promise((resolve) => {
  const s = net.connect({ host, port, timeout: 3000 }, () => { s.destroy(); resolve("connected"); });
  s.on("error", (e) => resolve(`error:${e.code}`));
  s.on("timeout", () => { s.destroy(); resolve("timeout"); });
});

let fetched;
try {
  const r = await fetch(`http://${host}:${port}/probe-fetch`, { signal: AbortSignal.timeout(3000) });
  fetched = `status:${r.status}`;
} catch (e) { fetched = `error:${e.cause?.code ?? e.name}`; }

// 프록시 없이 Chromium 직접 접속 (프록시 우회 상황 흉내)
let chromium;
try {
  const { chromium: c } = require("playwright-core");
  const b = await c.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--disable-dev-shm-usage", "--no-sandbox"] });
  const p = await b.newPage();
  try { const r = await p.goto(`http://${host}:${port}/probe-chromium`, { timeout: 5000 }); chromium = `status:${r?.status()}`; }
  catch (e) { chromium = `error:${String(e.message).split("\n")[0].slice(0, 60)}`; }
  await b.close();
} catch (e) { chromium = `launch-failed:${String(e.message).slice(0, 80)}`; }

console.log(JSON.stringify({ host, port, socket, fetched, chromium }));
