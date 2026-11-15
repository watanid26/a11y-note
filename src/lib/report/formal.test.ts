import { describe, expect, it } from "vitest";
import { formal } from "./formal";
import { ruleHelp } from "../rule-help";

describe("공문체 변환", () => {
  it("대표 문장", () => {
    expect(formal("이미지에 대체 텍스트(alt)가 없어요")).toBe("이미지에 대체 텍스트(alt)가 없습니다");
    expect(formal("꾸밈용이면 alt=\"\" 로 비워 둬요.")).toBe("꾸밈용이면 alt=\"\" 로 비워 둡니다.");
    expect(formal("새 창이 열린다는 안내가 없어요")).toBe("새 창이 열린다는 안내가 없습니다");
    expect(formal("확인이 필요해요")).toBe("확인이 필요합니다");
    expect(formal("페이지 언어가 지정돼 있지 않아요")).toBe("페이지 언어가 지정되어 있지 않습니다");
    expect(formal("button 이나 a 로 바꾸세요.")).toBe("button 이나 a 로 바꾸십시오.");
  });
  it("규칙 설명 전체에 '요'로 끝나는 문장이 남지 않음", () => {
    const ids = ["image-alt", "color-contrast", "link-name", "button-name", "label", "kr-focus-indicator", "kr-click-only", "kr-skip-link", "html-has-lang", "kr-new-window", "target-size", "kr-small-target", "kr-table-caption", "kr-autoplay", "ai-image", "kr-captcha"];
    for (const id of ids) {
      const h = ruleHelp(id, "ko");
      if (!h) continue;
      for (const t of [h.title, h.why, h.fix]) expect(formal(t), `${id}: ${t}`).not.toMatch(/[가-힣]요[.)"]?\s*$|[가-힣]요\.\s/);
    }
  });
});
