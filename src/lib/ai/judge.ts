// AI 판정 대기(pending) 발견 사항을 처리한다.
// 페이지 단위로 묶어 한 번에 묻고, 확신도가 낮으면 사람 검토로 넘긴다.
// AI 를 못 쓰면(키 없음, 예산 초과, 오류) 규칙 기반 판정(fallback)으로 처리한다.

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { Candidate } from "../../core/types";
import { cropBox } from "../crop";
import { db, finding, pageState, project, scan } from "../db";
import { loadShot } from "../storage";
import { scrubLog } from "../security/log";
import { aiSafeUrl, redactText } from "../security/url";
import { aiConfigured, aiModel, aiProvider, BudgetExceeded, callAI, extractJson, type ContentBlock } from "./client";
import { fallbackVerdict, type Verdict } from "./fallback";
import { AI_REASON_CODES, AI_SUGGESTION_CODES, LIMIT, aiStoredReason, clip, isReasonCode, isSuggestionCode } from "../report/copy";

export const CONFIDENCE_THRESHOLD = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.75);
/** 프롬프트를 바꾸면 올린다 — 보고서·회차에 기록 (P0-10) */
export const PROMPT_VERSION = "p2";

/** 회차에 의미 판단 설정을 남긴다 (여러 설정이 섞이면 함께) */
async function recordAiConfig(scanId: string, config: string) {
  await db.execute(sql`update a11y.scan set ai_config = case
      when ai_config is null then ${config}
      when position(${config} in ai_config) > 0 then ai_config
      else left(ai_config || ' + ' || ${config}, 300) end
    where id = ${scanId}`);
}

/** 의미 판단 후보가 하나도 없어 processPending 이 기록하지 않는 회차에도 설정을 남긴다 (비교·보고서에서 "모름" 방지) */
export async function noteAiConfigIfUnset(scanId: string, aiEnabled: boolean) {
  await db.execute(sql`update a11y.scan set ai_config = ${aiEnabled && aiConfigured() ? `AI ${aiProvider()}/${aiModel()} · 판단할 후보 없음 · 프롬프트 ${PROMPT_VERSION}` : "AI 꺼짐 (규칙 판정 + 점검자 확인)"}
    where id = ${scanId} and ai_config is null
      and not exists (select 1 from a11y.finding f where f.scan_id = ${scanId} and f.result = 'pending')`);
}

const SYSTEM_KO = `당신은 한국형 웹 콘텐츠 접근성 지침(KWCAG 2.2)과 WCAG 2.2 에 정통한 웹 접근성 심사원입니다.
각 후보 요소가 기준을 지키는지 판단합니다. 확실하지 않으면 verdict 를 "unsure" 로 두고 confidence 를 낮게 줍니다.
판단 기준:
- image: 대체 텍스트가 이미지가 전달하는 정보(글자 포함)와 같은 뜻인지. 꾸밈 이미지면 alt="" 가 맞음. 파일명·"이미지" 같은 단어는 부적합.
- link: 링크 문구만으로 또는 바로 주변 문맥으로 목적지를 알 수 있는지.
- title: 페이지 제목이 그 페이지 내용을 설명하고 사이트 안에서 구별되는지.
- table: 캡션이 표의 제목·내용을 설명하는지.
- carousel: 자동 전환 콘텐츠를 멈출 수 있는 수단이 있는지.
- captcha: 캡차에 음성 등 대체 수단이 있는지.
- media: 자막·대본이 있는지.
문장을 길게 쓰지 말고 아래 코드 중에서 고릅니다.
reasonCode: ${Object.keys(AI_REASON_CODES).join("|")}
suggestionCode: ${Object.keys(AI_SUGGESTION_CODES).join("|")}
evidence: 판단 근거가 된 관찰 사실만 ${LIMIT.aiEvidence}자 이내 한 구절 (예: alt="배너01", 그림 속 글자 "민원 신청"). 평가·인사말·접속어를 쓰지 않습니다.
반드시 JSON 배열만 출력: [{"id":"…","verdict":"pass|fail|unsure","confidence":0~1,"reasonCode":"…","suggestionCode":"…","evidence":"…"}]`;

const SYSTEM_JA = `あなたはJIS X 8341-3:2016およびWCAG 2.2に精通したウェブアクセシビリティ試験員です。
各候補が達成基準を満たすか判断してください。確信がなければverdictを"unsure"にし、confidenceを低くします。
reasonCode: ${Object.keys(AI_REASON_CODES).join("|")}
suggestionCode: ${Object.keys(AI_SUGGESTION_CODES).join("|")}
evidence: 判断の根拠となった観察事実のみ ${LIMIT.aiEvidence}文字以内。
必ずJSON配列のみを出力: [{"id":"…","verdict":"pass|fail|unsure","confidence":0~1,"reasonCode":"…","suggestionCode":"…","evidence":"…"}]`;

interface AiItem {
  id: string;
  verdict: "pass" | "fail" | "unsure";
  confidence: number;
  reasonCode?: string;
  suggestionCode?: string;
  evidence?: string;
  /** 이전 프롬프트(p1) 호환: 자유문장 */
  reason?: string;
  suggestion?: string | null;
}

/**
 * AI 의견을 발견 사항 결과로 바꾼다.
 * AI 는 "문제 후보"만 올릴 수 있다. AI 가 문제 없다고 해도 적합 근거로 쓰지 않고 사람 검토로 넘긴다 (P0-7).
 */

export function toResult(v: { verdict: string; confidence: number; reason?: string }): "fail" | "review" {
  // 근거(이유) 없는 부적합 의견은 문제 후보로도 올리지 않고 사람 검토로 보낸다
  if (v.verdict === "fail" && v.confidence >= CONFIDENCE_THRESHOLD && (v.reason ?? "").trim().length >= 5) return "fail";
  return "review";
}

/**
 * 외부 AI 로 보내는 후보 정보 최소화 (P0-9): 주소는 쿼리·조각·세션 ID 를 빼고, 긴 문맥은 자른다.
 * 이미지는 요소 주변만 잘라 보내고(전체 화면 아님), 입력값은 수집 단계에서 이미 제외된다.
 */
export function aiSafeText(text: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(text ?? {})) {
    if (v == null) continue;
    let s = String(v);
    // 주소 값은 origin + 경로만, 그 밖의 글(문맥·alt 등) 속 주소·이메일·토큰도 가린다
    if (k === "src" || k === "href" || k === "url" || /^https?:\/\//i.test(s)) s = aiSafeUrl(s);
    else s = redactText(s).replace(/\b(?:https?:)?\/\/[^\s"'<>()]+/gi, (m) => aiSafeUrl(m.startsWith("//") ? `https:${m}` : m));
    if (s.startsWith("data:")) s = "data:(생략)";
    out[k] = s.slice(0, k === "context" ? 200 : 300);
  }
  return out;
}

/**
 * 같은 의미 후보를 한 번만 AI에 보낸다.
 * 선택자는 화면마다 달라질 수 있지만, 판정에 필요한 비식별화 텍스트와 캡처가 같으면
 * 결과도 같아야 한다. 호출 한 회 안에서만 쓰는 키라 오래된 결과가 섞이지 않는다.
 */
export function aiCandidateKey(locale: "ko" | "ja", candidate: Candidate, crop: Buffer | null): string {
  const text = Object.entries(aiSafeText(candidate.text))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, value]);
  const image = crop ? createHash("sha256").update(crop).digest("hex").slice(0, 24) : "no-image";
  return `${locale}|${candidate.kind}|${JSON.stringify(text)}|${image}`;
}

/**
 * AI 응답 글자 → 발견 사항별 판정. 형식이 깨졌으면 예외(호출 쪽에서 규칙 판정으로 대체), 알 수 없는 id 는 무시.
 * 저장 형식은 "[AI:코드] 짧은 근거"로 고정한다. AI 자유문장은 저장하지 않는다 (보고서 문체 고정).
 *  - reasonCode 가 목록에 없으면 insufficient 로 보고, 문제 후보(fail)로 올리지 않는다
 *  - 근거(evidence)는 최대 LIMIT.aiEvidence 자, 수정 제안은 고정 문구(suggestionCode)만 쓴다
 */
export function verdictsFromAiText(text: string, knownIds: Set<string>): Map<string, Verdict> {
  const parsed = extractJson<AiItem[]>(text);
  if (!Array.isArray(parsed)) throw new Error("AI 응답이 배열이 아닙니다.");
  const map = new Map<string, Verdict>();
  for (const p of parsed) {
    if (!p?.id || !knownIds.has(String(p.id))) continue;
    const confidence = Math.max(0, Math.min(1, Number(p.confidence) || 0));
    const code = isReasonCode(p.reasonCode) ? p.reasonCode : "insufficient";
    const evidence = clip(p.evidence ?? p.reason ?? "", LIMIT.aiEvidence);
    const verdict = code === "insufficient" ? "unsure" : String(p.verdict);
    const sc = isSuggestionCode(p.suggestionCode) ? p.suggestionCode : "none";
    map.set(String(p.id), {
      result: toResult({ verdict, confidence, reason: evidence }),
      confidence,
      reason: aiStoredReason(code, evidence),
      suggestion: AI_SUGGESTION_CODES[sc] || null,
    });
  }
  return map;
}

/** 의미 판단(AI·규칙)의 "문제 없음"은 참고 의견으로만 남기고 결과는 검토 필요로 둔다 */
export function noAutoPass(v: Verdict, source: "ai" | "rule"): Verdict {
  if (v.result !== "pass") return v;
  const prefix = source === "ai" ? "참고(AI 의견, 확인 필요): " : "참고(자동 확인 안 됨): ";
  return { ...v, result: "review", reason: `${prefix}${v.reason}` };
}

async function judgeWithAi(
  locale: "ko" | "ja",
  items: { id: string; candidate: Candidate; crop: Buffer | null }[],
): Promise<Map<string, Verdict>> {
  const content: ContentBlock[] = [];
  content.push({ type: "text", text: locale === "ja" ? "以下の候補を判定してください。" : "다음 후보들을 판정해 주세요." });
  for (const it of items) {
    content.push({ type: "text", text: `id=${it.id} kind=${it.candidate.kind} ${JSON.stringify(aiSafeText(it.candidate.text)).slice(0, 800)}` });
    if (it.crop) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: it.crop.toString("base64") } });
  }
  const text = await callAI({ system: locale === "ja" ? SYSTEM_JA : SYSTEM_KO, content, // Gemini 등 생각(thinking) 토큰이 출력 한도에 포함되는 모델은 한도가 작으면 JSON 이 중간에 잘려 규칙 판정으로 떨어진다.
    // 출력 형식을 코드로 줄인 대신 한도는 넉넉히 둔다 (실제 비용은 쓴 토큰만).
    maxTokens: Math.min(8000, 1024 + items.length * 150) });
  return verdictsFromAiText(text, new Set(items.map((i) => i.id)));
}

/** 대기 중인 AI 판정을 최대 limit 개 처리. 처리한 개수를 돌려준다. */
export async function processPending(limit = 40, scanId?: string): Promise<number> {
  const rows = await db
    .select({ f: finding, page: pageState, pack: project.pack, aiEnabled: project.aiEnabled })
    .from(finding)
    .innerJoin(pageState, eq(pageState.id, finding.pageStateId))
    .innerJoin(scan, eq(scan.id, finding.scanId))
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(scanId ? and(eq(finding.result, "pending"), eq(finding.scanId, scanId)) : eq(finding.result, "pending"))
    .orderBy(asc(finding.createdAt))
    .limit(limit);
  if (!rows.length) return 0;

  // 같은 점검 회차의 같은 후보는 페이지가 달라도 판정을 재사용한다.
  const verdictCache = new Map<string, Verdict>();

  const byPage = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byPage.get(r.page.id) ?? [];
    list.push(r);
    byPage.set(r.page.id, list);
  }

  for (const [, list] of byPage) {
    const page = list[0].page;
    const locale = list[0].pack === "jis2016" ? "ja" : "ko";
    // 같은 스캔의 제목 목록 (제목 중복 판단용)
    // 같은 주소를 여러 번 찍은 화면(흐름 단계)은 한 번만 센다
    const pairs = await db.select({ u: pageState.url, t: pageState.title }).from(pageState).where(eq(pageState.scanId, page.scanId));
    const byUrl = new Map(pairs.map((x) => [x.u.split("?")[0], x.t]));
    const titles = [...byUrl.values()];

    let verdicts = new Map<string, Verdict>();
    const candidateKeys = new Map<string, string>();
    let aiUsed = false;
    // 프로젝트에서 AI 를 켠 경우에만 외부 AI 로 보낸다 (기본 끔, P0-9)
    if (aiConfigured() && list[0].aiEnabled) {
      try {
        const shot = page.screenshotKey ? await loadShot(page.screenshotKey) : null;
        const items = await Promise.all(
          list.map(async (r) => ({
            id: r.f.id,
            candidate: r.f.candidate!,
            crop:
              shot && r.f.box && (r.f.candidate?.kind === "image" || r.f.candidate?.kind === "carousel" || r.f.candidate?.kind === "captcha")
                ? await cropBox(shot, r.f.box, { scale: page.screenshotScale, origin: page.screenshotOrigin }).catch(() => null)
                : null,
          })),
        );
        for (const item of items) {
          if (item.candidate) candidateKeys.set(item.id, aiCandidateKey(locale, item.candidate, item.crop));
        }
        const unique: typeof items = [];
        const seen = new Set<string>();
        for (const item of items) {
          if (!item.candidate) continue;
          const key = aiCandidateKey(locale, item.candidate, item.crop);
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push(item);
        }
        verdicts = await judgeWithAi(locale, unique);
        for (const item of unique) {
          const verdict = verdicts.get(item.id);
          if (verdict) verdictCache.set(aiCandidateKey(locale, item.candidate, item.crop), verdict);
        }
        aiUsed = true;
      } catch (e) {
        if (!(e instanceof BudgetExceeded)) console.warn("[ai] 판정 실패, 규칙 판정으로 대체:", scrubLog((e as Error).message));
      }
    }

    await recordAiConfig(
      page.scanId,
      aiUsed ? `AI ${aiProvider()}/${aiModel()} · 프롬프트 ${PROMPT_VERSION} · 문제 후보 기준 ${CONFIDENCE_THRESHOLD}` : list[0].aiEnabled && aiConfigured() ? "AI 실패 → 규칙 판정" : "AI 꺼짐 (규칙 판정 + 점검자 확인)",
    ).catch(() => {});
    for (const r of list) {
      const fromAi = candidateKeys.get(r.f.id) ? verdictCache.get(candidateKeys.get(r.f.id)!) ?? verdicts.get(r.f.id) : verdicts.get(r.f.id);
      const raw = fromAi ?? (r.f.candidate ? fallbackVerdict(r.f.candidate, { locale, siblingTitles: titles }) : { result: "review" as const, confidence: 0, reason: "", suggestion: null });
      const v = noAutoPass(raw, fromAi ? "ai" : "rule");
      await db
        .update(finding)
        .set({ result: v.result, confidence: v.confidence, aiReason: `${fromAi ? "" : "[규칙 판정] "}${v.reason}`, aiSuggestion: v.suggestion })
        .where(and(eq(finding.id, r.f.id), eq(finding.result, "pending")));
    }
  }
  return rows.length;
}

export async function pendingCount(scanIds: string[]): Promise<number> {
  if (!scanIds.length) return 0;
  const rows = await db.select({ id: finding.id }).from(finding).where(and(inArray(finding.scanId, scanIds), eq(finding.result, "pending")));
  return rows.length;
}
