// 기준 외 참고 보존 + 2026-10-24 판정 정책 (6.1.3 · 7.2.1 · 5.3.1 은 자동 부적합 아님, 5.4.3 차단 메모)
import { describe, expect, it } from "vitest";
import { BLOCKING_NOTES, findingsFromState, summarizeItems, unmappedReferencesFromState } from "./judge";
import { getPack } from "./packs";
import type { Applicability, CapturedState, RawResult } from "./types";

const applicable: Applicability = { images: 0, media: 0, tables: 1, forms: 0, inputs: 0, links: 1, newWindowLinks: 1, carousels: 0, captchas: 0, iframes: 0, timeLimitHint: false, accessKeys: 0 };
const node = (selector: string) => ({ selector, html: "", box: null, message: "" });
function state(results: RawResult[]): CapturedState {
  return {
    url: "https://example.go.kr/", title: "홈", label: "홈",
    snapshot: { coreVersion: "t", url: "https://example.go.kr/", title: "홈", lang: "ko", viewport: { w: 1280, h: 900, scrollH: 2000 }, results, candidates: [], applicable, outline: { navLinks: [], forms: [], searchInput: null }, templateSignature: "x" },
    keyboard: null,
  };
}
const kr = getPack("kwcag22");

describe("기준 외 참고 (unmapped reference)", () => {
  const s = state([
    { engine: "axe", ruleId: "region", outcome: "violation", impact: "moderate", wcag: [], help: "region", nodes: [node("#a")] },
    { engine: "axe", ruleId: "p-as-heading", outcome: "violation", impact: "serious", wcag: ["1.3.1"], help: "p", nodes: [node("#a")] },
    { engine: "axe", ruleId: "image-alt", outcome: "violation", impact: "critical", wcag: ["1.1.1"], help: "alt", nodes: [node("img")] },
  ]);

  it("연결 항목이 없는 결과는 버리지 않고 규칙·위치별로 보존", () => {
    const refs = unmappedReferencesFromState(kr, s);
    expect(refs.map((r) => r.ruleId)).toEqual(["region", "p-as-heading"]);
    expect(refs.every((r) => r.kind === "unmapped_reference" && r.selector === "#a")).toBe(true);
    expect(refs[1].wcag).toEqual(["1.3.1"]);
  });

  it("KWCAG 판정에는 들어가지 않음 (발견 사항·항목 결과 그대로)", () => {
    const fs = findingsFromState(kr, s);
    expect(fs.map((f) => f.ruleId)).toEqual(["image-alt"]);
    const items = summarizeItems(kr, fs, [applicable]);
    expect(items).toHaveLength(33);
    expect(items.filter((i) => i.status === "fail").map((i) => i.code)).toEqual(["5.1.1"]);
  });

  it("자체 규칙도 그 기준에 연결되지 않으면 참고로만 남음 (JIS 의 새 창 안내)", () => {
    const refs = unmappedReferencesFromState(getPack("jis2016"), state([{ engine: "custom", ruleId: "kr-new-window", outcome: "violation", impact: "moderate", wcag: ["3.2.5"], help: "새 창", nodes: [node("a")] }]));
    expect(refs.map((r) => r.ruleId)).toEqual(["kr-new-window"]);
  });
});

describe("판정 정책: 원문상 권고·미명시는 자동 부적합이 아님", () => {
  it.each([
    ["kr-small-target", "6.1.3"],
    ["kr-new-window", "7.2.1"],
    ["kr-table-caption", "5.3.1"],
  ])("%s 위반 → %s 사람 확인 필요", (ruleId, code) => {
    const fs = findingsFromState(kr, state([{ engine: "custom", ruleId, outcome: "violation", impact: "moderate", wcag: [], help: ruleId, nodes: [node("#x")] }]));
    expect(fs).toHaveLength(1);
    expect(fs[0].itemCode).toBe(code);
    expect(fs[0].result).toBe("review");
  });

  it("5.4.3 은 텍스트 명도 대비 그대로, 확대 예외는 차단 메모로만 (명도 대비 위반 판정은 바뀌지 않음)", () => {
    expect(kr.items.find((i) => i.code === "5.4.3")?.title).toBe("텍스트 콘텐츠의 명도 대비");
    expect(BLOCKING_NOTES["5.4.3"]).toContain("차단");
    const fs = findingsFromState(kr, state([{ engine: "axe", ruleId: "color-contrast", outcome: "violation", impact: "serious", wcag: ["1.4.3"], help: "c", nodes: [node("p")] }]));
    expect(fs[0].result).toBe("fail");
  });
});
