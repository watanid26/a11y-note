import { describe, expect, it } from "vitest";
import { fitToAllowance, periodOf, usageKey } from "./usage-limits";

const L = (...u: string[]) => u.map((url) => ({ url }));
describe("사용 한도 안에서 화면 고르기", () => {
  it("이미 센 페이지는 자유, 새 페이지는 예약 수까지, 전체는 회차 상한까지", () => {
    const counted = new Set([usageKey("https://ex.com/a"), usageKey("https://ex.com/b")]);
    const r = fitToAllowance(L("https://ex.com/a?x=1", "https://ex.com/n1", "https://ex.com/b", "https://ex.com/n2", "https://ex.com/n3"), { reserved: 1, pageCap: 10, counted });
    expect(r.keep.map((x) => x.url)).toEqual(["https://ex.com/a?x=1", "https://ex.com/n1", "https://ex.com/b"]);
    expect(r.dropped).toHaveLength(2);
  });
  it("예약 0(한도 도달)이면 이미 센 페이지만", () => {
    const r = fitToAllowance(L("https://ex.com/a", "https://ex.com/z"), { reserved: 0, pageCap: 10, counted: new Set([usageKey("https://ex.com/a")]) });
    expect(r.keep.map((x) => x.url)).toEqual(["https://ex.com/a"]);
  });
  it("회차 상한", () => {
    const r = fitToAllowance(L("https://ex.com/1", "https://ex.com/2", "https://ex.com/3"), { reserved: 10, pageCap: 2, counted: new Set() });
    expect(r.keep).toHaveLength(2);
  });
  it("같은 페이지(쿼리만 다름)은 새 페이지 1개로 셈", () => {
    const r = fitToAllowance(L("https://ex.com/p?a=1", "https://ex.com/p?a=2", "https://ex.com/q"), { reserved: 1, pageCap: 10, counted: new Set() });
    expect(r.keep.map((x) => x.url)).toEqual(["https://ex.com/p?a=1", "https://ex.com/p?a=2"]);
  });
  it("달 구분은 한국 시간 기준", () => {
    expect(periodOf(new Date("2026-10-31T15:30:00Z"))).toBe("2026-11");
    expect(periodOf(new Date("2026-10-31T14:30:00Z"))).toBe("2026-10");
  });
});
