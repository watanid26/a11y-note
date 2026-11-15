import { isJa } from "./client/t";
// 웹 화면 표기. 접근성 점검 실무 용어(오류 의심·수동 점검·점검자 판정)로 쓴다. 서류(Word·Excel)는 core/judge.ts·report/model.ts 표기를 그대로 쓰고,
// 뜻은 서로 1:1 로 같다.
export const UI_STATUS: Record<string, string> = {
  pass: "적합 (점검자 판정)",
  fail: "부적합 (점검자 판정)",
  na: "해당 없음 (점검자 판정)",
  fail_auto: "오류 의심",
  clear_auto: "자동 점검 오류 없음",
  na_auto: "해당 요소 없음",
  review: "수동 점검 필요",
  untested: "미점검",
};

export const UI_METRIC: Record<"confirmed_fail" | "auto_fail" | "review", string> = {
  confirmed_fail: "부적합 (점검자 판정)",
  auto_fail: "오류",
  review: "오류 의심",
};

/** 점검노트 판정 표기 (core/verdict.ts). pending = 아직 판정 중 */
export const VERDICT_UI: Record<"pass" | "fail" | "na" | "pending", { ko: string; cls: string }> = {
  pass: { ko: "적합", cls: "bg-ok-soft text-ok" },
  fail: { ko: "부적합", cls: "bg-bad-soft text-bad" },
  na: { ko: "해당 없음", cls: "bg-bg text-muted" },
  pending: { ko: "판정 중", cls: "border border-dashed border-line text-muted" },
};

export function verdictSourceText(source: "human" | "rule" | "ai" | null): string {
  if (source === "human") return "점검자 검토 완료";
  if (source === "ai") return "AI 판정";
  if (source === "rule") return "자동 점검";
  return "판정 중";
}

const VERDICT_JA: Record<"pass" | "fail" | "na" | "pending", string> = { pass: "適合", fail: "不適合", na: "適用なし", pending: "判定中" };
const METRIC_JA: Record<"confirmed_fail" | "auto_fail" | "review", string> = { confirmed_fail: "不適合（担当者の判定）", auto_fail: "問題", review: "問題の疑い" };

/** 화면 언어에 맞춘 판정 표기 (클라이언트 화면용) */
export function verdictUi(v: "pass" | "fail" | "na" | "pending"): { ko: string; cls: string } {
  return isJa() ? { ...VERDICT_UI[v], ko: VERDICT_JA[v] } : VERDICT_UI[v];
}

export function metricTitle(k: "confirmed_fail" | "auto_fail" | "review"): string {
  return isJa() ? METRIC_JA[k] : UI_METRIC[k];
}

export function verdictSourceTextLocal(source: "human" | "rule" | "ai" | null): string {
  if (!isJa()) return verdictSourceText(source);
  if (source === "human") return "担当者の確認済み";
  if (source === "ai") return "AI判定";
  if (source === "rule") return "自動チェック";
  return "判定中";
}

/** 판정 근거(core/verdict.ts 의 한국어 고정 문구)를 화면 언어로. AI 가 쓴 근거는 점검 언어로 이미 쓰여 있다 */
export function basisLocal(b: string): string {
  if (!isJa()) return b;
  let m: RegExpMatchArray | null;
  if ((m = b.match(/^오류 (\d+)곳$/))) return `問題 ${m[1]}か所`;
  if ((m = b.match(/^오류 의심 (\d+)곳이 해결되지 않아 부적합으로 판정했어요\.$/))) return `問題の疑い${m[1]}か所が解消されないため不適合としました。`;
  const fixed: Record<string, string> = {
    "자동 점검 규칙을 모두 통과했어요.": "自動チェックのルールをすべて満たしました。",
    "점검한 페이지에 해당 요소가 없어요.": "点検したページに対象の要素がありません。",
    "점검한 페이지에서 이 항목의 오류 근거를 찾지 못했어요.": "点検したページでこの達成基準の問題は見つかりませんでした。",
    "판정 중이에요.": "判定中です。",
    "아직 점검한 페이지가 없어요.": "まだ点検したページがありません。",
    "점검자 판정": "担当者の判定",
  };
  return fixed[b] ?? b;
}
