// 크롬 확장 자동 점검 (source = 'browser').
// 서버는 "어떤 화면을 볼지"(계획)와 결과 저장·집계만 하고, 화면을 여는 일은 사용자 크롬의 확장이 한다.
//  - 확장: next() 로 다음 화면을 받는다 → 자기 크롬에서 열어 점검 → submit() 으로 결과를 올린다 → 반복
//  - 확장이 소식을 보낼 때마다 lease_until 을 늘린다(살아 있음 표시). 10분 넘게 소식이 없으면 tick 이 정리한다.
//  - 확장이 끊겼다 다시 붙어도 계획(scan.plan)이 DB 에 있으므로 이어서 진행한다.
import { and, eq } from "drizzle-orm";
import { db, project, scan, type Project, type Scan, type ScanPlan } from "../db";
import { fitToAllowance, scanAllowance } from "../usage-limits";
import { inScope, normalizeUrl, pickSample, sameSite, type CrawlEntry } from "../sampling";
import { robotsAllows, type RobotsRules } from "../robots";
import { fetchRobots } from "../../../worker/crawl";
import { checkUrl } from "../security/egress";
import { ingestState } from "../ingest";
import type { CapturedState } from "../../core/types";
import { WRONG_ACCOUNT } from "../ext-messages";
import { fail, finalize, makePlan, safeUrl, save } from "./engine";
import { DANGER_URL } from "../../../worker/browser";
import { aiConfigured } from "../ai/client";
import { processPending } from "../ai/judge";

const MAX_ATTEMPTS = 3;

async function load(scanId: string, email: string): Promise<{ s: Scan; p: Project } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) return null;
  const [row] = await db
    .select({ s: scan, p: project })
    .from(scan)
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(and(eq(scan.id, scanId), eq(project.ownerEmail, email), eq(scan.source, "browser")));
  return row ?? null;
}

/** 확장이 다른 계정으로 연결돼 있어 이 점검을 못 받는 경우. 확장은 404 면 조용히 포기하므로 403 으로 알려 대기열에 남게 한다 */

async function notFound(scanId: string): Promise<{ error: string; status: number }> {
  if (/^[0-9a-f-]{36}$/i.test(scanId)) {
    const [other] = await db.select({ id: scan.id }).from(scan).where(and(eq(scan.id, scanId), eq(scan.source, "browser")));
    if (other) return { error: `${WRONG_ACCOUNT}. 점검 화면에서 지금 계정으로 다시 연결할게요.`, status: 403 };
  }
  return { error: "점검을 찾을 수 없습니다.", status: 404 };
}

async function heartbeat(scanId: string) {
  await db
    .update(scan)
    .set({ status: "running", leaseUntil: new Date(Date.now() + 120_000) })
    .where(eq(scan.id, scanId));
}

/** AI 를 안 쓰는 사이트는 규칙 판정이 금방 끝나므로 결과를 보여 주기 전에 바로 정리한다 (AI 는 1분 작업이 처리) */
async function settlePending(scanId: string, p: Project) {
  if (aiConfigured() && p.aiEnabled) return;
  for (let i = 0; i < 10; i++) if ((await processPending(100, scanId).catch(() => 0)) < 100) break;
}

export type NextResult =
  | { done: true; status: string }
  | { done: false; page: { url: string; home: boolean }; index: number; total: number; locale: "ko" | "ja"; wantLinks: boolean }
  | { error: string; status: number };

export async function nextPage(scanId: string, email: string): Promise<NextResult> {
  const row = await load(scanId, email);
  if (!row) return notFound(scanId);
  const { s, p } = row;
  if (s.status === "done" || s.status === "failed") return { done: true, status: s.status };
  await heartbeat(scanId);
  if (!s.startedAt) await db.update(scan).set({ startedAt: new Date() }).where(eq(scan.id, scanId));

  let plan = s.plan;
  if (!plan) {
    try {
      checkUrl(p.baseUrl);
    } catch (e) {
      await fail(scanId, (e as Error).message);
      return { done: true, status: "failed" };
    }
    plan = await makePlan(s, p, Date.now() + 20_000);
    if (!plan) return { done: true, status: "failed" };
  }
  while (plan.next < plan.pages.length) {
    const t = plan.pages[plan.next];
    const attempts = { ...(plan.attempts ?? {}) };
    attempts[t.url] = (attempts[t.url] ?? 0) + 1;
    plan.attempts = attempts;
    if (attempts[t.url] <= MAX_ATTEMPTS) break;
    plan.skipped.push({ url: safeUrl(t.url), reason: "화면 점검이 반복해서 끊김" });
    plan.next++;
  }
  if (plan.next >= plan.pages.length) {
    await save(scanId, plan, "결과 정리");
    await settlePending(scanId, p);
    await finalize(s, p, plan);
    return { done: true, status: "done" };
  }
  const t = plan.pages[plan.next];
  await save(scanId, plan, "화면 점검", safeUrl(t.url));
  return {
    done: false,
    page: { url: t.url, home: t.reason === "홈" },
    index: plan.next,
    total: plan.pages.length,
    locale: p.pack === "jis2016" ? "ja" : "ko",
    // 서버에서 주소를 거의 못 모았으면(자바스크립트로 그리는 사이트, 해외 접속 차단 등) 확장이 첫 화면의 링크를 보내 준다
    wantLinks: plan.next === 0 && plan.found <= 1,
  };
}

/** 첫 화면에서 확장이 모은 링크로 계획을 다시 짠다 (서버가 주소를 못 모은 경우만) */
export async function replanFromLinks(s: Scan, p: Project, plan: ScanPlan, links: { url: string; text: string }[], robots?: RobotsRules) {
  const base = normalizeUrl(p.baseUrl, p.baseUrl) ?? p.baseUrl;
  // 확장이 보낸 링크에도 robots.txt 를 적용한다 (Codex 리뷰 5)
  const rules = robots ?? (await fetchRobots(base));
  const seen = new Map<string, CrawlEntry>([[base, { url: base, texts: ["홈"], depth: 0 }]]);
  for (const l of links.slice(0, 500)) {
    const url = normalizeUrl(l.url, base);
    if (!url || !sameSite(url, base) || DANGER_URL.test(url) || /\.(pdf|hwp|docx?|xlsx?|zip|jpe?g|png|gif)(\?|$)/i.test(url) || !robotsAllows(rules, url)) continue;
    const e = seen.get(url) ?? { url, texts: [], depth: 1 };
    if (l.text) e.texts.push(l.text.slice(0, 60));
    seen.set(url, e);
  }
  const entries = [...seen.values()];
  if (entries.length <= 1) return;
  const allowance = await scanAllowance(s.id);
  if (!allowance) return;
  const sample = pickSample(entries, p.baseUrl, p.maxPages);
  const picked = sample.picked;
  const { keep, dropped } = fitToAllowance(picked, allowance);
  const first = plan.pages[0];
  const rest = keep.filter((k) => k.url !== first.url && normalizeUrl(k.url, base) !== normalizeUrl(first.url, base));
  plan.found = entries.length;
  plan.pages = [first, ...rest.slice(0, Math.max(0, keep.length - 1)).map((k) => ({ url: k.url, reason: k.reason, templateKey: k.templateKey ?? null, groupSize: k.groupSize }))];
  plan.skipped.push(...dropped.map((d) => ({ url: safeUrl(d.url), reason: "이번 달 화면 한도로 점검하지 않음 (사용량 차감 없음)" })));
  plan.sampling = { templates: sample.templates, perScan: p.maxPages, uncovered: sample.uncovered.map((u) => ({ ...u, url: safeUrl(u.url) })) };
}

export interface SubmitBody {
  url: string;
  state?: CapturedState | null;
  screenshotOrigin?: { x: number; y: number } | null;
  links?: { url: string; text: string }[];
  error?: string | null;
}

export async function submitPage(scanId: string, email: string, body: SubmitBody): Promise<{ done: boolean; stale?: boolean; findings?: number; warning?: string } | { error: string; status: number }> {
  const row = await load(scanId, email);
  if (!row) return notFound(scanId);
  const { s, p } = row;
  if (s.status !== "running" || !s.plan) return { error: "진행 중인 점검이 아닙니다.", status: 409 };
  const plan = s.plan;
  const target = plan.pages[plan.next];
  // 이미 처리한 화면을 다시 올린 경우(재시도 등)는 무시한다
  if (!target || target.url !== body.url) return { done: plan.next >= plan.pages.length, stale: true };
  await heartbeat(scanId);

  let findings: number | undefined;
  let warning: string | undefined;
  if (body.state && !inScope(body.state.url, p.baseUrl)) {
    // 로그인 대행·외부 사이트로 넘어간 화면은 이 사이트 결과로 저장하지 않는다 (Codex 리뷰 9)
    plan.skipped.push({ url: safeUrl(target.url), reason: "다른 사이트로 이동됨 (점검 범위 밖)" });
  } else if (body.state) {
    const state = body.state;
    state.flowId = null;
    state.flowStep = null;
    if (target.reason === "홈") state.label = "홈";
    const r = await ingestState(state, {
      scanId,
      packId: p.pack,
      templateKey: target.templateKey ?? undefined,
      reason: `${target.reason}${target.groupSize > 1 ? ` (${target.groupSize}개 묶음)` : ""}`,
      screenshotOrigin: body.screenshotOrigin ?? null,
      untrusted: true,
    });
    findings = r.findings;
    warning = r.warning;
    plan.checked.push(target.url);
  } else {
    plan.skipped.push({ url: safeUrl(target.url), reason: (body.error || "점검 오류").slice(0, 60) });
  }
  if (plan.next === 0 && plan.found <= 1 && body.links?.length) await replanFromLinks(s, p, plan, body.links);
  plan.next++;
  await save(scanId, plan, "화면 점검", plan.pages[plan.next] ? safeUrl(plan.pages[plan.next].url) : undefined);
  if (plan.next >= plan.pages.length) {
    await save(scanId, plan, "결과 정리");
    await settlePending(scanId, p);
    await finalize(s, p, plan);
    return { done: true, findings, warning };
  }
  return { done: false, findings, warning };
}
