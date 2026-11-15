import { describe, expect, it } from "vitest";
import { compareScans, normalizeUrl, type CompareSide } from "./compare";

let n = 0;
const id = () => `id-${++n}`;
const scanOf = (o: Partial<CompareSide["scan"]> = {}): CompareSide["scan"] => ({
  id: id(), label: null, createdAt: new Date(), packVersion: "kwcag22-r2", engineVersion: "a11ynote-core 0.2.0 / axe-core 4.14.0", aiConfig: "AI 꺼짐", skipped: null, source: "server", ...o,
});
const page = (url: string, o: Partial<CompareSide["pages"][number]> = {}) => ({ id: id(), url, label: url, flowId: null, flowStep: null, ...o });
const f = (p: { id: string }, o: Partial<CompareSide["findings"][number]> = {}): CompareSide["findings"][number] => ({
  id: id(), pageStateId: p.id, itemCode: "5.1.1", ruleId: "image-alt", selector: "img.logo", message: "m", method: "auto", result: "fail", humanResult: null, reviewNote: null, ...o,
});
const side = (scan: CompareSide["scan"], pages: CompareSide["pages"], findings: CompareSide["findings"], items: CompareSide["items"] = []): CompareSide => ({ scan, pages, findings, items });

describe("재점검 비교", () => {
  it("주소 정규화: 쿼리·조각·끝 / 무시, 호스트 소문자", () => {
    expect(normalizeUrl("https://EX.com/a/?x=1#y")).toBe("https://ex.com/a");
    expect(normalizeUrl("https://ex.com")).toBe("https://ex.com/");
  });

  it("해결·신규·유지·변경 구분", () => {
    const bp = page("https://ex.com/a");
    const np = page("https://ex.com/a?session=1");
    const r = compareScans(
      side(scanOf(), [bp], [f(bp), f(bp, { itemCode: "6.4.3", ruleId: "link-name", selector: "a.x" }), f(bp, { itemCode: "7.3.2", ruleId: "label", selector: "input", result: "fail" })]),
      side(scanOf(), [np], [f(np), f(np, { itemCode: "8.2.1", ruleId: "button-name", selector: "button" }), f(np, { itemCode: "7.3.2", ruleId: "label", selector: "input", method: "ai", result: "review" })]),
    );
    expect(r.counts).toEqual({ new: 1, resolved: 1, persisting: 1, changed: 1, incomparable: 0 });
    expect(r.findings.find((x) => x.change === "resolved")?.itemCode).toBe("6.4.3");
    expect(r.findings.find((x) => x.change === "new")?.itemCode).toBe("8.2.1");
    expect(r.findings.find((x) => x.change === "changed")).toMatchObject({ before: "fail", after: "review" });
  });

  it("새 회차에서 점검 못 한 화면의 오류는 해결이 아니라 비교 불가", () => {
    const bp = page("https://ex.com/b");
    const r = compareScans(side(scanOf(), [bp], [f(bp)]), side(scanOf({ skipped: [{ url: "https://ex.com/b", reason: "시간 초과" }] }), [], []));
    expect(r.counts.resolved).toBe(0);
    expect(r.counts.incomparable).toBe(1);
    expect(r.pages[0]).toMatchObject({ change: "skipped" });
    expect(r.findings[0].reason).toContain("시간 초과");
  });

  it("새 회차에 없는 화면(주소 변경)도 비교 불가", () => {
    const bp = page("https://ex.com/old");
    const np = page("https://ex.com/new");
    const r = compareScans(side(scanOf(), [bp], [f(bp)]), side(scanOf(), [np], [f(np)]));
    expect(r.pages.map((p) => p.change).sort()).toEqual(["added", "missing"]);
    expect(r.counts).toMatchObject({ resolved: 0, incomparable: 1, new: 1 });
  });

  it("같은 키 화면이 여럿이면 짝을 정하지 않고 비교 불가", () => {
    const b1 = page("https://ex.com/d?a=1");
    const b2 = page("https://ex.com/d?a=2");
    const np = page("https://ex.com/d");
    const r = compareScans(side(scanOf(), [b1, b2], [f(b1), f(b2)]), side(scanOf(), [np], [f(np)]));
    expect(r.pages[0].change).toBe("ambiguous");
    expect(r.counts.persisting + r.counts.resolved + r.counts.new).toBe(0);
    expect(r.counts.incomparable).toBe(3);
  });

  it("같은 오류가 화면에 여러 개면 개수만큼 짝지음 (3 → 1 이면 2개 해결)", () => {
    const bp = page("https://ex.com/a");
    const np = page("https://ex.com/a");
    const r = compareScans(side(scanOf(), [bp], [f(bp), f(bp), f(bp)]), side(scanOf(), [np], [f(np)]));
    expect(r.counts).toMatchObject({ persisting: 1, resolved: 2 });
  });

  it("흐름 단계가 다르면 같은 주소라도 다른 화면", () => {
    const b = page("https://ex.com/apply", { flowId: "F", flowStep: 1 });
    const nn = page("https://ex.com/apply", { flowId: "F", flowStep: 2 });
    const r = compareScans(side(scanOf(), [b], []), side(scanOf(), [nn], []));
    expect(r.pages.map((p) => p.change).sort()).toEqual(["added", "missing"]);
  });

  it("이전 사람 판정은 참고 이력으로만 — 새 회차 판정에 복사하지 않음", () => {
    const bp = page("https://ex.com/a");
    const np = page("https://ex.com/a");
    const r = compareScans(
      side(scanOf(), [bp], [f(bp, { method: "ai", result: "review", humanResult: "pass", reviewNote: "장식 이미지" })]),
      side(scanOf(), [np], [f(np, { method: "ai", result: "review" })]),
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ change: "changed", before: "pass", after: "review", previousHuman: { result: "pass", note: "장식 이미지" } });
  });

  it("양쪽 다 문제 아님(적합)이면 목록에 넣지 않음", () => {
    const bp = page("https://ex.com/a");
    const np = page("https://ex.com/a");
    const r = compareScans(side(scanOf(), [bp], [f(bp, { humanResult: "pass" })]), side(scanOf(), [np], [f(np, { humanResult: "pass" })]));
    expect(r.findings).toHaveLength(0);
  });

  it("기준·엔진·AI 설정·점검 방식이 다르거나 모르면 경고", () => {
    const same = compareScans(side(scanOf(), [], []), side(scanOf(), [], []));
    expect(same.warnings).toEqual([]);
    const diff = compareScans(side(scanOf({ engineVersion: "unknown" }), [], []), side(scanOf({ packVersion: "kwcag22-r3", source: "extension" }), [], []));
    expect(diff.warnings.join("\n")).toMatch(/점검 기준.*다릅니다/);
    expect(diff.warnings.join("\n")).toMatch(/점검 엔진 버전을 한쪽 이상 알 수 없습니다/);
    expect(diff.warnings.join("\n")).toMatch(/점검 방식이 다릅니다/);
  });

  it("항목 상태 변화 방향", () => {
    const r = compareScans(
      side(scanOf(), [], [], [{ code: "5.1.1", status: "fail", decidedBy: "auto" }, { code: "6.1.1", status: "pass", decidedBy: "human" }, { code: "7.1.1", status: "review", decidedBy: "none" }]),
      side(scanOf(), [], [], [{ code: "5.1.1", status: "pass", decidedBy: "auto" }, { code: "6.1.1", status: "fail", decidedBy: "auto" }, { code: "7.1.1", status: "review", decidedBy: "none" }]),
    );
    expect(r.items.map((i) => [i.code, i.direction])).toEqual([["5.1.1", "better"], ["6.1.1", "worse"], ["7.1.1", "same"]]);
  });
});
