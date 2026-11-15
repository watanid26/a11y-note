import { describe, expect, it } from "vitest";
import { docStatus, isDemoTarget, summary, summaryLine } from "./data";
import type { ScanView } from "../scan-view";
import type { ItemSummary } from "../../core/judge";

function view(items: Pick<ItemSummary, "status" | "decidedBy">[]): ScanView {
  return { items: items.map((i, n) => ({ code: String(n), title: "", principle: "", method: "auto", fails: 0, reviews: 0, pending: 0, note: null, ...i })), pages: [] } as unknown as ScanView;
}
const H = (status: ItemSummary["status"]) => ({ status, decidedBy: "human" as const });
const A = (status: ItemSummary["status"]) => ({ status, decidedBy: "auto" as const });

describe("준수율·상태별 항목 수", () => {
  it("테스트 도메인은 시연용으로 분류한다", () => {
    expect(isDemoTarget("https://example.go.kr/main.html")).toBe(true);
    expect(isDemoTarget("https://www.example.go.kr/main.html")).toBe(true);
    expect(isDemoTarget("https://www.gov-sample.kr/main.html")).toBe(false);
  });
  it("판정 중인 항목이 있으면 준수율을 내지 않고 판정별 수만 보여 줌", () => {
    const s = summary(view([H("pass"), H("pass"), H("pass"), H("fail"), H("na"), A("pass"), A("fail"), A("na"), { status: "review", decidedBy: "none" }, { status: "untested", decidedBy: "none" }]));
    expect(s.confirmedRate).toBeNull();
    expect(s.confirmed).toBe(8);
    expect(s.reviewed).toBe(5);
    expect(s.verdictCounts).toEqual({ pass: 4, fail: 2, na: 2, pending: 2 });
    expect(s.counts).toMatchObject({ pass: 3, fail: 1, na: 1, clear_auto: 1, fail_auto: 1, na_auto: 1, review: 1, untested: 1 });
    const line = summaryLine(s, false);
    expect(line).toContain("전체 10개 항목");
    expect(line).toContain("점검노트 판정 8개");
    expect(line).toContain("점검자 검토 5개");
    expect(line).toContain("모든 항목 판정 후 계산 (현재 8/10개 판정)");
    expect(line).not.toMatch(/준수율 \d/);
    expect(docStatus(s, false)).toContain("초안");
  });
  it("점검노트가 자동 규칙으로 모두 판정하면 점검자 검토 전이어도 준수율을 낸다", () => {
    const s = summary(view([A("pass"), A("pass"), A("fail")]));
    expect(s.allConfirmed).toBe(true);
    expect(s.confirmedRate).toBe(66.7);
    expect(s.reviewed).toBe(0);
    expect(summaryLine(s, false)).toContain("준수율 66.7%");
    expect(docStatus(s, false)).toBe("확정본 (점검자 검토 0/3개 항목)");
  });
  it("모두 판정되면 준수율 = 적합 ÷ (적합 + 부적합), 해당 없음 제외", () => {
    const s = summary(view([H("pass"), H("pass"), H("pass"), H("fail"), H("na")]));
    expect(s.allConfirmed).toBe(true);
    expect(s.confirmedRate).toBe(75);
    expect(summaryLine(s, false)).toContain("준수율 75%");
    expect(docStatus(s, false)).toBe("확정본 (점검자 검토 5/5개 항목)");
  });
  it("미검사 항목이 있으면 확정본이 아님", () => {
    const s = summary(view([H("pass"), { status: "untested", decidedBy: "none" }]));
    expect(s.counts.untested).toBe(1);
    expect(s.confirmedRate).toBeNull();
    expect(summaryLine(s, false)).toContain("미점검 1");
  });
});
