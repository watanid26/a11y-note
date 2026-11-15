// 항목 단위 적합 요약: 평균·비율이 아니라 "모든 해당 항목 충족"
import { describe, expect, it } from "vitest";
import { conformanceSummary } from "./conformance";

const it_ = (code: string, status: "pass" | "fail" | "review" | "na" | "untested", decidedBy: "auto" | "ai" | "human" | "none") => ({ code, status, decidedBy });

describe("conformanceSummary", () => {
  it("점검자 확정 부적합이 하나라도 있으면 미충족 (나머지가 모두 적합이어도)", () => {
    const r = conformanceSummary([it_("a", "pass", "human"), it_("b", "pass", "human"), it_("c", "fail", "human")]);
    expect(r.state).toBe("not_met");
    expect(r.failed).toEqual(["c"]);
  });
  it("자동 오류 미발견만으로는 충족을 확정하지 않음", () => {
    expect(conformanceSummary([it_("a", "pass", "human"), it_("b", "pass", "auto")]).state).toBe("undetermined");
  });
  it("자동 신호는 부적합 확정이 아님 → 판정 불가, 자동 신호 목록에 표시", () => {
    const r = conformanceSummary([it_("a", "fail", "auto")]);
    expect(r.state).toBe("undetermined");
    expect(r.autoSignals).toEqual(["a"]);
  });
  it("모든 항목을 점검자가 적합·해당 없음으로 확정하면 충족 (자체진단, 인증 아님)", () => {
    expect(conformanceSummary([it_("a", "pass", "human"), it_("b", "na", "human")]).state).toBe("all_confirmed_met");
  });
  it("항목이 없으면 판정 불가", () => {
    expect(conformanceSummary([]).state).toBe("undetermined");
  });
});
