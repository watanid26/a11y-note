// 서버 쪽 판정: 브라우저에서 모은 결과(CapturedState)를 팩 항목별 "발견 사항"으로 바꾸고,
// 발견 사항을 모아 항목별 결과(적합/부적합/검토 필요/해당 없음)를 낸다.
// DB·네트워크와 무관한 순수 함수라 테스트하기 쉽다.

import { itemByCode, itemForResult, type Pack } from "./packs";
import type { Applicability, Box, Candidate, CapturedState, KeyboardTrace, RawResult } from "./types";

export type FindingResult = "fail" | "review" | "pending" | "pass";
export type FindingMethod = "auto" | "ai" | "manual";

export interface DraftFinding {
  itemCode: string;
  method: FindingMethod;
  result: FindingResult;
  ruleId: string;
  message: string;
  selector: string;
  html: string;
  box: Box | null;
  /** AI 판정 대기 후보의 원본 정보 */
  candidate?: Candidate;
}

/**
 * 기준 외 참고: 이 팩의 어느 항목에도 연결되지 않은 규칙 결과.
 * 판정·항목 결과·문제 수에는 넣지 않고 참고로만 보존한다 (findingsFromState 반환값과 별도).
 */
export interface UnmappedReference {
  kind: "unmapped_reference";
  engine: RawResult["engine"];
  ruleId: string;
  outcome: RawResult["outcome"];
  wcag: string[];
  message: string;
  selector: string;
  html: string;
  box: Box | null;
}

export function unmappedReferencesFromState(pack: Pack, state: CapturedState): UnmappedReference[] {
  const out: UnmappedReference[] = [];
  for (const r of state.snapshot.results) {
    if (itemForResult(pack, r)) continue;
    for (const n of r.nodes) {
      out.push({ kind: "unmapped_reference", engine: r.engine, ruleId: r.ruleId, outcome: r.outcome, wcag: r.wcag, message: n.message ? `${r.help} — ${n.message}` : r.help, selector: n.selector, html: n.html, box: n.box });
    }
  }
  return out;
}

/**
 * 원문이 권고이거나 원문에 직접 요구가 없어, 규칙 위반만으로 부적합이라 할 수 없는 자체 규칙 (KWCAG 2.2 원문 대조, 2026-10-24 정책).
 * 위반이 나와도 "사람 확인 필요"로 둔다.
 */
export const ADVISORY_RULES: Record<string, string> = {
  "kr-small-target": "KWCAG 6.1.3 의 대각 6mm 는 원문상 \"바람직하다\"(권고)입니다. 크기만으로 부적합이 아니며 사람이 확인합니다.",
  "kr-new-window": "KWCAG 7.2.1 은 사용자가 의도하지 않은 새 창·맥락 변화가 실제로 일어날 때 부적합입니다. 안내 문구 누락만으로는 부적합이 아니며 실제 동작을 사람이 확인합니다.",
  "kr-table-caption": "KWCAG 5.3.1 은 <caption> 누락만으로 부적합이 아닙니다. 표 제목·제목 셀·관계와 구조를 사람이 확인합니다.",
};

export function isAdvisoryRule(ruleId: string): boolean {
  return ruleId in ADVISORY_RULES;
}

/**
 * 차단 메모: 원문 해석을 확정하기 전까지 코드로 판정하지 않는 사항. 판정 로직에는 쓰지 않는다.
 * 5.4.3 은 KWCAG 2.2 에서 "텍스트 콘텐츠의 명도 대비"다. 확대 관련 예외는 별도 항목으로 라벨링하지 않고 자동 판정하지 않는다.
 */
export const BLOCKING_NOTES: Record<string, string> = {
  "5.4.3": "KWCAG 5.4.3 = 텍스트 콘텐츠의 명도 대비. 원문의 확대 관련 예외는 정확한 기준 확인 전까지 라벨링·자동 판정하지 않음 (차단).",
};

/** KWCAG 판정 기준과 다른 WCAG 전용 기준(2.5.8 대상 크기)으로만 보는 규칙 */
export function isWcagOnlyTargetRule(ruleId: string): boolean {
  return ruleId === "target-size";
}

/**
 * 스킵 링크는 평상시 화면에서 1×1px 또는 숨김 상태였다가 키보드 초점이 오면
 * 커지는 구현이 흔하다. axe target-size만으로는 이 상태를 오탐할 수 있으므로
 * 키보드·대상 위치 규칙(kr-small-target)에서 별도로 확인한다.
 */
function isLikelySkipLink(node: { selector: string; html: string; message: string }): boolean {
  const text = `${node.selector} ${node.html} ${node.message}`.toLowerCase();
  const hasFragment = /href\s*=\s*["']#[^"']*["']/.test(text);
  const hasSkipHint = /(skip|skip-link|accessibility|본문\s*바로가기|(?:주|주요)\s*메뉴\s*바로가기|건너뛰기|주요\s*내용)/i.test(text);
  // axe가 html을 생략하고 selector만 남기는 경우에도 일부 공공기관 사이트처럼
  // #accessibility 컨테이너를 사용하는 구현을 놓치지 않는다.
  const hasSkipContainer = /(?:#|\b)(accessibility|skip(?:-link)?)(?:\b|\s|>)/i.test(node.selector);
  return hasSkipHint && (hasFragment || hasSkipContainer);
}

/** best-practice 규칙(WCAG 번호가 없는 것)은 바로 부적합으로 보지 않고 "확인 필요"로 둔다 */
function outcomeToResult(outcome: "violation" | "incomplete", wcag: string[], ruleId: string): FindingResult {
  if (outcome === "incomplete") return "review";
  if (!ruleId.startsWith("kr-") && wcag.length === 0) return "review";
  return "fail";
}

export function findingsFromState(pack: Pack, state: CapturedState): DraftFinding[] {
  const out: DraftFinding[] = [];
  for (const r of state.snapshot.results) {
    const item = itemForResult(pack, r);
    if (!item) continue; // 연결 항목이 없는 결과는 unmappedReferencesFromState 로 따로 보존한다
    let result = outcomeToResult(r.outcome, r.wcag, r.ruleId);
    // KWCAG 6.1.3 은 "대각선 6mm" 기준이다. axe target-size(WCAG 2.5.8, 24×24px·간격)는 그 판정 근거가 아니므로
    // 자동 신호로 세지 않고 사람 확인 필요(WCAG 참고)로 둔다. 6mm 기준은 자체 규칙 kr-small-target 이 본다.
    if (pack.id === "kwcag22" && isWcagOnlyTargetRule(r.ruleId) && result === "fail") result = "review";
    if (isAdvisoryRule(r.ruleId) && result === "fail") result = "review";
    for (const n of r.nodes) {
      // axe 2.5.8의 대상 크기 판정은 평상시 숨겨진 스킵 링크를 오탐할 수 있다.
      // 스킵 링크는 자체 KWCAG 규칙과 키보드 추적에서 검토한다.
      if (r.ruleId === "target-size" && isLikelySkipLink(n)) continue;
      out.push({
        itemCode: item,
        method: "auto",
        result,
        ruleId: r.ruleId,
        message: n.message ? `${r.help} — ${n.message}` : r.help,
        selector: n.selector,
        html: n.html,
        box: n.box,
      });
    }
  }
  if (state.keyboard) out.push(...findingsFromKeyboard(pack, state.keyboard));
  for (const c of state.snapshot.candidates) {
    const item = itemForResult(pack, { ruleId: `ai-${c.kind}`, wcag: [] });
    if (!item) continue;
    // 링크·캡차·슬라이드는 이미 규칙 결과로 "확인 필요"가 올라와 있으면 그 항목을 AI 가 이어받는다
    out.push({
      itemCode: item,
      method: "ai",
      result: "pending",
      ruleId: `ai-${c.kind}`,
      message: candidateMessage(c),
      selector: c.selector,
      html: "",
      box: c.box,
      candidate: c,
    });
  }
  return dedupe(out);
}

function candidateMessage(c: Candidate): string {
  switch (c.kind) {
    case "image":
      return c.text.alt ? `대체 텍스트 "${c.text.alt}" 가 이미지 내용과 맞는지` : "alt=\"\" (꾸밈 이미지)로 처리해도 되는지";
    case "link":
      return `링크 "${c.text.name}" 의 목적이 문맥으로 드러나는지`;
    case "title":
      return `페이지 제목 "${c.text.title}" 이 페이지 내용을 설명하는지`;
    case "table":
      return `표 캡션 "${c.text.caption}" 이 표 내용을 설명하는지`;
    case "carousel":
      return "자동 슬라이드에 정지 수단이 있는지";
    case "captcha":
      return "캡차에 대체 인증 수단이 있는지";
    case "media":
      return "영상·음성에 자막·대본이 있는지";
    default:
      return "적절한지";
  }
}

/** 같은 항목·같은 요소에 대한 중복은 더 나쁜 결과 하나만 남긴다 */
function dedupe(list: DraftFinding[]): DraftFinding[] {
  const rank: Record<FindingResult, number> = { fail: 3, review: 2, pending: 1, pass: 0 };
  const map = new Map<string, DraftFinding>();
  for (const f of list) {
    // 같은 항목에서 같은 요소를 두 규칙이 함께 잡으면(예: axe target-size + 자체 크기 규칙) 하나만 남긴다
    const key = `${f.itemCode}|${f.selector}|${f.method}`;
    const prev = map.get(key);
    if (!prev || rank[f.result] > rank[prev.result]) map.set(key, f);
  }
  return [...map.values()];
}

function findingsFromKeyboard(pack: Pack, kb: KeyboardTrace): DraftFinding[] {
  const out: DraftFinding[] = [];
  const push = (ruleId: string, result: FindingResult, message: string, selector: string, box: Box | null) => {
    const item = itemForResult(pack, { ruleId, wcag: [] });
    if (item) out.push({ itemCode: item, method: "auto", result, ruleId, message, selector, html: "", box });
  };
  if (kb.trappedAt) {
    const stop = kb.stops.find((s) => s.selector === kb.trappedAt);
    push("kr-keyboard-trap", "fail", "Tab 키로 이 요소에서 빠져나갈 수 없습니다 (키보드 함정).", kb.trappedAt, stop?.box ?? null);
  }
  if (kb.reverseTrappedAt && kb.reverseTrappedAt !== kb.trappedAt) {
    const stop = kb.stops.find((s) => s.selector === kb.reverseTrappedAt);
    push("kr-keyboard-trap", "fail", "Shift+Tab 키로 이 요소에서 뒤로 빠져나갈 수 없습니다 (역방향 키보드 함정).", kb.reverseTrappedAt, stop?.box ?? null);
  }
  const seen = new Set<string>();
  for (const s of kb.stops) {
    if (seen.has(s.selector)) continue;
    seen.add(s.selector);
    if (!s.indicator) push("kr-focus-indicator", "fail", `Tab 으로 초점이 왔을 때 표시가 보이지 않습니다 ("${s.text || s.tag}").`, s.selector, s.box);
  }
  // 화면 위쪽으로 크게 되돌아가는 이동이 잦으면 순서 확인 필요
  let backJumps = 0;
  for (let i = 1; i < kb.stops.length; i++) {
    const a = kb.stops[i - 1].box;
    const b = kb.stops[i].box;
    if (a && b && b.y < a.y - 200) backJumps++;
  }
  if (backJumps >= 3) {
    push("kr-focus-order", "review", `Tab 이동 중 화면 위쪽으로 되돌아가는 경우가 ${backJumps}번 있습니다. 순서가 논리적인지 확인이 필요합니다.`, "body", null);
  }
  return out;
}

// ── 항목별 결과 ─────────────────────────────────────────────────────────

/** untested = 점검한 페이지가 없어 판단할 근거가 없음 */
export type ItemStatus = "pass" | "fail" | "review" | "na" | "untested";

export interface FindingLike {
  itemCode: string;
  method: FindingMethod;
  result: FindingResult;
  /** 사람이 검토해서 정한 결과 (있으면 이게 우선) */
  humanResult?: "fail" | "pass" | null;
}

export interface ItemDecisionLike {
  itemCode: string;
  status: ItemStatus;
  note?: string | null;
}

export interface ItemSummary {
  code: string;
  title: string;
  principle: string;
  method: string;
  level?: string;
  status: ItemStatus;
  decidedBy: "auto" | "ai" | "human" | "none";
  fails: number;
  reviews: number;
  pending: number;
  note: string | null;
}

/**
 * 발견 사항의 실제 결과. 사람 판정이 있으면 그것, 없으면 자동 결과.
 * 이전 버전에서 저장된 의미 판단(AI·규칙) "pass" 는 적합 근거가 아니므로 검토 필요로 본다 (P0-7, 기존 데이터 보호).
 */
export function effectiveResult(f: Pick<FindingLike, "method" | "result" | "humanResult">): FindingResult {
  if (f.humanResult) return f.humanResult;
  if (f.method === "ai" && f.result === "pass") return "review";
  return f.result;
}

export function summarizeItems(
  pack: Pack,
  findings: FindingLike[],
  applicable: Applicability[],
  decisions: ItemDecisionLike[] = [],
): ItemSummary[] {
  return pack.items.map((item) => {
    const fs = findings.filter((f) => f.itemCode === item.code);
    const fails = fs.filter((f) => effectiveResult(f) === "fail");
    const reviews = fs.filter((f) => effectiveResult(f) === "review");
    const pending = fs.filter((f) => effectiveResult(f) === "pending");
    const decision = decisions.find((d) => d.itemCode === item.code);
    const base = { code: item.code, title: item.title, principle: item.principle, method: item.method, level: item.level, fails: fails.length, reviews: reviews.length, pending: pending.length };

    if (decision) return { ...base, status: decision.status, decidedBy: "human" as const, note: decision.note ?? null };

    if (applicable.length === 0 && fs.length === 0) return { ...base, status: "untested" as const, decidedBy: "none" as const, note: "아직 점검한 페이지가 없습니다." };
    const present = item.applies ? applicable.reduce((sum, a) => sum + Number(a[item.applies!] ?? 0), 0) > 0 : true;
    if (!present && fs.length === 0) return { ...base, status: "na" as const, decidedBy: "auto" as const, note: "점검한 페이지에 해당 요소가 없습니다." };

    if (fails.length) {
      const byHuman = fails.some((f) => f.humanResult);
      const byAi = fails.every((f) => f.method === "ai");
      return { ...base, status: "fail" as const, decidedBy: byHuman ? ("human" as const) : byAi ? ("ai" as const) : ("auto" as const), note: null };
    }
    if (reviews.length || pending.length) return { ...base, status: "review" as const, decidedBy: "none" as const, note: null };
    if (item.method === "manual" || item.needsHuman) return { ...base, status: "review" as const, decidedBy: "none" as const, note: "사람 확인이 필요한 항목입니다." };
    // 자동 점검에서 문제가 나오지 않았다는 뜻일 뿐, 적합 확정이 아니다.
    // 발견 사항 일부를 사람이 "문제 없음"으로 봤더라도 항목 전체를 확인한 것은 아니므로 적합 확정은 항목 단위 결정(itemDecision)으로만 한다.
    return { ...base, status: "pass" as const, decidedBy: "auto" as const, note: null };
  });
}

// ── 화면·서류에 보여 줄 상태 ─────────────────────────────────────────
// "적합·부적합·해당 없음"은 사람이 확정한 경우에만 쓴다. 자동 결과는 (자동)을 붙여 구분한다.

export type DisplayStatus = "pass" | "fail" | "na" | "fail_auto" | "clear_auto" | "na_auto" | "review" | "untested";

export function displayStatus(i: Pick<ItemSummary, "status" | "decidedBy">): DisplayStatus {
  if (i.status === "untested") return "untested";
  if (i.status === "review") return "review";
  const human = i.decidedBy === "human";
  if (i.status === "pass") return human ? "pass" : "clear_auto";
  if (i.status === "fail") return human ? "fail" : "fail_auto";
  return human ? "na" : "na_auto";
}

/** 사람이 확정한 상태인지 */
export function isConfirmed(d: DisplayStatus): boolean {
  return d === "pass" || d === "fail" || d === "na";
}

export const DISPLAY_LABEL: Record<"ko" | "ja", Record<DisplayStatus, string>> = {
  ko: { pass: "적합(점검자 확정)", fail: "부적합(점검자 확정)", na: "해당 없음(점검자 확정)", fail_auto: "자동 신호(확정 아님)", clear_auto: "자동 오류 미발견(확정 아님)", na_auto: "해당 요소 없음(자동)", review: "사람 확인 필요", untested: "미점검" },
  ja: { pass: "適合", fail: "不適合", na: "適用なし", fail_auto: "不適合（自動）", clear_auto: "問題未検出（自動）", na_auto: "適用なし（自動）", review: "要確認", untested: "未試験" },
};

export function itemTitle(pack: Pack, code: string): string {
  return itemByCode(pack, code)?.title ?? code;
}
