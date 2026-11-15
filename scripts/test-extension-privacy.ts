// P0-9·P0-5 확장 테스트
//  A) 배포본: 자동 검사용 권한(모든 사이트·디버거)은 설치 때, 다운로드는 선택. 현재 화면 검사는 올리기 전 확인
//  B) 테스트 사이트 한 곳만 허용: 허용 안 한 다른 사이트는 검사 거부
//  C) 올리기 전 확인: 검사 → 확인 대기(서버 전송 0건) → 버리기(전송 0건) / 올리기(전송 1건)
// 실행: 웹 서버·테스트 사이트 실행 후  npx tsx scripts/test-extension-privacy.ts <연결 키> <프로젝트 ID>
import "dotenv/config";
import { chromium, type BrowserContext, type Worker } from "playwright-core";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import postgres from "postgres";
import { extVariant } from "./ext-variant";
import { requireChromium } from "./lib/find-chromium";

const CHROMIUM = requireChromium();

const [token, projectId] = process.argv.slice(2);
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

async function open(kind: "granted" | "granted-capture" | "shipping"): Promise<{ ctx: BrowserContext; sw: Worker }> {
  const ext = extVariant(kind);
  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), "a11yprof-")), {
    executablePath: CHROMIUM,
    ignoreDefaultArgs: ["--disable-extensions"],
    headless: false,
    args: ["--headless=new", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let sw = ctx.serviceWorkers().find((w) => w.url().endsWith("/background.js"));
  while (!sw) {
    const w = await ctx.waitForEvent("serviceworker");
    if (w.url().endsWith("/background.js")) sw = w;
  }
  for (let i = 0; i < 50 && !(await sw.evaluate(() => typeof chrome?.storage?.local === "object").catch(() => false)); i++) await new Promise((r) => setTimeout(r, 200));
  await sw.evaluate(async ([t]) => chrome.storage.local.set({ server: "http://localhost:3200", token: t, keyboard: true, offline: false, review: true }), [token]);
  return { ctx, sw };
}

const scanActive = (sw: Worker, host: string, opts: object = {}) =>
  sw.evaluate(
    async ([h, o]) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => (t.url ?? "").includes(h as string)) ?? tabs[tabs.length - 1];
      try {
        return await (globalThis as any).__a11yExt.scanTab(tab.id, o);
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
    [host, opts] as const,
  );

async function uploads(sql: postgres.Sql) {
  const [r] = await sql`select count(*)::int n from a11y.page_state ps join a11y.scan s on s.id = ps.scan_id where s.project_id = ${projectId}`;
  return r.n as number;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  // 허용 안 한 사이트 역할: 4407 포트
  const other = http.createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end("<title>다른 사이트</title><h1>other</h1>"); });
  await new Promise<void>((r) => other.listen(4407, "127.0.0.1", r));

  // A) 배포본
  {
    const { ctx, sw } = await open("shipping");
    const page = await ctx.newPage();
    await page.goto("http://localhost:4400/index.html");
    // 0.3.0 부터 자동 검사(내 크롬이 화면을 돌며 검사)를 위해 모든 사이트 접근·디버거를 설치 때 받는다.
    // 대신 "현재 화면 검사"는 여전히 올리기 전 확인을 거치고, 파일 저장(다운로드)은 선택 권한으로 남는다.
    const r = await scanActive(sw, "4400");
    check("배포본: 현재 화면 검사는 올리기 전 확인 대기 (서버로 바로 안 보냄)", r.pending === true, r);
    const ex = await sw.evaluate(async () => (globalThis as any).__a11yExt.exportOffline().then(() => "saved", (e: Error) => e.message));
    check("배포본: 다운로드 권한 없으면 파일 저장 거부 + 안내", String(ex).includes("파일 저장 권한"), ex);
    const perms = await sw.evaluate(async () => chrome.permissions.getAll());
    check(
      "배포본 권한: 자동 검사에 필요한 것(모든 사이트·디버거·알람)만, 다운로드는 선택",
      (perms.origins ?? []).includes("<all_urls>") && ["debugger", "alarms"].every((x) => perms.permissions?.includes(x)) && !perms.permissions?.includes("downloads"),
      perms,
    );
    await ctx.close();
  }

  // B) 한 곳만 허용 (캡처 권한 없음): 다른 사이트 거부, 허용 사이트는 캡처 없이 결과만
  {
    const { ctx, sw } = await open("granted");
    const p2 = await ctx.newPage();
    await p2.goto("http://127.0.0.1:4407/");
    const r = await scanActive(sw, "4407");
    check("허용하지 않은 다른 사이트는 검사 거부", typeof r.error === "string" && r.error.includes("접근 권한"), r);
    await p2.close();
    const page = await ctx.newPage();
    await page.goto("http://localhost:4400/login.html");
    const n0 = await uploads(sql);
    const r1 = await scanActive(sw, "4400", { label: "캡처 권한 없음", noReview: true });
    const [last] = await sql`select ps.screenshot_key from a11y.page_state ps join a11y.scan s on s.id = ps.scan_id where s.project_id = ${projectId} order by ps.created_at desc limit 1`;
    check("사이트 권한만: 캡처 없이 결과만 올림 + 안내", r1.offline === false && (await uploads(sql)) === n0 + 1 && last.screenshot_key === null, r1);
    await ctx.close();
  }

  // C) 캡처까지 허용 + 올리기 전 확인
  {
    const { ctx, sw } = await open("granted-capture");
    const page = await ctx.newPage();
    await page.goto("http://localhost:4400/login.html");
    const n0 = await uploads(sql);
    const r1 = await scanActive(sw, "4400", { label: "확인 대기 1" });
    check("검사 결과는 확인 대기로 (서버 전송 없음)", r1.pending === true && (await uploads(sql)) === n0, r1);
    const list = await sw.evaluate(async () => (globalThis as any).__a11yExt.pendingList());
    check("확인 목록에 캡처 미리보기·이름·쿼리 뺀 주소", list.length === 1 && list[0].shot && list[0].label === "확인 대기 1" && !list[0].url.includes("?"), list.map((x: any) => ({ ...x, shot: Boolean(x.shot) })));
    await sw.evaluate(async (id) => (globalThis as any).__a11yExt.pendingResolve(id, false), list[0].id);
    check("버리기 → 서버 전송 0건, 목록 비움", (await uploads(sql)) === n0 && (await sw.evaluate(async () => (globalThis as any).__a11yExt.pendingList())).length === 0);
    const r2 = await scanActive(sw, "4400", { label: "확인 대기 2" });
    await sw.evaluate(async (id) => (globalThis as any).__a11yExt.pendingResolve(id, true), r2.id);
    check("올리기 → 서버 전송 1건", (await uploads(sql)) === n0 + 1);
    const kb = await scanActive(sw, "4400", { label: "키보드 포함", noReview: true });
    check("디버거 허용 상태에서는 Tab 검사 포함해 바로 올림", kb.offline === false && kb.findings > 0, kb);
    await ctx.close();
  }
  other.close();
  await sql.end();
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
