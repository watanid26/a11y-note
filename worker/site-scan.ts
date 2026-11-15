// 공개 사이트 자동 검사 한 건을 처리한다.
// 1) 주소 수집 → 2) 대표 페이지 선정 → 3) 페이지마다 검사·Tab 순회·캡처 → 4) 흐름 제안 → 5) 자동으로 끝낼 수 있는 흐름 시도
// 안전: 검사 내내 GET 이외 요청과 탈퇴·삭제·결제 주소는 브라우저에서 차단한다 (실제 신청·주문이 일어나지 않음).

import { aiSafeUrl } from "../src/lib/security/url";
import { eq } from "drizzle-orm";
import type { Page } from "playwright-core";
import { db, flow, project, scan, type Flow, type Project, type ScanProgress } from "../src/lib/db";
import { saveFlowSuggestions } from "../src/lib/ai/flows";
import { noteAiConfigIfUnset } from "../src/lib/ai/judge";
import { fitToAllowance, scanAllowance, settleScan } from "../src/lib/usage-limits";
import { DANGER_BUTTON, isSafeSearchForm } from "../src/lib/flows";
import { flags } from "../src/lib/flags";
import { checkUrl } from "../src/lib/security/egress";
import { scrubLog } from "../src/lib/security/log";
import { ingestState } from "../src/lib/ingest";
import { pickRepresentatives } from "../src/lib/sampling";
import type { PageOutline } from "../src/core/types";
import { OffScope, assertInScope, captureState, launch, navigationTrace, newContext, proxyBytes, settle } from "./browser";
import { discover } from "./crawl";

async function progress(scanId: string, p: ScanProgress) {
  await db.update(scan).set({ progress: p }).where(eq(scan.id, scanId));
}

/** 회차 전체·페이지 하나 실행 한도 */
const SCAN_LIMIT_MS = Number(process.env.SCAN_LIMIT_MS ?? 20 * 60_000);
const PAGE_LIMIT_MS = Number(process.env.PAGE_LIMIT_MS ?? 60_000);

export class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(`시간 초과 (${what}, ${Math.round(ms / 1000)}초)`)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

/** 로그에는 쿼리 문자열을 남기지 않는다 (개인정보·토큰 노출 방지) */
function safeUrl(u: string): string {
  return aiSafeUrl(u);
}

/**
 * requireAllowance: 워커 본 루프는 true — 사용 한도 예약(scan_usage)이 없는 회차는 검사하지 않는다.
 * 테스트 스크립트는 예약 없이 직접 부를 수 있다 (그 경우 사용량 집계도 하지 않음).
 */
export async function runSiteScan(scanId: string, opts: { requireAllowance?: boolean; seedUrls?: string[] } = {}): Promise<void> {
  const deadline = Date.now() + SCAN_LIMIT_MS;
  const [row] = await db.select({ s: scan, p: project }).from(scan).innerJoin(project, eq(project.id, scan.projectId)).where(eq(scan.id, scanId));
  if (!row) return;
  const proj = row.p;
  // 1차 주소 검사 (실제 차단은 프록시가 IP 로 한다)
  checkUrl(proj.baseUrl);
  const locale = proj.pack === "jis2016" ? "ja" : "ko";

  const allowance = await scanAllowance(scanId);
  if (!allowance && opts.requireAllowance) throw new Error("사용 한도 예약이 없는 회차입니다. 프로젝트 화면에서 검사를 다시 시작해 주세요.");
  await progress(scanId, { phase: "주소 수집", done: 0, total: 0, message: "사이트맵과 링크를 따라 페이지를 찾는 중" });
  // 주소 수집은 회차 한도의 1/4 까지만
  const entries = await discover(proj.baseUrl, { maxUrls: 400, deadline: Date.now() + SCAN_LIMIT_MS / 4, seedUrls: opts.seedUrls });
  const picked = pickRepresentatives(entries, proj.baseUrl, proj.maxPages);
  // 사용 한도 안에서만: 이번 달 이미 센 화면은 그대로, 새 화면은 예약한 수까지 (P1-2)
  const { keep: sampled, dropped } = allowance ? fitToAllowance(picked, allowance) : { keep: picked, dropped: [] };
  await progress(scanId, { phase: "페이지 검사", done: 0, total: sampled.length, message: `페이지 ${entries.length}개를 찾아 대표 ${sampled.length}개를 골랐습니다` });

  const browser = await launch();
  const outlines: PageOutline[] = [];
  // 검사하지 못한 화면 기록 (보고서의 "검사하지 않은 범위"에 들어감, P0-10)
  const skipped: { url: string; reason: string }[] = dropped.map((d) => ({ url: safeUrl(d.url), reason: "이번 달 화면 한도로 검사하지 않음 (사용량 차감 없음)" }));
  // 검사를 마친 화면 (사용량 집계 대상)
  const checked: string[] = [];
  try {
    const ctx = await newContext(browser, { blockWrites: true, scope: proj.baseUrl });
    let page = await ctx.newPage();
    // 리디렉트·방화벽 안내 등으로 서로 다른 요청 주소가 같은 화면이 된 경우
    // 같은 DOM을 여러 번 판정하지 않는다. 실제 검사 화면과 제외 화면은 skipped에 남긴다.
    const seenFinalUrls = new Set<string>();
    for (let i = 0; i < sampled.length; i++) {
      const s = sampled[i];
      if (Date.now() > deadline) {
        console.warn(`[scan ${scanId}] 회차 실행 한도 초과, 남은 ${sampled.length - i}개 화면 건너뜀`);
        for (const rest of sampled.slice(i)) skipped.push({ url: safeUrl(rest.url), reason: "회차 실행 시간 한도 초과" });
        break;
      }
      try {
        // 브라우저 조작만 시간 제한 안에서 하고, 저장은 제한 밖에서 한다 (시간 초과 뒤 늦게 저장되는 일 방지)
        const state = await withTimeout(
          (async () => {
            const resp = await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 20000 });
            if (resp && resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
            await settle(page);
            assertInScope(page, proj.baseUrl);
            return captureState(page, s.reason === "홈" ? "홈" : (await page.title()) || safeUrl(s.url), { keyboard: true, locale, navigation: await navigationTrace(resp, s.url, page.url()) });
          })(),
          Math.min(PAGE_LIMIT_MS, Math.max(1000, deadline - Date.now())),
          "화면 검사",
        );
        const finalUrl = state.navigation?.finalUrl ?? page.url();
        const finalKey = finalUrl.replace(/[#?].*$/, "").replace(/\/+$/, "");
        if (seenFinalUrls.has(finalKey)) {
          skipped.push({ url: safeUrl(s.url), reason: "같은 최종 URL로 이미 검사한 화면" });
          await progress(scanId, { phase: "페이지 검사", done: i + 1, total: sampled.length, message: safeUrl(s.url) });
          continue;
        }
        seenFinalUrls.add(finalKey);
        if (state.screenKind === "diagnostic" || state.screenKind === "error") {
          skipped.push({ url: safeUrl(s.url), reason: state.screenKind === "diagnostic" ? "접속·네트워크 안내 화면이라 웹페이지 판정에서 제외" : "오류·점검 화면이라 웹페이지 판정에서 제외" });
          await progress(scanId, { phase: "페이지 검사", done: i + 1, total: sampled.length, message: safeUrl(s.url) });
          continue;
        }
        outlines.push(state.snapshot.outline);
        await ingestState(state, { scanId, packId: proj.pack, templateKey: s.templateKey, reason: `${s.reason}${s.groupSize > 1 ? ` (${s.groupSize}개 묶음)` : ""}` });
        checked.push(s.url);
      } catch (e) {
        console.warn(`[scan ${scanId}] ${safeUrl(s.url)} 실패: ${scrubLog((e as Error).message, 200)}`);
        const msg = (e as Error).message;
        skipped.push({ url: safeUrl(s.url), reason: e instanceof OffScope ? "다른 사이트로 이동됨 (검사 범위 밖)" : e instanceof TimeoutError ? "화면 검사 시간 초과" : /^HTTP \d+/.test(msg) ? msg.slice(0, 12) : /ERR_|net::|403|blocked/i.test(msg) ? "접속 실패 또는 차단" : "검사 오류" });
        if (e instanceof TimeoutError) {
          // 시간 초과: 진행 중인 조작을 실제로 끊기 위해 탭을 닫고 새 탭으로 계속한다
          await page.close({ runBeforeUnload: false }).catch(() => {});
          page = await ctx.newPage();
        }
      }
      await progress(scanId, { phase: "페이지 검사", done: i + 1, total: sampled.length, message: safeUrl(s.url) });
    }

    await progress(scanId, { phase: "흐름 찾기", done: 0, total: 0, message: "검사해야 할 업무 흐름을 찾는 중" });
    const flows = await saveFlowSuggestions(proj.id, outlines, proj.baseUrl, locale);

    // 흐름 자동 시도는 기본으로 꺼져 있다 (src/lib/flags.ts). 꺼져 있으면 제안 목록만 남기고 사람이 확장으로 녹화한다.
    const f = flags();
    const allowedKinds = [...(f.flowSearch ? ["search"] : []), ...(f.flowEmptySubmit ? ["apply", "contact", "signup"] : [])];
    const tryable = f.flowAutoTry && Date.now() < deadline ? flows.filter((fl) => fl.status === "suggested" && !fl.autoTried && allowedKinds.includes(fl.kind)) : [];
    for (let i = 0; i < tryable.length; i++) {
      await progress(scanId, { phase: "흐름 자동 시도", done: i, total: tryable.length, message: tryable[i].name });
      await tryFlow(page, proj, tryable[i], scanId, locale).catch((e) => console.warn(`[flow ${tryable[i].kind}] ${scrubLog((e as Error).message)}`));
    }
    await ctx.close();
  } finally {
    await browser.close();
    await db.update(scan).set({ skipped: skipped.slice(0, 200) }).where(eq(scan.id, scanId)).catch(() => {});
    await noteAiConfigIfUnset(scanId, proj.aiEnabled).catch(() => {});
    if (allowance) {
      const st = await settleScan(scanId, checked).catch((e) => (console.error(`[scan ${scanId}] 사용량 집계 실패`, scrubLog((e as Error).message)), null));
      if (st) console.log(`[scan ${scanId}] 사용량: 새 화면 ${st.counted}개`);
    }
    console.log(`[scan ${scanId}] 받은 데이터 ${(proxyBytes(browser) / 1024 / 1024).toFixed(1)}MB, 검사 못 한 화면 ${skipped.length}개`);
  }
}

/** 자동으로 끝낼 수 있는 흐름: 검색 결과 화면, 빈 칸 제출 후 오류 안내 화면 */
async function tryFlow(page: Page, proj: Project, f: Flow, scanId: string, locale: "ko" | "ja"): Promise<void> {
  await db.update(flow).set({ autoTried: true, updatedAt: new Date() }).where(eq(flow.id, f.id));
  if (!f.startUrl) return;
  await page.goto(f.startUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await settle(page);

  if (f.kind === "search") {
    if (!flags().flowSearch) return;
    const input = page.locator("input[type=search], input[name*=search i], input[name=q], input[name*=keyword i], input[placeholder*=검색], input[title*=검색], input[aria-label*=검색], input[placeholder*=検索]").first();
    if (!(await input.count())) return;
    // GET 방식으로 같은 사이트에 보내는 <form> 검색만 자동 실행한다
    const form = await input.evaluate((el) => {
      const fm = (el as HTMLInputElement).form;
      return { exists: Boolean(fm), method: fm?.getAttribute("method") ?? null, action: fm?.getAttribute("action") ?? null };
    });
    if (!isSafeSearchForm(form, page.url())) return;
    await input.fill(locale === "ja" ? "アクセシビリティ" : "접근성");
    await input.press("Enter");
    await settle(page);
    const state = await captureState(page, "검색 결과", { keyboard: true, flowId: f.id, flowStep: 1, locale });
    await ingestState(state, { scanId, packId: proj.pack, reason: "흐름 자동 시도: 검색" });
    await db.update(flow).set({ status: "auto_done", updatedAt: new Date() }).where(eq(flow.id, f.id));
    return;
  }

  // 신청·문의·가입: 입력 화면 → 빈 칸으로 제출 버튼 → 오류 안내 화면
  if (!flags().flowEmptySubmit) return;
  const form = page.locator("form").filter({ has: page.locator("input:not([type=hidden]), textarea") }).filter({ hasNot: page.locator("input[type=search]") }).first();
  if (!(await form.count())) return;
  const before = await captureState(page, `${f.name} — 입력 화면`, { keyboard: true, flowId: f.id, flowStep: 1, locale });
  await ingestState(before, { scanId, packId: proj.pack, reason: `흐름 자동 시도: ${f.name}` });

  const submit = form.locator("button[type=submit], input[type=submit], button:not([type])").first();
  if (!(await submit.count())) return;
  const label = ((await submit.textContent()) || (await submit.getAttribute("value")) || "").trim();
  if (DANGER_BUTTON.test(label)) return; // 되돌릴 수 없는 버튼은 누르지 않는다
  // 실제 제출(페이지 이동)은 막고, 사이트의 입력 검사 스크립트만 돌게 한다.
  // window 의 bubble 단계는 다른 모든 submit 처리기보다 늦게 실행되므로, 거기서 기본 동작을 취소한다.
  await page.evaluate(() => {
    window.addEventListener("submit", (e) => {
      if (!e.defaultPrevented) e.preventDefault();
      (window as unknown as { __a11ySubmitBlocked?: boolean }).__a11ySubmitBlocked = true;
    });
  });
  await submit.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await settle(page);
  const after = await captureState(page, `${f.name} — 빈 칸 제출 후 오류 안내`, { keyboard: false, flowId: f.id, flowStep: 2, locale });
  await ingestState(after, { scanId, packId: proj.pack, reason: `흐름 자동 시도: ${f.name} (빈 칸 제출, 서버 전송 차단)` });
  await db.update(flow).set({ status: "auto_done", updatedAt: new Date() }).where(eq(flow.id, f.id));
}
