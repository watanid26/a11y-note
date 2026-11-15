// 서버리스 점검 엔진: 워커 VM 없이 웹 서버(Vercel 함수) 안에서 점검을 "조금씩" 진행한다.
//  - 한 번 부를 때 정해진 시간(budgetMs)만 일하고 상태(scan.plan)를 저장한 뒤 끝난다.
//  - 결과 화면이 몇 초마다 /api/scans/:id/step 을 부르고, 1분마다 /api/tick 이 대기 중인 회차를 이어 간다
//    → 창을 닫아도 계속 진행된다.
//  - 같은 회차를 두 실행이 동시에 잡지 않도록 점유 기한(lease_until)을 쓴다.
//  - 브라우저는 관리형 크롬 서비스(BROWSER_WS_ENDPOINT)에서 돌린다. 주소 1차 점검·사용량 예약·집계 규칙은 워커와 같다.

import { aiSafeUrl } from "../security/url";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { db, pageState, project, scan, type Project, type Scan, type ScanPlan } from "../db";
import { fitToAllowance, scanAllowance, settleScan } from "../usage-limits";
import { pickSample } from "../sampling";
import { checkUrl } from "../security/egress";
import { scrubLog } from "../security/log";
import { ingestState } from "../ingest";
import { saveFlowSuggestions } from "../ai/flows";
import { noteAiConfigIfUnset, processPending } from "../ai/judge";
import { aiConfigured } from "../ai/client";
import { judgeScanItems, processItemVerdicts } from "../ai/item-judge";
import { processVerifications } from "../ai/verify";
import { processPassSamples } from "../ai/verify-pass";
import { purgeExpiredShots } from "../privacy";
import type { PageOutline } from "../../core/types";
import { discover } from "../../../worker/crawl";
import { OffScope, assertInScope, captureState, navigationTrace, newContext, openBrowser, settle } from "../../../worker/browser";

const LEASE_SEC = 90;
/** 화면 하나에 쓸 수 있는 최대 시간 (이보다 오래 걸리면 "시간 초과"로 기록하고 넘어간다) */
const PAGE_LIMIT_MS = Number(process.env.PAGE_LIMIT_MS ?? 35_000);
/** 같은 페이지를 다시 시도하는 횟수 (실행이 중간에 끊긴 경우 대비) */
const MAX_ATTEMPTS = 2;

/** 진행 메시지·건너뛴 화면 기록용: origin + 경로(민감 조각 가림)만 */
export const safeUrl = (u: string) => aiSafeUrl(u);

class PageTimeout extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PageTimeout(`화면 점검 시간 초과 (${Math.round(ms / 1000)}초)`)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

/** 점유: 대기·진행 중이고 아무도 잡고 있지 않은 서버 점검 회차만 잡는다 */
async function claim(scanId: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    update a11y.scan set
      lease_until = now() + make_interval(secs => ${LEASE_SEC}),
      status = 'running',
      started_at = coalesce(started_at, now())
    where id = ${scanId} and source = 'server' and status in ('queued', 'running')
      and (lease_until is null or lease_until < now())
    returning id`)) as unknown as unknown[];
  return rows.length > 0;
}

async function release(scanId: string) {
  await db.update(scan).set({ leaseUntil: null }).where(eq(scan.id, scanId));
}

export async function save(scanId: string, plan: ScanPlan, phase: string, message?: string) {
  await db
    .update(scan)
    .set({ plan, skipped: plan.skipped.slice(0, 200), progress: { phase, done: Math.min(plan.next, plan.pages.length), total: plan.pages.length, message } })
    .where(eq(scan.id, scanId));
}

export async function fail(scanId: string, message: string) {
  await db.update(scan).set({ status: "failed", error: message.slice(0, 500), finishedAt: new Date(), leaseUntil: null }).where(eq(scan.id, scanId));
}

/** 1단계: 주소 모으기 → 대표 페이지 고르기 → 사용 한도 안에서 자르기 */
export async function makePlan(s: Scan, p: Project, deadline: number): Promise<ScanPlan | null> {
  const allowance = await scanAllowance(s.id);
  if (!allowance) {
    await fail(s.id, "사용 한도 예약이 없는 점검입니다. 새로 점검을 시작해 주세요.");
    return null;
  }
  await db.update(scan).set({ progress: { phase: "주소 모으기", done: 0, total: 0, message: "사이트맵과 링크를 따라 페이지를 찾는 중" } }).where(eq(scan.id, s.id));
  const entries = await discover(p.baseUrl, { maxUrls: 300, deadline: Math.min(deadline, Date.now() + 20_000) });
  const sample = pickSample(entries, p.baseUrl, p.maxPages);
  const picked = sample.picked;
  const { keep, dropped } = fitToAllowance(picked, allowance);
  return {
    found: entries.length,
    pages: keep.map((k) => ({ url: k.url, reason: k.reason, templateKey: k.templateKey ?? null, groupSize: k.groupSize })),
    next: 0,
    checked: [],
    skipped: dropped.map((d) => ({ url: safeUrl(d.url), reason: "이번 달 화면 한도로 점검하지 않음 (사용량 차감 없음)" })),
    sampling: { templates: sample.templates, perScan: p.maxPages, uncovered: sample.uncovered.map((u) => ({ ...u, url: safeUrl(u.url) })) },
  };
}

/** 마지막 단계: 흐름 제안, 의미 판단 설정 기록, 사용량 집계, 완료 표시 */
export async function finalize(s: Scan, p: Project, plan: ScanPlan) {
  const rows = await db.select({ outline: pageState.outline }).from(pageState).where(and(eq(pageState.scanId, s.id), isNotNull(pageState.outline)));
  const outlines = rows.map((r) => r.outline).filter(Boolean) as PageOutline[];
  await saveFlowSuggestions(p.id, outlines, p.baseUrl, p.pack === "jis2016" ? "ja" : "ko").catch((e) => console.warn("[scan] 흐름 제안 실패", scrubLog((e as Error).message)));
  await noteAiConfigIfUnset(s.id, p.aiEnabled).catch(() => {});
  await settleScan(s.id, plan.checked).catch((e) => console.error("[scan] 사용량 집계 실패", scrubLog((e as Error).message)));
  const failedAll = plan.pages.length > 0 && plan.checked.length === 0;
  await db
    .update(scan)
    .set({
      status: failedAll ? "failed" : "done",
      error: failedAll ? "화면을 하나도 열지 못했습니다. 주소가 맞는지, 사이트가 외부 접속을 막고 있지 않은지 확인해 주세요." : null,
      finishedAt: new Date(),
      leaseUntil: null,
      progress: { phase: "완료", done: plan.pages.length, total: plan.pages.length, message: `페이지 ${plan.checked.length}개 점검` },
    })
    .where(eq(scan.id, s.id));
  // 점검노트 항목 판정: AI 를 안 쓰면 규칙 판정이라 바로 끝난다. AI 를 쓰면 1분 작업(runTick)이 처리한다
  if (!failedAll && !(aiConfigured() && p.aiEnabled)) await judgeScanItems(s.id).catch((e) => console.warn("[scan] 항목 판정 실패", scrubLog((e as Error).message)));
}

export interface StepResult {
  status: string;
  worked: boolean;
}

/**
 * 회차 하나를 budgetMs 동안 진행한다. 이미 다른 실행이 잡고 있으면 아무것도 하지 않는다.
 * 브라우저 사용 시간이 곧 비용이라, 남은 시간이 화면 하나를 처리하기에 부족하면 바로 멈춘다.
 */
export async function stepScan(scanId: string, budgetMs = 45_000): Promise<StepResult> {
  const started = Date.now();
  const deadline = started + budgetMs;
  if (!(await claim(scanId))) {
    const [s] = await db.select({ status: scan.status }).from(scan).where(eq(scan.id, scanId));
    return { status: s?.status ?? "missing", worked: false };
  }
  let browser: Browser | null = null;
  let ctx: BrowserContext | null = null;
  try {
    const [row] = await db.select({ s: scan, p: project }).from(scan).innerJoin(project, eq(project.id, scan.projectId)).where(eq(scan.id, scanId));
    if (!row) return { status: "missing", worked: false };
    const { s, p } = row;
    try {
      checkUrl(p.baseUrl);
    } catch (e) {
      await fail(scanId, (e as Error).message);
      return { status: "failed", worked: true };
    }

    let plan = s.plan;
    if (!plan) {
      plan = await makePlan(s, p, deadline);
      if (!plan) return { status: "failed", worked: true };
      await save(scanId, plan, "화면 점검", `페이지 ${plan.found}개를 찾아 대표 ${plan.pages.length}개를 골랐어요`);
    }

    const locale = p.pack === "jis2016" ? "ja" : "ko";
    const seenFinalUrls = new Set<string>();
    while (plan.next < plan.pages.length && deadline - Date.now() > PAGE_LIMIT_MS * 0.6) {
      const target = plan.pages[plan.next];
      const attempts = { ...(plan.attempts ?? {}) };
      attempts[target.url] = (attempts[target.url] ?? 0) + 1;
      plan.attempts = attempts;
      if (attempts[target.url] > MAX_ATTEMPTS) {
        plan.skipped.push({ url: safeUrl(target.url), reason: "화면 점검이 반복해서 끊김" });
        plan.next++;
        continue;
      }
      // 시도 횟수를 먼저 저장한다 (실행이 이 화면에서 끊겨도 다음 실행이 무한 반복하지 않게)
      await save(scanId, plan, "화면 점검", safeUrl(target.url));
      await db.update(scan).set({ leaseUntil: new Date(Date.now() + LEASE_SEC * 1000) }).where(eq(scan.id, scanId));

      if (!browser) {
        const opened = await openBrowser();
        browser = opened.browser;
        ctx = await newContext(browser, { blockWrites: true, scope: p.baseUrl, remote: opened.remote });
      }
      const page: Page = await ctx!.newPage();
      try {
        const state = await withTimeout(
          (async () => {
            const resp = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
            if (resp && resp.status() >= 400) throw new Error(`HTTP ${resp.status()}`);
            await settle(page);
            assertInScope(page, p.baseUrl);
            const label = target.reason === "홈" ? "홈" : (await page.title()) || safeUrl(target.url);
            return captureState(page, label, { keyboard: true, keyboardStops: 60, locale, navigation: await navigationTrace(resp, target.url, page.url()) });
          })(),
          Math.min(PAGE_LIMIT_MS, Math.max(5_000, deadline - Date.now())),
        );
        const finalUrl = state.navigation?.finalUrl ?? target.url;
        const finalKey = finalUrl.replace(/[#?].*$/, "").replace(/\/+$/, "");
        if (seenFinalUrls.has(finalKey)) {
          plan.skipped.push({ url: safeUrl(target.url), reason: "같은 최종 URL로 이미 점검한 페이지" });
          plan.next++;
          continue;
        }
        seenFinalUrls.add(finalKey);
        if (state.screenKind === "diagnostic" || state.screenKind === "error") {
          plan.skipped.push({ url: safeUrl(target.url), reason: state.screenKind === "diagnostic" ? "접속·네트워크 안내 화면이라 웹페이지 판정에서 제외" : "오류·점검 화면이라 웹페이지 판정에서 제외" });
          plan.next++;
          continue;
        }
        await ingestState(state, { scanId, packId: p.pack, templateKey: target.templateKey ?? undefined, reason: `${target.reason}${target.groupSize > 1 ? ` (${target.groupSize}개 묶음)` : ""}` });
        plan.checked.push(target.url);
      } catch (e) {
        const msg = (e as Error).message;
        plan.skipped.push({
          url: safeUrl(target.url),
          reason: e instanceof OffScope ? "다른 사이트로 이동됨 (점검 범위 밖)" : e instanceof PageTimeout ? "화면 점검 시간 초과" : /^HTTP \d+/.test(msg) ? msg.slice(0, 12) : /ERR_|net::|403|blocked/i.test(msg) ? "접속 실패 또는 차단" : "점검 오류",
        });
        console.warn(`[scan ${scanId}] ${safeUrl(target.url)} 실패: ${scrubLog(msg, 200)}`);
      } finally {
        await page.close({ runBeforeUnload: false }).catch(() => {});
      }
      plan.next++;
      await save(scanId, plan, "화면 점검", safeUrl(target.url));
    }

    if (plan.next >= plan.pages.length) {
      await db.update(scan).set({ progress: { phase: "결과 정리", done: plan.pages.length, total: plan.pages.length } }).where(eq(scan.id, scanId));
      // 의미 판단(이미지 설명 등) 대기 건을 이 회차 것부터 조금 처리 — 남은 건 다음 tick 이 처리
      if (deadline - Date.now() > 8_000) await processPending(20).catch(() => 0);
      await finalize(s, p, plan);
      return { status: "done", worked: true };
    }
    return { status: "running", worked: true };
  } catch (e) {
    console.error(`[scan ${scanId}] 단계 실패`, scrubLog((e as Error).message, 300));
    return { status: "running", worked: true };
  } finally {
    await ctx?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await release(scanId).catch(() => {});
  }
}

/** 1분마다: 대기·진행 중인 서버 점검(점유 안 된 것) 몇 개를 이어 가고, 의미 판단 대기 건을 처리한다 */
export async function tick(budgetMs = 50_000): Promise<{ advanced: number; judged: number }> {
  const deadline = Date.now() + budgetMs;
  // 너무 오래 끝나지 않은 회차는 실패로 정리 (예약은 다음 예약 때 집계 없이 풀림)
  await db.execute(sql`
    update a11y.scan set status = 'failed', finished_at = now(), lease_until = null,
      error = '점검이 너무 오래 끝나지 않아 멈췄습니다. 다시 시작해 주세요. (사용량 차감 없음)'
    where source = 'server' and status in ('queued', 'running') and created_at < now() - interval '2 hours'`);
  // 확장 점검: 확장이 10분 넘게 소식이 없으면(크롬을 닫음 등) 멈춘 것으로 본다 → 다음 점검을 막지 않게 정리
  await db.execute(sql`
    update a11y.scan set status = 'failed', finished_at = now(), lease_until = null,
      error = '크롬 확장이 10분 넘게 응답하지 않아 점검을 멈췄습니다. 크롬과 확장이 켜져 있는지 확인한 뒤 다시 시도하세요. 사용량은 차감되지 않았습니다.'
    where source = 'browser' and status in ('queued', 'running')
      and coalesce(lease_until, created_at) < now() - interval '10 minutes'`);
  const ids = (await db.execute(sql`
    select id from a11y.scan
    where source = 'server' and status in ('queued', 'running') and (lease_until is null or lease_until < now())
    order by created_at limit 3`)) as unknown as { id: string }[];
  let advanced = 0;
  for (const { id } of ids) {
    if (deadline - Date.now() < 15_000) break;
    const r = await stepScan(id, Math.min(45_000, deadline - Date.now() - 2_000));
    if (r.worked) advanced++;
  }
  const judged = deadline - Date.now() > 5_000 ? await processPending(60).catch(() => 0) : 0;
  // 오류 의심 정리가 끝난 회차에 점검노트 항목 판정을 내린다
  if (deadline - Date.now() > 20_000) await processItemVerdicts(2).catch(() => 0);
  // 자동 점검 결과 AI 2차 검수 (AI_VERIFY_ENABLED=1 일 때만, 원본 결과는 바꾸지 않음)
  if (deadline - Date.now() > 10_000) await processVerifications(20).catch(() => 0);
  // "문제 미발견" 표본 검수 (AI_VERIFY_PASS_ENABLED=1 일 때만)
  if (deadline - Date.now() > 10_000) await processPassSamples(10).catch(() => 0);
  // 하루 한 번(한국 시각 새벽 4시대 첫 tick): 보관기간 지난 캡처 삭제
  const kst = new Date(Date.now() + 9 * 3600_000);
  if (kst.getUTCHours() === 4 && kst.getUTCMinutes() < 2 && deadline - Date.now() > 5_000) {
    await purgeExpiredShots().catch((e) => console.warn("[tick] 캡처 정리 실패", scrubLog((e as Error).message)));
  }
  return { advanced, judged };
}

/** 화면이 여러 회차를 한 번에 물어볼 때 쓰는 진행 상황 */
export async function scanStatuses(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: scan.id, status: scan.status, progress: scan.progress }).from(scan).where(inArray(scan.id, ids));
}
