// Phase 2: 자동 점검 "문제 미발견(pass)" 표본을 AI 가 검수한다 (누락 의심 찾기).
// 원칙
//  - pass 는 finding 행이 없다. 대상은 (화면, 항목) 이고, 이력은 finding_verification(target=auto_pass_sample)에 쌓는다.
//    원본 finding·item_decision 은 읽기만 하고 바꾸지 않는다.
//  - AI 가 지지해도 적합 확정이 아니다(기록만). 반박하면 누락 의심으로 사람 확인 (routeVerification).
//  - 대상 항목은 캡처 없이 이미 저장된 글자 근거로 볼 수 있는 고위험 항목만: 페이지 제목·링크 목적·반복 영역 건너뛰기·초점 순서.
//    자동 규칙은 "있는지"만 보고 "적절한지"는 못 보는 항목들이다. 캡처는 보내지 않는다.
//  - 표본: 회차·화면·항목·프롬프트 버전의 해시로 정하는 결정적 표본 (AI_VERIFY_PASS_RATE, 기본 0.1).
//    같은 대상은 다시 뽑아도 같은 결과라 중복이 없고, DB 고유 인덱스(0021)로도 막는다.
//  - 비용: AI_VERIFY_ENABLED=1 과 AI_VERIFY_PASS_ENABLED=1 둘 다 켜야 동작, 프로젝트 AI 켜짐, 끝난 회차만,
//    회차당 AI_VERIFY_PASS_MAX_PER_SCAN(기본 10, 이미 검수한 수 포함), 한 번 실행에 limit 개, callAI 예산 상한.

import { and, desc, eq, gt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getPack, type Pack } from "../../core/packs";
import type { KeyboardTrace, PageOutline } from "../../core/types";
import { db, finding, findingVerification, itemDecision, pageState, project, scan, type PageState } from "../db";
import { scrubLog } from "../security/log";
import { aiSafeUrl, redactText } from "../security/url";
import { aiConfigured, aiModel, aiProvider, BudgetExceeded, callAI, type ContentBlock } from "./client";
import { verificationsFromAiText, verifyEnabled, VERIFY_PROMPT_VERSION, VERIFY_REASON_CODES, type ParsedVerification } from "./verify";
import { LIMIT } from "../report/copy";

/** 표본 검수 대상 WCAG 성공기준 → 근거 종류. 팩 항목은 wcag 번호로 찾는다 (KWCAG 6.4.2 / JIS 2.4.2 등) */
export const PASS_SAMPLE_SC = {
  "2.4.2": "title",
  "2.4.4": "links",
  "2.4.1": "bypass",
  "2.4.3": "focus_order",
} as const;
export type PassEvidenceKind = (typeof PASS_SAMPLE_SC)[keyof typeof PASS_SAMPLE_SC];

export function passSampleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return verifyEnabled(env) && env.AI_VERIFY_PASS_ENABLED === "1";
}
export function passSampleRate(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_VERIFY_PASS_RATE ?? 0.1);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.1;
}
export function passSampleMaxPerScan(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_VERIFY_PASS_MAX_PER_SCAN ?? 10);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
}

/** 결정적 표본: 같은 입력이면 언제나 같은 결과 (다시 돌려도 새 대상이 생기지 않음) */
export function inPassSample(scanId: string, pageStateId: string, itemCode: string, rate: number, promptVersion = VERIFY_PROMPT_VERSION): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const h = createHash("sha256").update(`${scanId}|${pageStateId}|${itemCode}|${promptVersion}`).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000 < rate;
}

type PageLike = Pick<PageState, "id" | "scanId" | "title" | "url" | "applicable" | "outline" | "keyboard">;

export interface PassCandidate {
  scanId: string;
  pageStateId: string;
  itemCode: string;
  kind: PassEvidenceKind;
}

function hasEvidence(kind: PassEvidenceKind, p: PageLike): boolean {
  const kb = p.keyboard as KeyboardTrace | null;
  const outline = p.outline as PageOutline | null;
  if (kind === "title") return Boolean((p.title ?? "").trim());
  if (kind === "links") return (outline?.navLinks?.length ?? 0) > 0;
  return (kb?.stops?.length ?? 0) > 0;
}

/**
 * 표본 후보: 자동 점검이 그 화면·항목에서 아무것도 내지 않았고(문제 미발견), 점검자가 항목을 결정하지 않았고,
 * 아직 같은 프롬프트로 검수하지 않았고, 저장된 근거가 있는 경우.
 */
export function passSampleCandidates(
  pack: Pack,
  pages: PageLike[],
  findings: { pageStateId: string; itemCode: string }[],
  decidedItems: Set<string>,
  done: Set<string>,
): PassCandidate[] {
  const hit = new Set(findings.map((f) => `${f.pageStateId}|${f.itemCode}`));
  const out: PassCandidate[] = [];
  for (const [sc, kind] of Object.entries(PASS_SAMPLE_SC) as [string, PassEvidenceKind][]) {
    const item = pack.items.find((i) => i.wcag.includes(sc));
    if (!item || decidedItems.has(item.code)) continue;
    for (const p of pages) {
      const key = `${p.id}|${item.code}`;
      if (hit.has(key) || done.has(key) || !hasEvidence(kind, p)) continue;
      out.push({ scanId: p.scanId, pageStateId: p.id, itemCode: item.code, kind });
    }
  }
  return out;
}

/** 표본 뽑기 + 회차 상한 (이미 검수한 수 포함) */
export function pickPassSamples(cands: PassCandidate[], rate: number, maxPerScan: number, usedPerScan: Map<string, number>): PassCandidate[] {
  const used = new Map(usedPerScan);
  const out: PassCandidate[] = [];
  for (const c of cands) {
    if (!inPassSample(c.scanId, c.pageStateId, c.itemCode, rate)) continue;
    const n = used.get(c.scanId) ?? 0;
    if (n >= maxPerScan) continue;
    used.set(c.scanId, n + 1);
    out.push(c);
  }
  return out;
}

export interface PassSampleInput {
  item: string;
  autoResult: "pass";
  page: string;
  title: string;
  evidence: string[];
}

/** 외부로 보내는 근거: 글자만, 가림 처리·길이 제한. 선택자·입력값·쿼리는 보내지 않는다 */
export function passSampleInput(c: PassCandidate, p: PageLike, itemTitle: string): PassSampleInput {
  const safe = (s: string, n: number) => redactText(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const kb = p.keyboard as KeyboardTrace | null;
  const outline = p.outline as PageOutline | null;
  let evidence: string[] = [];
  if (c.kind === "title") evidence = [`title: ${safe(p.title, 120)}`, `path: ${aiSafeUrl(p.url)}`];
  if (c.kind === "links") evidence = (outline?.navLinks ?? []).slice(0, 30).map((l) => `link: "${safe(l.text, 60)}" → ${aiSafeUrl(l.href)}`);
  if (c.kind === "bypass") evidence = [`firstStopIsSkipLink: ${Boolean(kb?.firstStopIsSkipLink)}`, ...(kb?.stops ?? []).slice(0, 5).map((s) => `tab ${s.index}: <${s.tag}> "${safe(s.text, 40)}"`)];
  if (c.kind === "focus_order") evidence = (kb?.stops ?? []).slice(0, 25).map((s) => `tab ${s.index}: <${s.tag}> "${safe(s.text, 40)}" y=${s.box ? Math.round(s.box.y) : "?"} x=${s.box ? Math.round(s.box.x) : "?"}`);
  return { item: `${c.itemCode} ${itemTitle}`.slice(0, 80), autoResult: "pass", page: aiSafeUrl(p.url), title: safe(p.title, 120), evidence };
}

export function passInputHash(input: PassSampleInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

const SYSTEM_KO = `당신은 KWCAG 2.2·WCAG 2.2 웹 접근성 심사원입니다. 자동 점검 도구가 "문제를 찾지 못한" 항목을 표본으로 다시 봅니다.
입력은 화면에서 모은 글자 근거(페이지 제목, 링크 문구, Tab 이동 순서)뿐입니다.
- supported: 근거로 보아 문제가 보이지 않음 (자동 결과를 뒷받침)
- contradicted: 근거에서 문제가 보임 (자동 점검 누락 의심)
- uncertain: 둘 다 가능함
- insufficient_evidence: 이 근거만으로 판단할 수 없음
최종 판정은 사람이 합니다. 확실하지 않으면 uncertain 또는 insufficient_evidence 를 고르고 confidence 를 낮게 줍니다.
reasonCode: ${Object.keys(VERIFY_REASON_CODES).join("|")}
evidence: 근거에서 관찰한 사실만 ${LIMIT.aiEvidence}자 이내 한 구절.
반드시 JSON 배열만 출력: [{"id":"…","result":"supported|contradicted|uncertain|insufficient_evidence","confidence":0~1,"reasonCode":"…","evidence":"…"}]`;

const SYSTEM_JA = `あなたはJIS X 8341-3:2016・WCAG 2.2の試験員です。自動チェックで「問題が見つからなかった」項目を標本として再検査します。
入力はページから集めた文字の根拠（タイトル、リンク文言、Tab移動順）のみです。
result: supported（問題なしを裏付け）| contradicted（問題が見える＝見落とし疑い）| uncertain | insufficient_evidence。最終判定は人が行います。
reasonCode: ${Object.keys(VERIFY_REASON_CODES).join("|")}
必ずJSON配列のみを出力: [{"id":"…","result":"…","confidence":0~1,"reasonCode":"…","evidence":"…"}]`;

async function verifyPassWithAi(locale: "ko" | "ja", items: { id: string; input: PassSampleInput }[]): Promise<Map<string, ParsedVerification>> {
  const content: ContentBlock[] = [{ type: "text", text: locale === "ja" ? "以下の標本を再検査してください。" : "다음 표본을 검수해 주세요." }];
  for (const it of items) content.push({ type: "text", text: `id=${it.id} ${JSON.stringify(it.input).slice(0, 2500)}` });
  const text = await callAI({ system: locale === "ja" ? SYSTEM_JA : SYSTEM_KO, content, maxTokens: Math.min(4000, 800 + items.length * 150) });
  return verificationsFromAiText(text, new Set(items.map((i) => i.id)));
}

/**
 * 최근 끝난 회차에서 "문제 미발견" 표본을 뽑아 검수하고 저장한 수를 돌려준다.
 * AI 를 쓸 수 없으면 아무것도 저장하지 않는다 (다음에 같은 표본을 다시 시도).
 */
export async function processPassSamples(limit = 10, scanId?: string): Promise<number> {
  if (!passSampleEnabled() || !aiConfigured()) return 0;
  const rate = passSampleRate();
  const max = passSampleMaxPerScan();
  if (rate <= 0 || max === 0) return 0;
  // 끝난 지 6시간 안의 회차만 (문제 미발견 = 그 회차의 자동 점검이 끝난 뒤에만 의미가 있다)
  const scans = await db
    .select({ id: scan.id, pack: project.pack })
    .from(scan)
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(and(eq(scan.status, "done"), eq(project.aiEnabled, true), scanId ? eq(scan.id, scanId) : gt(scan.finishedAt, sql`now() - interval '6 hours'`)))
    .orderBy(desc(scan.finishedAt))
    .limit(5);
  let done = 0;
  for (const s of scans) {
    if (done >= limit) break;
    const pack = getPack(s.pack);
    const locale = s.pack === "jis2016" ? "ja" : "ko";
    try {
      const [pages, fs, decisions, prior] = await Promise.all([
        db.select().from(pageState).where(eq(pageState.scanId, s.id)),
        db.select({ pageStateId: finding.pageStateId, itemCode: finding.itemCode }).from(finding).where(eq(finding.scanId, s.id)),
        db.select({ itemCode: itemDecision.itemCode }).from(itemDecision).where(eq(itemDecision.scanId, s.id)),
        db
          .select({ pageStateId: findingVerification.pageStateId, itemCode: findingVerification.itemCode, promptVersion: findingVerification.promptVersion })
          .from(findingVerification)
          .where(and(eq(findingVerification.scanId, s.id), eq(findingVerification.target, "auto_pass_sample"), eq(findingVerification.verifier, "ai"))),
      ]);
      const doneKeys = new Set(prior.filter((x) => x.promptVersion === VERIFY_PROMPT_VERSION).map((x) => `${x.pageStateId}|${x.itemCode}`));
      const cands = passSampleCandidates(pack, pages, fs, new Set(decisions.map((d) => d.itemCode)), doneKeys);
      const picked = pickPassSamples(cands, rate, max, new Map([[s.id, prior.length]])).slice(0, limit - done);
      if (!picked.length) continue;
      const pageById = new Map(pages.map((p) => [p.id, p]));
      const items = picked.map((c, i) => {
        const input = passSampleInput(c, pageById.get(c.pageStateId)!, pack.items.find((it) => it.code === c.itemCode)?.title ?? "");
        return { id: `p${i}`, c, input, hash: passInputHash(input) };
      });
      const parsed = await verifyPassWithAi(locale, items);
      const values = items
        .map((it) => ({ it, v: parsed.get(it.id) }))
        .filter((x): x is { it: (typeof items)[number]; v: ParsedVerification } => Boolean(x.v))
        .map(({ it, v }) => ({
          scanId: s.id,
          target: "auto_pass_sample" as const,
          findingId: null,
          pageStateId: it.c.pageStateId,
          itemCode: it.c.itemCode,
          verifier: "ai" as const,
          result: v.result,
          confidence: v.confidence,
          evidence: v.evidence,
          reasonCode: v.reasonCode,
          autoResult: "pass",
          provider: aiProvider(),
          model: aiModel(),
          promptVersion: VERIFY_PROMPT_VERSION,
          inputHash: it.hash,
        }));
      if (values.length) await db.insert(findingVerification).values(values).onConflictDoNothing();
      done += values.length;
    } catch (e) {
      if (e instanceof BudgetExceeded) break;
      console.warn("[ai-verify-pass] 표본 검수 실패, 자동 결과만 유지:", scrubLog((e as Error).message));
    }
  }
  return done;
}
