// Phase 1: 자동 점검 결과(axe-core·자체 규칙이 낸 finding)를 AI 가 2차 검수한다.
// 원칙
//  - 원본 finding(자동 결과·사람 판정)은 바꾸지 않는다. 검수 결과는 finding_verification 에 한 줄씩 쌓는다.
//  - AI 가 자동 fail 을 반박해도 pass 로 바꾸지 않고 사람 확인으로 보낸다. AI 지지도 확정이 아니다.
//  - 의미 후보 AI 판단(judge.ts, method=ai)과 다른 계층이다. 대상은 method=auto 결과뿐이다.
//  - 외부로 보내는 입력은 judge.ts 와 같은 기준으로 줄인다: 주소는 origin+경로, 글은 가림 처리, 캡처는 요소 주변만.
//  - 비용: 기본 꺼짐(AI_VERIFY_ENABLED=1 일 때만), 프로젝트 AI 켜짐일 때만, 회차당 상한(AI_VERIFY_MAX_PER_SCAN),
//    callAI 의 하루·전체 예산 상한을 그대로 따른다.

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { itemByCode, getPack } from "../../core/packs";
import { cropBox } from "../crop";
import { db, finding, findingVerification, pageState, project, scan, type Finding, type PageState } from "../db";
import { LIMIT, clip } from "../report/copy";
import { scrubLog } from "../security/log";
import { aiSafeUrl, redactText } from "../security/url";
import { loadShot } from "../storage";
import { aiConfigured, aiModel, aiProvider, BudgetExceeded, callAI, extractJson, type ContentBlock } from "./client";
import {
  DEFAULT_VERIFY_CONFIDENCE_THRESHOLD,
  ROUTE_LABEL,
  VERIFICATION_LABEL,
  VERIFICATION_RESULTS,
  VERIFY_REASON_CODES,
  routeVerification as routeVerificationShared,
  type VerificationResult,
  type VerificationRoute,
  type VerifyReasonCode,
} from "./verification-shared";

export {
  ROUTE_LABEL,
  VERIFICATION_LABEL,
  VERIFICATION_RESULTS,
  VERIFY_REASON_CODES,
} from "./verification-shared";
export type { VerificationResult, VerificationRoute, VerifyReasonCode } from "./verification-shared";

/** 프롬프트를 바꾸면 올린다 — 검수 이력에 함께 저장한다 */
export const VERIFY_PROMPT_VERSION = "v1";
export const VERIFY_CONFIDENCE_THRESHOLD = Number(process.env.AI_VERIFY_CONFIDENCE ?? 0.75);

export function verifyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.AI_VERIFY_ENABLED === "1";
}
export function verifyMaxPerScan(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.AI_VERIFY_MAX_PER_SCAN ?? 30);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30;
}

// ── 처리 규칙 (설계 §6.3) ───────────────────────────────────────────

/**
 * 자동 결과와 AI 검수 결과로 다음 처리를 정한다. 결과 값(fail/review/pass)은 절대 바꾸지 않는다.
 *  fail + 지지(신뢰도 충분) → 자동 신호 유지 / fail + 반박·보류·낮은 신뢰도 → 사람 확인 / fail + 근거 부족 → 기록만
 *  review → 어떤 결과든 사람 확인 (원래 사람이 볼 결과)
 *  pass + 반박 → 누락 의심으로 사람 확인 / pass + 그 밖 → 기록만 (AI 지지로 적합 확정하지 않음)
 */
export function routeVerification(autoResult: string, v: { result: VerificationResult; confidence: number | null }): VerificationRoute {
  return routeVerificationShared(autoResult, v, VERIFY_CONFIDENCE_THRESHOLD || DEFAULT_VERIFY_CONFIDENCE_THRESHOLD);
}

// ── 대상 선정 ─────────────────────────────────────────────────────

type SelectRow = Pick<Finding, "id" | "scanId" | "method" | "result" | "humanResult" | "createdAt">;

/**
 * 검수 대상: 자동(method=auto) 결과 중 fail 먼저, 그다음 review. 사람이 이미 판정한 것, 이미 같은 프롬프트로 검수한 것은 뺀다.
 * 회차마다 상한(이미 검수한 수 포함)을 넘지 않는다.
 */
export function selectForVerification<T extends SelectRow>(rows: T[], verified: Set<string>, usedPerScan: Map<string, number>, maxPerScan: number): T[] {
  const rank: Record<string, number> = { fail: 0, review: 1 };
  const eligible = rows
    .filter((r) => r.method === "auto" && (r.result === "fail" || r.result === "review") && !r.humanResult && !verified.has(r.id))
    .sort((a, b) => rank[a.result] - rank[b.result] || +a.createdAt - +b.createdAt);
  const used = new Map(usedPerScan);
  const out: T[] = [];
  for (const r of eligible) {
    const n = used.get(r.scanId) ?? 0;
    if (n >= maxPerScan) continue;
    used.set(r.scanId, n + 1);
    out.push(r);
  }
  return out;
}

// ── 입력 최소화 ───────────────────────────────────────────────────

export interface VerificationInput {
  ruleId: string;
  item: string;
  autoResult: string;
  message: string;
  html: string;
  selector: string;
  page: string;
  title: string;
}

/** 외부 AI 로 보내는 글: 가림 처리 + 길이 제한. 입력값(value)은 수집 단계에서 빠지고 여기서도 한 번 더 지운다 */
export function verificationInput(f: Pick<Finding, "ruleId" | "itemCode" | "result" | "message" | "html" | "selector">, page: Pick<PageState, "url" | "title">, itemTitle: string): VerificationInput {
  const safe = (s: string, n: number) => redactText(s ?? "").replace(/\b(?:https?:)?\/\/[^\s"'<>()]+/gi, (m) => aiSafeUrl(m.startsWith("//") ? `https:${m}` : m)).slice(0, n);
  return {
    ruleId: f.ruleId.slice(0, 60),
    item: `${f.itemCode} ${itemTitle}`.slice(0, 80),
    autoResult: f.result,
    message: safe(f.message, 300),
    html: safe((f.html ?? "").replace(/\svalue\s*=\s*("[^"]*"|'[^']*')/gi, ""), 300),
    selector: (f.selector ?? "").slice(0, 200),
    page: aiSafeUrl(page.url),
    title: safe(page.title ?? "", 120),
  };
}

/** 입력 증거 식별자: 실제로 보낸 글과 잘라낸 캡처의 sha256. 같은 입력은 한 번만 묻는 키로도 쓴다 */
export function inputHash(input: VerificationInput, crop: Buffer | null): string {
  const h = createHash("sha256").update(JSON.stringify(input));
  if (crop) h.update(crop);
  return h.digest("hex");
}

// ── AI 응답 해석 ─────────────────────────────────────────────────

export interface ParsedVerification {
  result: VerificationResult;
  confidence: number;
  reasonCode: VerifyReasonCode;
  evidence: string;
}

/**
 * AI 응답 → 검수 결과. 형식이 깨졌으면 예외, 모르는 id 는 무시.
 * 결과 값이 목록에 없거나 이유 코드가 목록에 없으면 insufficient_evidence 로 본다.
 */
export function verificationsFromAiText(text: string, knownIds: Set<string>): Map<string, ParsedVerification> {
  const parsed = extractJson<{ id?: unknown; result?: unknown; confidence?: unknown; reasonCode?: unknown; evidence?: unknown }[]>(text);
  if (!Array.isArray(parsed)) throw new Error("AI 응답이 배열이 아닙니다.");
  const out = new Map<string, ParsedVerification>();
  for (const p of parsed) {
    const id = String(p?.id ?? "");
    if (!knownIds.has(id)) continue;
    const code = typeof p.reasonCode === "string" && p.reasonCode in VERIFY_REASON_CODES ? (p.reasonCode as VerifyReasonCode) : "insufficient";
    const raw = typeof p.result === "string" && (VERIFICATION_RESULTS as string[]).includes(p.result) ? (p.result as VerificationResult) : "insufficient_evidence";
    out.set(id, {
      result: code === "insufficient" ? "insufficient_evidence" : raw,
      confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
      reasonCode: code,
      evidence: clip(redactText(String(p.evidence ?? "")), LIMIT.aiEvidence),
    });
  }
  return out;
}

const SYSTEM_KO = `당신은 KWCAG 2.2·WCAG 2.2 웹 접근성 심사원입니다. 자동 점검 도구(axe-core·자체 규칙)가 낸 결과를 다시 검수합니다.
각 항목에 대해 자동 점검 결과가 입력(규칙·메시지·HTML 조각·요소 주변 캡처)으로 뒷받침되는지 판단합니다.
- supported: 지적한 문제가 입력에서 관찰됨
- contradicted: 입력을 보면 지적한 문제가 아닌 것으로 보임 (오탐 의심)
- uncertain: 둘 다 가능함
- insufficient_evidence: 입력만으로 판단할 수 없음
최종 판정은 사람이 합니다. 확실하지 않으면 uncertain 또는 insufficient_evidence 를 고르고 confidence 를 낮게 줍니다.
reasonCode: ${Object.keys(VERIFY_REASON_CODES).join("|")}
evidence: 입력에서 관찰한 사실만 ${LIMIT.aiEvidence}자 이내 한 구절. 개인정보·입력값을 옮겨 적지 않습니다.
반드시 JSON 배열만 출력: [{"id":"…","result":"supported|contradicted|uncertain|insufficient_evidence","confidence":0~1,"reasonCode":"…","evidence":"…"}]`;

const SYSTEM_JA = `あなたはJIS X 8341-3:2016・WCAG 2.2のウェブアクセシビリティ試験員です。自動チェック（axe-core・独自ルール）の結果を再検査します。
各項目について、自動チェックの結果が入力（ルール・メッセージ・HTML断片・要素周辺のキャプチャ）で裏付けられるか判断します。
result: supported | contradicted | uncertain | insufficient_evidence。最終判定は人が行います。確信がなければconfidenceを低くします。
reasonCode: ${Object.keys(VERIFY_REASON_CODES).join("|")}
evidence: 入力で観察した事実のみ ${LIMIT.aiEvidence}文字以内。
必ずJSON配列のみを出力: [{"id":"…","result":"…","confidence":0~1,"reasonCode":"…","evidence":"…"}]`;

async function verifyWithAi(locale: "ko" | "ja", items: { id: string; input: VerificationInput; crop: Buffer | null }[]): Promise<Map<string, ParsedVerification>> {
  const content: ContentBlock[] = [{ type: "text", text: locale === "ja" ? "以下の自動チェック結果を再検査してください。" : "다음 자동 점검 결과를 검수해 주세요." }];
  for (const it of items) {
    content.push({ type: "text", text: `id=${it.id} ${JSON.stringify(it.input).slice(0, 1200)}` });
    if (it.crop) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: it.crop.toString("base64") } });
  }
  const text = await callAI({ system: locale === "ja" ? SYSTEM_JA : SYSTEM_KO, content, maxTokens: Math.min(6000, 1024 + items.length * 150) });
  return verificationsFromAiText(text, new Set(items.map((i) => i.id)));
}

/**
 * 검수 대기 자동 결과를 최대 limit 개 처리하고 처리한 수를 돌려준다.
 * AI 를 쓸 수 없으면(꺼짐·키 없음·예산 초과·오류) 아무것도 저장하지 않는다 — 원본 자동 결과만 남고 다음에 다시 시도한다.
 */
export async function processVerifications(limit = 20, scanId?: string): Promise<number> {
  if (!verifyEnabled() || !aiConfigured()) return 0;
  const max = verifyMaxPerScan();
  if (max === 0) return 0;
  const base = and(eq(finding.method, "auto"), inArray(finding.result, ["fail", "review"]), isNull(finding.humanResult), eq(project.aiEnabled, true));
  const rows = await db
    .select({ f: finding, page: pageState, pack: project.pack })
    .from(finding)
    .innerJoin(pageState, eq(pageState.id, finding.pageStateId))
    .innerJoin(scan, eq(scan.id, finding.scanId))
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(
      and(
        scanId ? and(base, eq(finding.scanId, scanId)) : base,
        sql`not exists (select 1 from a11y.finding_verification v where v.target = 'finding' and v.finding_id = ${finding.id} and v.verifier = 'ai' and v.prompt_version = ${VERIFY_PROMPT_VERSION})`,
      ),
    )
    .orderBy(sql`case when ${finding.result} = 'fail' then 0 else 1 end`, asc(finding.createdAt))
    .limit(limit * 3);
  if (!rows.length) return 0;
  const scanIds = [...new Set(rows.map((r) => r.f.scanId))];
  const counts = await db
    .select({ scanId: findingVerification.scanId, n: sql<number>`count(*)::int` })
    .from(findingVerification)
    .where(and(eq(findingVerification.verifier, "ai"), eq(findingVerification.target, "finding"), inArray(findingVerification.scanId, scanIds)))
    .groupBy(findingVerification.scanId);
  const used = new Map(counts.map((c) => [c.scanId, Number(c.n)]));
  const picked = new Set(selectForVerification(rows.map((r) => r.f), new Set(), used, max).slice(0, limit).map((f) => f.id));
  const todo = rows.filter((r) => picked.has(r.f.id));

  const byPage = new Map<string, typeof todo>();
  for (const r of todo) byPage.set(r.page.id, [...(byPage.get(r.page.id) ?? []), r]);
  let done = 0;
  for (const [, list] of byPage) {
    const page = list[0].page;
    const locale = list[0].pack === "jis2016" ? "ja" : "ko";
    const pack = getPack(list[0].pack);
    try {
      const shot = page.screenshotKey && !page.screenshotDeletedAt ? await loadShot(page.screenshotKey).catch(() => null) : null;
      const items = await Promise.all(
        list.map(async (r) => {
          const input = verificationInput(r.f, page, itemByCode(pack, r.f.itemCode)?.title ?? "");
          const crop = shot && r.f.box ? await cropBox(shot, r.f.box, { scale: page.screenshotScale, origin: page.screenshotOrigin }).catch(() => null) : null;
          return { id: r.f.id, input, crop, hash: inputHash(input, crop), row: r };
        }),
      );
      // 같은 입력(같은 규칙·조각·캡처)은 한 번만 묻는다
      const unique = [...new Map(items.map((i) => [i.hash, i])).values()];
      const parsed = await verifyWithAi(locale, unique);
      const byHash = new Map(unique.map((u) => [u.hash, parsed.get(u.id)]));
      const values = items
        .map((i) => ({ i, v: byHash.get(i.hash) }))
        .filter((x): x is { i: (typeof items)[number]; v: ParsedVerification } => Boolean(x.v))
        .map(({ i, v }) => ({
          scanId: i.row.f.scanId,
          target: "finding" as const,
          findingId: i.id,
          verifier: "ai" as const,
          result: v.result,
          confidence: v.confidence,
          evidence: v.evidence,
          reasonCode: v.reasonCode,
          autoResult: i.row.f.result,
          provider: aiProvider(),
          model: aiModel(),
          promptVersion: VERIFY_PROMPT_VERSION,
          inputHash: i.hash,
        }));
      // 같은 결과·같은 프롬프트는 한 번만 (0021 고유 인덱스, 워커와 1분 작업이 겹쳐도 중복 저장 없음)
      if (values.length) await db.insert(findingVerification).values(values).onConflictDoNothing();
      done += values.length;
    } catch (e) {
      if (e instanceof BudgetExceeded) break;
      console.warn("[ai-verify] 검수 실패, 자동 결과만 유지:", scrubLog((e as Error).message));
    }
  }
  return done;
}
