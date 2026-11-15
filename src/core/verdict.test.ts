import { describe, expect, it } from "vitest";
import { ruleItemVerdict, toolVerdict, toolVerdicts, verdictRate } from "./verdict";

const item = (status: string, decidedBy: string, extra: Partial<{ fails: number; note: string | null }> = {}) =>
  ({ code: "5.1.1", status, decidedBy, fails: extra.fails ?? 0, note: extra.note ?? null }) as Parameters<typeof toolVerdict>[0];

describe("점검노트 판정", () => {
  it("점검자 판정이 있으면 그것이 최종이고 검토 완료로 본다", () => {
    expect(toolVerdict(item("fail", "human"), { itemCode: "5.1.1", verdict: "pass", confidence: 0.9, evidence: "", source: "ai" })).toMatchObject({ verdict: "fail", source: "human", reviewed: true });
  });
  it("자동 규칙 결과는 그대로 판정한다", () => {
    expect(toolVerdict(item("fail", "auto", { fails: 3 }))).toMatchObject({ verdict: "fail", source: "rule", basis: "오류 3곳" });
    expect(toolVerdict(item("pass", "auto"))).toMatchObject({ verdict: "pass", source: "rule" });
    expect(toolVerdict(item("na", "auto"))).toMatchObject({ verdict: "na", source: "rule" });
  });
  it("규칙으로 결론이 안 난 항목은 항목 판정을 쓰고, 없으면 판정 중", () => {
    expect(toolVerdict(item("review", "none"), { itemCode: "5.1.1", verdict: "fail", confidence: 0.7, evidence: "대체 텍스트가 파일명입니다.", source: "ai" })).toMatchObject({ verdict: "fail", source: "ai", confidence: 0.7, reviewed: false });
    expect(toolVerdict(item("review", "none"))).toMatchObject({ verdict: null });
    expect(toolVerdict(item("untested", "none"))).toMatchObject({ verdict: null });
  });
  it("준수율은 모든 항목 판정 뒤에만, 해당 없음은 빼고 계산한다", () => {
    const all = toolVerdicts([item("pass", "auto"), { ...item("fail", "auto"), code: "5.2.1" }, { ...item("na", "auto"), code: "5.3.1" }], []);
    expect(verdictRate(all)).toBe(50);
    expect(verdictRate(toolVerdicts([item("pass", "auto"), { ...item("review", "none"), code: "5.2.1" }], []))).toBeNull();
  });
  it("AI 를 못 쓸 때: 해소되지 않은 오류 의심이 있으면 부적합, 없으면 적합 (확신 낮음)", () => {
    expect(ruleItemVerdict({ reviews: 2, pending: 0 })).toMatchObject({ verdict: "fail", confidence: 0.4 });
    expect(ruleItemVerdict({ reviews: 0, pending: 0 })).toMatchObject({ verdict: "pass", confidence: 0.4 });
  });
});
