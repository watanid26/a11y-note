import { describe, expect, it } from "vitest";
import { findingsFromState, summarizeItems } from "./judge";
import { getPack } from "./packs";
import { blockedPolicies, classifyFinding, classifyItem, classifyState } from "./result-status";
import type { Applicability, CapturedState, RawResult } from "./types";

const applicable: Applicability = { images: 1, media: 0, tables: 1, forms: 0, inputs: 0, links: 1, newWindowLinks: 1, carousels: 0, captchas: 0, iframes: 0, timeLimitHint: false, accessKeys: 0 };
const node = (selector: string) => ({ selector, html: "", box: null, message: "" });
function state(results: RawResult[]): CapturedState {
  return {
    url: "https://example.go.kr/", title: "홈", label: "홈",
    snapshot: { coreVersion: "t", url: "https://example.go.kr/", title: "홈", lang: "ko", viewport: { w: 1280, h: 900, scrollH: 2000 }, results, candidates: [], applicable, outline: { navLinks: [], forms: [], searchInput: null }, templateSignature: "x" },
    keyboard: null,
  };
}
const kr = getPack("kwcag22");
const s = state([
  { engine: "axe", ruleId: "image-alt", outcome: "violation", impact: "critical", wcag: ["1.1.1"], help: "alt", nodes: [node("img")] },
  { engine: "custom", ruleId: "kr-new-window", outcome: "violation", impact: "moderate", wcag: ["3.2.5"], help: "새 창", nodes: [node("a")] },
  { engine: "axe", ruleId: "region", outcome: "violation", impact: "moderate", wcag: [], help: "region", nodes: [node("#r")] },
]);

describe("결과 상태 분류", () => {
  it("mapped · advisory · unmapped_reference 를 나누고, 기준 외 참고는 1건 그대로 보존", () => {
    const c = classifyState(kr, s);
    expect(c.map((x) => x.status).sort()).toEqual(["advisory", "mapped", "unmapped_reference"]);
    const ref = c.find((x) => x.status === "unmapped_reference");
    expect(ref && "reference" in ref ? ref.reference.ruleId : null).toBe("region");
    const adv = c.find((x) => x.status === "advisory");
    expect(adv && "finding" in adv ? [adv.finding.itemCode, adv.finding.result] : null).toEqual(["7.2.1", "review"]);
  });

  it("기존 반환값은 그대로 (기준 외 참고는 findingsFromState 에 없음)", () => {
    expect(findingsFromState(kr, s).map((f) => f.ruleId).sort()).toEqual(["image-alt", "kr-new-window"]);
  });

  it("manual: 수동 항목(5.3.3)에 연결된 결과·항목", () => {
    expect(classifyFinding(kr, { itemCode: "5.3.3", ruleId: "x", method: "auto" })).toBe("manual");
    expect(classifyFinding(kr, { itemCode: "5.1.1", ruleId: "x", method: "manual" })).toBe("manual");
    expect(classifyItem(kr, { code: "5.3.3", status: "review", decidedBy: "none" }).status).toBe("manual");
  });

  it("na: 항목 상태 na 에서만 나오고 itemStatus 를 함께 돌려줌", () => {
    const items = summarizeItems(kr, [], [applicable]);
    const media = classifyItem(kr, items.find((i) => i.code === "5.2.1")!);
    expect(media).toEqual({ code: "5.2.1", status: "na", itemStatus: "na", decidedBy: "auto" });
    expect(classifyItem(kr, items.find((i) => i.code === "5.4.3")!).status).toBe("mapped");
  });

  it("blocked: 5.4.3 확대 예외는 정책 이슈로만 표시, 명도 대비 판정은 그대로 mapped", () => {
    expect(blockedPolicies(kr)).toEqual([{ status: "blocked", code: "5.4.3", note: expect.stringContaining("텍스트 콘텐츠의 명도 대비") }]);
    expect(blockedPolicies(getPack("jis2016"))).toEqual([]);
    expect(classifyFinding(kr, { itemCode: "5.4.3", ruleId: "color-contrast", method: "auto" })).toBe("mapped");
  });
});
