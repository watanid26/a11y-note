// 독립 심사(07) 반영 회귀 테스트: 기준 매핑, 우선순위, 원인 묶음, 9·18 각주, 제출 정보 초안 표시
import { describe, expect, it } from "vitest";
import type { Finding } from "../db";
import { isWcagOnlyTargetRule } from "../../core/judge";
import { buildScanView } from "../scan-view";
import { isDemoTarget, submissionInfo } from "./data";
import { byPriority, causeGroups, causeText, issueRecords, priorityOf, reportMetrics, reviewFootnote } from "./model";
import { PAGES, findings, fixtureView, project, scanRow } from "./test-fixture";

const T = new Date("2026-10-01T01:00:00Z");
function extra(id: string, page: string, item: string, rule: string, result: string, selector: string): Finding {
  return { ...findings()[1], id, pageStateId: page, itemCode: item, ruleId: rule, result, selector, humanResult: null, createdAt: T } as Finding;
}

describe("P-008/P-009 기준 매핑: KWCAG 6.1.3 과 WCAG 2.5.8 분리", () => {
  it("axe target-size 는 WCAG 전용 규칙", () => {
    expect(isWcagOnlyTargetRule("target-size")).toBe(true);
    expect(isWcagOnlyTargetRule("kr-small-target")).toBe(false);
  });

  it("이전에 저장된 target-size fail 은 KWCAG 보고서에서 사람 확인 필요, kr-small-target(대각선 6mm)은 자동 신호 유지", () => {
    const fs = [...findings(), extra("t1", "pg1", "6.1.3", "target-size", "fail", "#a"), extra("t2", "pg1", "6.1.3", "kr-small-target", "fail", "#b")];
    const v = buildScanView(scanRow(), project(), PAGES, fs, [], []);
    const recs = issueRecords(v);
    expect(recs.find((r) => r.ruleId === "target-size")?.state).toBe("review");
    expect(recs.find((r) => r.ruleId === "kr-small-target")?.state).toBe("auto_fail");
  });
});

describe("우선순위: 위치 수가 아니라 사용자 영향", () => {
  it("언어·키보드는 1순위, 대비는 2순위, 의미 판단(대체 텍스트 내용)은 2순위, 사람 확인 필요는 확인 후 결정", () => {
    expect(priorityOf("kwcag22", "auto_fail", "7.1.1", "html-has-lang").priority).toBe("1순위 (기능 차단)");
    expect(priorityOf("kwcag22", "auto_fail", "6.1.1", "kr-click-only").priority).toBe("1순위 (기능 차단)");
    expect(priorityOf("kwcag22", "auto_fail", "5.4.3", "color-contrast").priority).toBe("2순위 (이용 불편)");
    expect(priorityOf("kwcag22", "auto_fail", "5.1.1", "ai-image").priority).toBe("2순위 (이용 불편)");
    expect(priorityOf("kwcag22", "review", "7.1.1", "html-has-lang").priority).toBe("판정 반영");
  });

  it("위치가 많은 2순위 문제보다 위치가 적은 1순위 문제가 먼저", () => {
    const many = Array.from({ length: 6 }, (_, i) => extra(`c${i}`, i % 2 ? "pg1" : "pg2", "5.4.3", "color-contrast", "fail", `#c${i}`));
    const v = buildScanView(scanRow(), project(), PAGES, [...findings(), ...many], [], []);
    const ranked = byPriority(issueRecords(v).filter((r) => r.state === "auto_fail"));
    expect(ranked[0].itemCode).toBe("7.1.1");
    expect(ranked.findIndex((r) => r.itemCode === "5.4.3")).toBeGreaterThan(0);
  });
});

describe("공통 원인 묶음", () => {
  it("두 화면에 반복되는 같은 선택자는 원인 1곳 / 영향 페이지 2개", () => {
    const rec = issueRecords(fixtureView()).find((r) => r.itemCode === "7.1.1")!;
    expect(causeGroups(rec)).toHaveLength(1);
    expect(causeGroups(rec)[0].shared).toBe(true);
    expect(causeText(rec)).toBe("원인 1곳 / 영향 페이지 2개 (여러 화면 공통 요소 1곳)");
  });
});

describe("사람 확인 필요 기준 수와 기준 상태 수의 관계 (각주)", () => {
  it("실제 데이터에서 계산되고 등식이 맞음", () => {
    const v = fixtureView();
    const m = reportMetrics(v);
    const r = m.reviewDetail;
    expect(r.withLocations).toBe(m.review.criteria);
    expect(r.both + r.itemOnly).toBe(r.itemsInReview);
    expect(r.both + r.elsewhere).toBe(r.withLocations);
    const text = reviewFootnote(r);
    expect(text).toContain(`기준 ${r.withLocations}개`);
    expect(text).toContain(`기준 ${r.itemOnly}개는 항목별 판정 표에`);
    expect(text).not.toMatch(/\d+\+\d+=\d+/); // 덧셈식 각주는 읽기 어려워 뺐다
  });
});

describe("제출 정보: 모르는 값은 초안 입력 필요", () => {
  it("로컬·예시 주소는 시연용으로 표시", () => {
    expect(isDemoTarget("http://localhost:4400/")).toBe(true);
    expect(isDemoTarget("http://127.0.0.1:3000/")).toBe(true);
    expect(isDemoTarget("https://www.example.com/")).toBe(true);
    expect(isDemoTarget("https://example.go.kr/")).toBe(true);
  });
  it("기관명·점검자가 없으면 초안 표시, 시연용 주소는 실제 대상 입력을 요구", () => {
    const sub = submissionInfo(fixtureView(), false);
    expect(sub.org).toBe("초안: 대상 기관명 입력 필요");
    expect(sub.auditor).toBe("초안: 점검자 입력 필요");
    expect(sub.target).toContain("시연용 테스트 사이트 — 초안: 실제 대상 URL 입력 필요");
    const demo = submissionInfo(buildScanView(scanRow(), { ...project(), baseUrl: "http://localhost:4400/" }, PAGES, findings(), [], []), false);
    expect(demo.target).toContain("시연용 테스트 사이트 — 초안: 실제 대상 URL 입력 필요");
  });
});
