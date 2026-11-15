// 결과 상태 분류: 판정 결과(fail/review/pass…)와 별개로 "이 결과가 어떤 성격인지"를 나눈다.
// 기존 findingsFromState·summarizeItems 의 반환값과 DB·보고서 형식은 바꾸지 않는 어댑터다 (저장·보고서 연결은 아직 안 함).
//  mapped             = 팩 항목에 연결돼 일반 판정 대상으로 들어가는 결과
//  unmapped_reference = 어느 항목에도 연결되지 않아 기준 외 참고로만 보존하는 결과
//  advisory           = 원문이 권고이거나 직접 요구가 없어 자동 부적합 확정이 아닌 규칙 결과 (ADVISORY_RULES)
//  manual             = 사람이 판단하는 항목·결과 (자동 부적합 확정 아님)
//  blocked            = 공식 기준 확인 전까지 자동 판정을 금지한 정책 이슈 (BLOCKING_NOTES)
//  na                 = 해당 없음. 항목 상태(ItemStatus "na")에서만 나오며, itemStatus 를 함께 돌려줘 혼동하지 않게 한다

import { BLOCKING_NOTES, findingsFromState, isAdvisoryRule, unmappedReferencesFromState, type DraftFinding, type ItemStatus, type ItemSummary, type UnmappedReference } from "./judge";
import { itemByCode, type Pack } from "./packs";
import type { CapturedState } from "./types";

export type ResultStatus = "mapped" | "unmapped_reference" | "advisory" | "manual" | "blocked" | "na";

/** 발견 사항 하나의 분류. 연결된 결과는 mapped·advisory·manual 중 하나 */
export function classifyFinding(pack: Pack, f: Pick<DraftFinding, "itemCode" | "ruleId" | "method">): Exclude<ResultStatus, "unmapped_reference" | "blocked" | "na"> {
  if (isAdvisoryRule(f.ruleId)) return "advisory";
  if (f.method === "manual" || itemByCode(pack, f.itemCode)?.method === "manual") return "manual";
  return "mapped";
}

export function classifyReference(_ref: UnmappedReference): "unmapped_reference" {
  return "unmapped_reference";
}

export type ClassifiedResult =
  | { status: "mapped" | "advisory" | "manual"; finding: DraftFinding }
  | { status: "unmapped_reference"; reference: UnmappedReference };

/** 화면 하나의 결과를 분류해서 돌려준다. findingsFromState 결과는 그대로 두고 옆에 분류만 붙인다 */
export function classifyState(pack: Pack, state: CapturedState): ClassifiedResult[] {
  return [
    ...findingsFromState(pack, state).map((finding) => ({ status: classifyFinding(pack, finding), finding })),
    ...unmappedReferencesFromState(pack, state).map((reference) => ({ status: classifyReference(reference), reference })),
  ];
}

export interface ItemClassification {
  code: string;
  status: Extract<ResultStatus, "mapped" | "manual" | "na">;
  /** 기존 항목 상태 그대로 (분류 na 와 항목 상태 na 를 같은 값으로 오해하지 않도록 따로 둔다) */
  itemStatus: ItemStatus;
  decidedBy: ItemSummary["decidedBy"];
}

/** 항목 하나의 분류. 항목 상태가 na(자동·점검자 확정 모두)면 na, 수동 항목이면 manual, 나머지는 mapped */
export function classifyItem(pack: Pack, s: Pick<ItemSummary, "code" | "status" | "decidedBy">): ItemClassification {
  const status = s.status === "na" ? "na" : itemByCode(pack, s.code)?.method === "manual" ? "manual" : "mapped";
  return { code: s.code, status, itemStatus: s.status, decidedBy: s.decidedBy };
}

export interface BlockedPolicy {
  status: "blocked";
  code: string;
  note: string;
}

/**
 * 자동 판정을 금지한 정책 이슈 목록 (KWCAG 팩만).
 * 항목 판정 자체를 막는 것이 아니다: 5.4.3 텍스트 명도 대비 판정은 그대로이고, 확대 예외를 새 판정으로 만들지 않는다는 표시다.
 */
export function blockedPolicies(pack: Pack): BlockedPolicy[] {
  if (pack.id !== "kwcag22") return [];
  return Object.entries(BLOCKING_NOTES).map(([code, note]) => ({ status: "blocked" as const, code, note }));
}
