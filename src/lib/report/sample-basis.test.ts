import { describe, expect, it } from "vitest";
import { plainReason, selectMethod } from "./sample-basis";
import { RANDOM_REASON } from "../sampling";

describe("표본 선정 근거", () => {
  it("선정 이유를 선정 방식으로 나눈다", () => {
    expect(selectMethod("홈", false)).toBe("메인");
    expect(selectMethod("필수: 로그인", false)).toBe("필수 페이지");
    expect(selectMethod("같은 틀 페이지 12개 중 대표", false)).toBe("유형별 대표");
    expect(selectMethod(RANDOM_REASON, false)).toBe("무작위");
    expect(selectMethod("홈", true)).toBe("업무 흐름");
  });
  it("내부 표기를 쉬운 말로 바꾼다", () => {
    expect(plainReason("같은 틀 페이지 12개 중 대표")).toBe("같은 모양의 페이지 12개 중 대표로 골랐어요");
    expect(plainReason("필수: 검색")).toContain("검색");
  });
});
