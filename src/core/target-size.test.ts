import { describe, expect, it } from "vitest";
import { belowKwcagTarget, isSkipLinkText, KWCAG_TARGET_DIAGONAL_PX } from "./page/checks";

describe("KWCAG 6.1.3 조작 가능 — 대각선 6mm (Codex 리뷰 8)", () => {
  it("기준값은 약 22.7px", () => {
    expect(KWCAG_TARGET_DIAGONAL_PX).toBeCloseTo(22.68, 1);
  });
  it("작은 대상은 걸림", () => {
    expect(belowKwcagTarget(15, 15)).toBe(true); // 대각선 21.2
    expect(belowKwcagTarget(10, 20)).toBe(true); // 22.4
  });
  it("KWCAG 기준을 넘는 대상은 통과 (WCAG 2.5.8 24×24 는 axe target-size 가 따로 판정)", () => {
    expect(belowKwcagTarget(20, 20)).toBe(false); // 28.3
    expect(belowKwcagTarget(10, 25)).toBe(false); // 26.9
    expect(belowKwcagTarget(24, 24)).toBe(false);
  });
  it("크기를 잴 수 없는(0) 요소는 판단하지 않음", () => {
    expect(belowKwcagTarget(0, 0)).toBe(false);
  });
});

describe("건너뛰기 링크 이름 (공공기관 실사용 시험 2026-10-26)", () => {
  it("본문·주메뉴·전체메뉴·메인메뉴 바로가기는 건너뛰기 링크", () => {
    for (const t of ["본문 바로가기", "주메뉴 바로가기", "전체메뉴 바로가기", "메인메뉴 바로가기", "메뉴 바로 가기", "Skip to content"]) expect(isSkipLinkText(t), t).toBe(true);
  });
  it("일반 링크는 아님", () => {
    for (const t of ["공지사항", "로그인", "다음 슬라이드"]) expect(isSkipLinkText(t), t).toBe(false);
  });
});
