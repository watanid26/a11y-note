// P0-4 통합 테스트: 실행 중인 웹 서버(localhost:3200, EXT_DAILY_LIMIT=6 으로 실행)에 확장 API 를 직접 호출한다.
// 실행: EXT_DAILY_LIMIT=6 npx next dev -p 3200 (다른 창) 후 npx tsx scripts/test-upload-security.ts
import "dotenv/config";
import sharp from "sharp";
import { eq, sql as dsql } from "drizzle-orm";
import { db, pageState, project, scan } from "../src/lib/db";
import { hashToken, issueUploadToken } from "../src/lib/tokens";

const BASE = "http://localhost:3200";
const EXT_ORIGIN = `chrome-extension://${"a".repeat(32)}`;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`, ok || detail === undefined ? "" : JSON.stringify(detail).slice(0, 300));
  if (!ok) process.exitCode = 1;
}

const state = (screenshot?: string) => ({
  url: "https://example.com/p",
  title: "t",
  label: "업로드 테스트",
  snapshot: { results: [{ engine: "axe", ruleId: "image-alt", outcome: "violation", impact: "critical", wcag: ["1.1.1"], help: "alt", nodes: [{ selector: "img", html: "<img>", box: { x: 0, y: 0, w: 10, h: 10 }, message: "" }] }], candidates: [], applicable: { images: 1, links: 0 }, outline: { navLinks: [], forms: [], searchInput: null }, templateSignature: "x" },
  keyboard: null,
  screenshot,
});

async function post(token: string, body: unknown, origin = EXT_ORIGIN) {
  const r = await fetch(`${BASE}/api/ext/states`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, origin }, body: JSON.stringify(body) });
  return { status: r.status, acao: r.headers.get("access-control-allow-origin"), body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function main() {
  const issued = issueUploadToken();
  const [p] = await db.insert(project).values({ ownerEmail: "upload-test@local", name: "upload", baseUrl: "https://example.com/", ...issued.fields }).returning();
  const [serverScan] = await db.insert(scan).values({ projectId: p.id, source: "server", status: "running" }).returning();
  try {
    const raw = await db.execute(dsql`select upload_token, upload_token_hash from a11y.project where id = ${p.id}`);
    const row = (raw as unknown as { upload_token: string | null; upload_token_hash: string }[])[0];
    check("DB 에 키 원문 없음, 해시만", row.upload_token === null && row.upload_token_hash === hashToken(issued.token));

    check("잘못된 키 401", (await post("an_" + "0".repeat(48), { state: state() })).status === 401);
    check("형식이 다른 키 401", (await post("an_xyz", { state: state() })).status === 401);

    const png = (await sharp({ create: { width: 200, height: 100, channels: 3, background: "#fff" } }).png().toBuffer()).toString("base64");
    const ok = await post(issued.token, { scanId: serverScan.id, state: state(png) });
    check("정상 업로드 200 + 확장 출처에 CORS 허용", ok.status === 200 && ok.acao === EXT_ORIGIN, ok);
    check("서버 검사 회차를 지정해도 확장 전용 회차에 붙음", ok.body.scanId !== serverScan.id, ok.body);
    const [extScan] = await db.select().from(scan).where(eq(scan.id, String(ok.body.scanId)));
    check("붙은 회차는 source=extension", extScan?.source === "extension", extScan);

    const fake = await post(issued.token, { state: state(Buffer.from("<html>not image</html>").toString("base64")) });
    const [fakePage] = await db.select().from(pageState).where(eq(pageState.id, String(fake.body.pageStateId)));
    check("이미지가 아닌 캡처: 결과만 저장, 캡처는 저장 안 함 + 경고", fake.status === 200 && fakePage?.screenshotKey === null && String(fake.body.warning).includes("PNG·JPEG"), fake.body);

    const huge = (await sharp({ create: { width: 4100, height: 10, channels: 3, background: "#fff" } }).png().toBuffer()).toString("base64");
    const big = await post(issued.token, { state: state(huge) });
    check("가로 4000px 초과 캡처: 저장 안 함 + 경고", big.status === 200 && String(big.body.warning).includes("크기 초과"), big.body);

    const tooBig = await post(issued.token, { state: state("A".repeat(12_000_000)) });
    check("8MB 초과 캡처 문자열: 400", tooBig.status === 400, tooBig.status);

    const tooMany = { ...state(), snapshot: { ...state().snapshot, results: Array(301).fill(state().snapshot.results[0]) } };
    check("결과 301개: 400", (await post(issued.token, { state: tooMany })).status === 400);

    const evil = await post(issued.token, { state: state() }, "https://evil.example");
    check("다른 출처: CORS 허용 헤더 없음 (키 검증은 별도로 통과)", evil.acao === null, evil);

    // 하루 한도 (서버를 EXT_DAILY_LIMIT=6 으로 띄운 경우): 지금까지 4건 저장 → 2건 더 성공, 그 다음 429
    const r5 = await post(issued.token, { state: state() });
    const r6 = await post(issued.token, { state: state() });
    const r7 = await post(issued.token, { state: state() });
    check("하루 한도 초과 시 429", r5.status === 200 && r6.status === 200 && r7.status === 429, [r5.status, r6.status, r7.status]);

    // 요청 본문·모양 제한
    const huge13 = await fetch(`${BASE}/api/ext/states`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${issued.token}`, origin: EXT_ORIGIN }, body: JSON.stringify({ state: state(), pad: "x".repeat(13 * 1024 * 1024) }) });
    check("13MB 요청 본문 413", huge13.status === 413, huge13.status);
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = { d: deep };
    const deepR = await post(issued.token, { state: { ...state(), keyboard: deep } });
    check("중첩 100단계 JSON 400", deepR.status === 400, deepR);

    // 만료
    await db.update(project).set({ uploadTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(project.id, p.id));
    const exp = await post(issued.token, { state: state() });
    check("만료된 키 401 + 안내", exp.status === 401 && String(exp.body.error).includes("만료"), exp.body);

    // 폐기 (새 키 발급 후 이전 키)
    const next = issueUploadToken();
    await db.update(project).set(next.fields).where(eq(project.id, p.id));
    check("새 키 발급 뒤 이전 키 401", (await post(issued.token, { state: state() })).status === 401);
    const pr = await fetch(`${BASE}/api/ext/project`, { headers: { authorization: `Bearer ${next.token}`, origin: EXT_ORIGIN } });
    check("새 키로는 프로젝트 정보 조회 가능", pr.status === 200);
  } finally {
    await db.delete(project).where(eq(project.id, p.id));
  }

  // 하루 한도 동시 요청 (원자성): 새 프로젝트, 한도 6 에 20건을 동시에 → 정확히 6건만 성공
  const iss2 = issueUploadToken();
  const [p2] = await db.insert(project).values({ ownerEmail: "upload-test@local", name: "quota", baseUrl: "https://example.com/", ...iss2.fields }).returning();
  try {
    const results = await Promise.all(Array.from({ length: 20 }, () => post(iss2.token, { state: state() })));
    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429).length;
    const saved = await db.execute(dsql`select count(*)::int n from a11y.page_state ps join a11y.scan s on s.id = ps.scan_id where s.project_id = ${p2.id}`);
    const n = (saved as unknown as { n: number }[])[0].n;
    check("동시 20건 → 정확히 6건 성공·14건 429, 저장도 6건", ok === 6 && limited === 14 && n === 6, { ok, limited, n });
  } finally {
    await db.delete(project).where(eq(project.id, p2.id));
  }
  process.exit();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
