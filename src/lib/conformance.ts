// 항목 단위 적합 판정 요약 (평균 점수 아님).
// WCAG 2.2 적합성은 해당 수준의 "모든" 적용 성공기준을 만족해야 하며 평균·비율로 정하지 않는다.
// KWCAG 2.2 도 항목을 모두 충족해야 하므로 같은 방식으로 본다. 결과는 자체진단이며 품질인증이 아니다.
import { displayStatus, type DisplayStatus, type ItemSummary } from "../core/judge";

export type ConformanceState = "not_met" | "all_confirmed_met" | "undetermined";

export const CONFORMANCE_LABEL: Record<ConformanceState, string> = {
  not_met: "기준 미충족 (점검자 확정 부적합 항목 있음)",
  all_confirmed_met: "모든 항목 점검자 확정 충족 (자체진단 결과, 인증 아님)",
  undetermined: "판정 불가 (점검자 확정 전 항목 있음)",
};

export interface ConformanceSummary {
  state: ConformanceState;
  /** 점검자 확정 부적합 항목 */
  failed: string[];
  /** 아직 점검자가 정하지 않은 항목 (자동 신호·자동 미발견·확인 필요·미점검·자동 해당 없음) */
  unconfirmed: string[];
  /** 자동 신호가 있어 점검자 확인이 먼저 필요한 항목 */
  autoSignals: string[];
  total: number;
  note: string;
}

const CONFIRMED = new Set<DisplayStatus>(["pass", "fail", "na"]);

export function conformanceSummary(items: Pick<ItemSummary, "code" | "status" | "decidedBy">[]): ConformanceSummary {
  return conformanceFromStatuses(items.map((i) => ({ code: i.code, status: displayStatus(i) })));
}

/** 이미 화면 표시 상태로 바꾼 항목 목록에서 계산 (통합 묶음의 통합 참고값 등) */
export function conformanceFromStatuses(items: { code: string; status: DisplayStatus }[]): ConformanceSummary {
  const d = items.map((i) => ({ code: i.code, s: i.status }));
  const failed = d.filter((x) => x.s === "fail").map((x) => x.code);
  const unconfirmed = d.filter((x) => !CONFIRMED.has(x.s)).map((x) => x.code);
  const autoSignals = d.filter((x) => x.s === "fail_auto").map((x) => x.code);
  const state: ConformanceState = failed.length ? "not_met" : unconfirmed.length || !items.length ? "undetermined" : "all_confirmed_met";
  return {
    state,
    failed,
    unconfirmed,
    autoSignals,
    total: items.length,
    note: "적합 여부는 평균·비율이 아니라 모든 해당 항목 충족으로 판단합니다. 하나라도 부적합이면 기준 미충족입니다. 자동 결과만으로는 충족을 확정하지 않습니다.",
  };
}
