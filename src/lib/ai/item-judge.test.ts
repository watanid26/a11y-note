import { describe, expect, it } from "vitest";
import { itemPromptLine, itemsToJudge, itemVerdictsFromAiText } from "./item-judge";
import type { ItemSummary } from "../../core/judge";

const summary = (code: string, status: string, decidedBy: string) => ({ code, status, decidedBy }) as ItemSummary;

describe("항목 판정 (AI)", () => {
  it("규칙으로 결론이 안 났고 점검자 판정이 없는 항목만 판정한다", () => {
    const got = itemsToJudge([summary("5.1.1", "review", "none"), summary("5.4.1", "pass", "auto"), summary("6.1.4", "review", "human")]);
    expect(got.map((x) => x.code)).toEqual(["5.1.1"]);
  });
  it("AI 응답에서 알려진 항목·올바른 판정만 받는다", () => {
    const text = '```json\n[{"code":"5.4.1","verdict":"fail","confidence":1.4,"evidence":"필수 입력을 빨간색으로만 표시합니다."},{"code":"9.9.9","verdict":"pass"},{"code":"6.1.4","verdict":"unsure"}]\n```';
    const m = itemVerdictsFromAiText(text, new Set(["5.4.1", "6.1.4"]));
    expect([...m.keys()]).toEqual(["5.4.1"]);
    expect(m.get("5.4.1")).toEqual({ verdict: "fail", confidence: 1, evidence: "필수 입력을 빨간색으로만 표시합니다." });
  });
  it("프롬프트에는 오류 의심을 최대 5개만, 개인정보는 가려서 넣는다", () => {
    const line = itemPromptLine({ item: { code: "7.3.1", title: "오류 정정", how: "입력 오류 안내 확인" }, open: Array.from({ length: 7 }, (_, i) => ({ ruleId: `r${i}`, text: `메일 a${i}@example.com 확인` })) });
    expect(line.match(/- r\d/g)).toHaveLength(5);
    expect(line).not.toContain("@example.com");
  });
});
