import { describe, expect, it } from "vitest";
import { displayStatus } from "../../core/judge";
import { summary } from "./data";
import { issueRecords, itemRows } from "./model";
import { buildScanView } from "../scan-view";
import { PAGES, emptyView, findings, fixtureView, project, scanRow } from "./test-fixture";

const v = fixtureView();
const status = (code: string) => displayStatus(v.items.find((i) => i.code === code)!);

describe("실제 DB 형식 finding → 판정 상태 (회귀)", () => {
  it("7가지 상태가 섞이지 않는다", () => {
    expect(status("5.1.1")).toBe("fail");
    expect(status("7.1.1")).toBe("fail_auto");
    expect(status("6.1.2")).toBe("clear_auto");
    expect(status("8.2.1")).toBe("review");
    expect(status("5.3.1")).toBe("review");
    expect(status("6.4.2")).toBe("review");
    expect(status("6.4.4")).toBe("na");
    expect(status("6.5.1")).toBe("pass");
    expect(status("5.2.1")).toBe("na_auto");
    expect(emptyView().items.every((i) => displayStatus(i) === "untested")).toBe(true);
  });

  it("묶음(group)은 저장된 자동 결과와 점검자 판정을 그대로 보존", () => {
    const g = v.groups.find((x) => x.itemCode === "6.1.2")!;
    expect(g).toMatchObject({ result: "pass", autoResult: "fail", humanResult: "pass", method: "auto" });
    const lang = v.groups.find((x) => x.itemCode === "7.1.1")!;
    expect(lang).toMatchObject({ result: "fail", autoResult: "fail", humanResult: null });
    expect(lang.pages).toHaveLength(2);
    expect(lang.findingIds).toHaveLength(2); // 사람 확인을 두 화면에 한 번에 적용
    expect(v.groups.find((x) => x.itemCode === "6.4.2")!.findingIds).toHaveLength(1); // 이전 AI pass 저장분도 빠지지 않음
    const old = v.groups.find((x) => x.itemCode === "6.4.2")!;
    expect(old).toMatchObject({ result: "review", autoResult: "pass", method: "ai" });
  });

  it("문제 기록: 확정 부적합 / 자동 신호 / 확인 필요로 나뉘고, 검토·대기·문제없음이 자동 부적합으로 바뀌지 않음", () => {
    const issues = issueRecords(v);
    const by = (code: string) => issues.filter((x) => x.itemCode === code).map((x) => x.state);
    expect(by("5.1.1")).toEqual(["confirmed_fail"]);
    expect(by("7.1.1")).toEqual(["auto_fail"]);
    expect(by("6.1.2")).toEqual([]);
    expect(by("8.2.1")).toEqual(["review"]);
    expect(by("5.3.1")).toEqual([]); // AI 대기는 오류 목록에 넣지 않음 (항목은 검토 필요)
    expect(by("6.4.2")).toEqual(["review"]);
    expect(issues.map((x) => x.id)).toEqual(issues.map((_, i) => `P-${String(i + 1).padStart(3, "0")}`));
    // 위치는 빠짐없이, 전체 URL 그대로
    const lang = issues.find((x) => x.itemCode === "7.1.1")!;
    expect(lang.locations.map((l) => l.url)).toEqual(["https://example.go.kr/", "https://example.go.kr/board/notice/list.do?menuId=1234&page=1"]);
    expect(lang.locations.map((l) => l.shotId)).toEqual(["S01", "S02"]);
  });

  it("항목 행: 자동 결과와 점검자 판정이 따로", () => {
    const rows = itemRows(v, issueRecords(v));
    const r = (code: string) => rows.find((x) => x.code === code)!;
    expect(r("5.1.1")).toMatchObject({ auto: "signal", human: "fail" });
    expect(r("7.1.1")).toMatchObject({ auto: "signal", human: "undecided" });
    expect(r("6.1.2")).toMatchObject({ auto: "clear", human: "undecided" }); // 화면과 같게: 사람이 그 위치를 "오류 아님"으로 봄. 항목 확정은 아님
    expect(r("6.1.2").note).toContain("오류 아님");
    expect(r("8.2.1")).toMatchObject({ auto: "review", human: "undecided" });
    expect(r("6.4.4")).toMatchObject({ human: "na" });
    expect(r("6.5.1")).toMatchObject({ human: "pass" });
    expect(r("5.2.1")).toMatchObject({ auto: "absent", human: "undecided" });
    expect(itemRows(emptyView(), [])[0]).toMatchObject({ auto: "untested", human: "untested" });
  });

  it("요약 수와 항목 행이 같은 결과를 말한다", () => {
    const s = summary(v);
    const rows = itemRows(v, issueRecords(v));
    expect(s.counts.pass).toBe(rows.filter((x) => x.human === "pass").length);
    expect(s.counts.fail).toBe(rows.filter((x) => x.human === "fail").length);
    expect(s.counts.na).toBe(rows.filter((x) => x.human === "na").length);
    expect(s.confirmedRate).toBeNull();
  });

  it("AI 를 쓰지 않은 규칙 판정 근거는 'AI 의견'으로 표시하지 않음", () => {
    const rec = issueRecords(v).find((x) => x.itemCode === "6.4.2")!;
    expect(rec.basis).toBe("규칙 판정: 제목이 사이트 이름만 있음");
  });
});

describe("판정 대기 수 (Codex 리뷰 6)", () => {
  it("AI 대기였던 위치를 사람이 정하면 대기 수에서 빠짐", () => {
    expect(fixtureView().pending).toBe(1);
    const fs = findings().map((f) => (f.result === "pending" ? { ...f, humanResult: "fail" as const } : f));
    const v2 = buildScanView(scanRow(), project(), PAGES, fs, [], []);
    expect(v2.pending).toBe(0);
    expect(displayStatus(v2.items.find((i) => i.code === "5.3.1")!)).toBe("fail");
  });
});
