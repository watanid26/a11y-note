// 점검노트 판정: 모든 항목에 적합·부적합·해당 없음 중 하나를 내린다.
// 점검자에게 판단을 넘기지 않는다. 점검자는 판정을 검토하고 틀린 것만 고친다 (점검자 판정이 있으면 그것이 최종).
//  1. 점검자 판정(item_decision)          → 그대로 (검토 완료)
//  2. 자동 규칙 결과(부적합·적합·해당 없음) → 그대로
//  3. 규칙으로 결론이 안 나는 항목          → 점검이 끝날 때 내린 항목 판정(item_verdict: AI 또는 규칙)
//  4. 항목 판정이 아직 없으면              → "판정 중"
// 판정 근거·확신도를 함께 돌려줘 화면과 서류가 무엇을 믿고 판정했는지 밝힌다.

import type { ItemSummary } from "./judge";

export type Verdict = "pass" | "fail" | "na";
export type VerdictSource = "human" | "rule" | "ai";

export interface ItemVerdictLike {
  itemCode: string;
  verdict: string;
  confidence: number;
  evidence: string;
  source: string;
}

export interface ToolVerdict {
  code: string;
  /** null = 아직 판정 중(점검 진행 중이거나 항목 판정 전) 또는 미점검 */
  verdict: Verdict | null;
  source: VerdictSource | null;
  /** 0~1. 점검자 판정과 자동 규칙 부적합·해당 없음은 1 */
  confidence: number;
  basis: string;
  /** 점검자가 검토해 확정했는지 */
  reviewed: boolean;
}

export function isVerdict(v: unknown): v is Verdict {
  return v === "pass" || v === "fail" || v === "na";
}

export function toolVerdict(item: Pick<ItemSummary, "code" | "status" | "decidedBy" | "fails" | "note">, stored?: ItemVerdictLike): ToolVerdict {
  const base = { code: item.code };
  if (item.decidedBy === "human" && isVerdict(item.status)) {
    return { ...base, verdict: item.status, source: "human", confidence: 1, basis: item.note || "점검자 판정", reviewed: true };
  }
  if (item.status === "untested") return { ...base, verdict: null, source: null, confidence: 0, basis: "아직 점검한 페이지가 없어요.", reviewed: false };
  if (item.status === "fail") {
    return { ...base, verdict: "fail", source: item.decidedBy === "ai" ? "ai" : "rule", confidence: item.decidedBy === "ai" ? 0.8 : 1, basis: `오류 ${item.fails}곳`, reviewed: false };
  }
  if (item.status === "na") return { ...base, verdict: "na", source: "rule", confidence: 1, basis: "점검한 페이지에 해당 요소가 없어요.", reviewed: false };
  if (item.status === "pass") return { ...base, verdict: "pass", source: "rule", confidence: 0.8, basis: "자동 점검 규칙을 모두 통과했어요.", reviewed: false };
  // review: 규칙으로 결론이 안 난 항목
  if (stored && isVerdict(stored.verdict)) {
    return { ...base, verdict: stored.verdict, source: stored.source === "ai" ? "ai" : "rule", confidence: stored.confidence, basis: stored.evidence, reviewed: false };
  }
  return { ...base, verdict: null, source: null, confidence: 0, basis: "판정 중이에요.", reviewed: false };
}

export function toolVerdicts(items: Pick<ItemSummary, "code" | "status" | "decidedBy" | "fails" | "note">[], stored: ItemVerdictLike[]): ToolVerdict[] {
  const byCode = new Map(stored.map((s) => [s.itemCode, s]));
  return items.map((i) => toolVerdict(i, byCode.get(i.code)));
}

/** 준수율: 판정이 모두 나온 뒤에만 낸다. 적합 ÷ (적합 + 부적합), 해당 없음 제외 */
export function verdictRate(vs: ToolVerdict[]): number | null {
  if (!vs.length || vs.some((v) => v.verdict === null)) return null;
  const pass = vs.filter((v) => v.verdict === "pass").length;
  const fail = vs.filter((v) => v.verdict === "fail").length;
  return pass + fail ? Math.round((pass / (pass + fail)) * 1000) / 10 : null;
}

/** 확신도 표기 (화면·서류 공통) */
export function confidenceLabel(c: number): "높음" | "보통" | "낮음" {
  return c >= 0.8 ? "높음" : c >= 0.6 ? "보통" : "낮음";
}

/**
 * AI 를 못 쓸 때의 항목 판정 (규칙). 해소되지 않은 오류 의심이 있으면 부적합으로 본다.
 * 거짓 적합이 보고서에 나가는 것보다 보수적으로 부적합을 내고 근거를 밝히는 편이 안전하다.
 */
export function ruleItemVerdict(item: Pick<ItemSummary, "reviews" | "pending">): { verdict: Verdict; confidence: number; evidence: string } {
  const open = item.reviews + item.pending;
  if (open > 0) return { verdict: "fail", confidence: 0.4, evidence: `오류 의심 ${open}곳이 해결되지 않아 부적합으로 판정했어요.` };
  return { verdict: "pass", confidence: 0.4, evidence: "점검한 페이지에서 이 항목의 오류 근거를 찾지 못했어요." };
}
