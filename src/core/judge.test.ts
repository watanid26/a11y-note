import { describe, expect, it } from "vitest";
import { displayStatus, findingsFromState, summarizeItems } from "./judge";
import { getPack, itemForResult } from "./packs";
import type { Applicability, CapturedState } from "./types";

const applicable: Applicability = {
  images: 2, media: 0, tables: 0, forms: 1, inputs: 2, links: 5, newWindowLinks: 0, carousels: 0, captchas: 0, iframes: 0, timeLimitHint: false, accessKeys: 0,
};

function state(partial: Partial<CapturedState["snapshot"]> = {}, keyboard: CapturedState["keyboard"] = null): CapturedState {
  return {
    url: "https://example.go.kr/",
    title: "홈",
    label: "홈",
    snapshot: {
      coreVersion: "t",
      url: "https://example.go.kr/",
      title: "홈",
      lang: "ko",
      viewport: { w: 1280, h: 900, scrollH: 2000 },
      results: [],
      candidates: [],
      applicable,
      outline: { navLinks: [], forms: [], searchInput: null },
      templateSignature: "x",
      ...partial,
    },
    keyboard,
  };
}

describe("국가 팩 연결", () => {
  it("axe 규칙은 KWCAG 항목으로 직접 연결된다 (label → 7.3.2)", () => {
    expect(itemForResult(getPack("kwcag22"), { ruleId: "label", wcag: ["4.1.2", "1.3.1"] })).toBe("7.3.2");
  });
  it("모르는 규칙은 WCAG 번호로 연결된다", () => {
    expect(itemForResult(getPack("kwcag22"), { ruleId: "new-rule", wcag: ["1.4.3"] })).toBe("5.4.3");
    expect(itemForResult(getPack("jis2016"), { ruleId: "new-rule", wcag: ["1.4.3"] })).toBe("1.4.3");
  });
  it("한국 고유 규칙(새 창 안내)은 JIS 에 연결되지 않는다", () => {
    expect(itemForResult(getPack("jis2016"), { ruleId: "kr-new-window", wcag: ["3.2.5"] })).toBeNull();
  });
  it("KWCAG 33개, JIS 38개 항목", () => {
    expect(getPack("kwcag22").items).toHaveLength(33);
    expect(getPack("jis2016").items).toHaveLength(38);
  });
});

describe("판정", () => {
  const pack = getPack("kwcag22");

  it("위반은 부적합, 확인 필요는 검토 필요", () => {
    const f = findingsFromState(pack, state({
      results: [
        { engine: "axe", ruleId: "image-alt", outcome: "violation", impact: "critical", wcag: ["1.1.1"], help: "alt", nodes: [{ selector: "img", html: "<img>", box: null, message: "" }] },
        { engine: "axe", ruleId: "color-contrast", outcome: "incomplete", impact: "serious", wcag: ["1.4.3"], help: "c", nodes: [{ selector: "p", html: "<p>", box: null, message: "" }] },
      ],
    }));
    expect(f.find((x) => x.itemCode === "5.1.1")?.result).toBe("fail");
    expect(f.find((x) => x.itemCode === "5.4.3")?.result).toBe("review");
  });

  it("키보드 함정과 초점 표시 없음을 잡는다", () => {
    const f = findingsFromState(pack, state({}, {
      focusableCount: 3,
      trappedAt: "#widget",
      firstStopIsSkipLink: true,
      stops: [
        { index: 0, selector: "#skip", tag: "a", text: "본문 바로가기", box: null, indicator: true },
        { index: 1, selector: "#widget", tag: "div", text: "날짜", box: null, indicator: false },
      ],
    }));
    expect(f.some((x) => x.ruleId === "kr-keyboard-trap" && x.itemCode === "6.1.1")).toBe(true);
    expect(f.some((x) => x.ruleId === "kr-focus-indicator" && x.itemCode === "6.1.2")).toBe(true);
  });

  it("Shift+Tab(역방향) 함정도 잡는다 (Codex 리뷰 7)", () => {
    const f = findingsFromState(pack, state({}, {
      focusableCount: 3,
      trappedAt: null,
      reverseTrappedAt: "#q",
      firstStopIsSkipLink: false,
      stops: [
        { index: 0, selector: "#home", tag: "a", text: "처음", box: null, indicator: true },
        { index: 1, selector: "#q", tag: "input", text: "", box: null, indicator: true },
      ],
    }));
    const trap = f.find((x) => x.ruleId === "kr-keyboard-trap");
    expect(trap?.selector).toBe("#q");
    expect(trap?.message).toContain("Shift+Tab");
  });

  it("같은 요소를 두 규칙이 잡으면 하나만 남긴다", () => {
    const f = findingsFromState(pack, state({
      results: [
        { engine: "axe", ruleId: "target-size", outcome: "violation", impact: "serious", wcag: ["2.5.8"], help: "a", nodes: [{ selector: "#x", html: "", box: null, message: "" }] },
        { engine: "custom", ruleId: "kr-small-target", outcome: "violation", impact: "moderate", wcag: ["2.5.8"], help: "b", nodes: [{ selector: "#x", html: "", box: null, message: "" }] },
      ],
    }));
    expect(f.filter((x) => x.itemCode === "6.1.3")).toHaveLength(1);
  });

  it("숨겨진 스킵 링크는 axe target-size 오탐으로 보고하지 않는다", () => {
    const f = findingsFromState(pack, state({
      results: [
        {
          engine: "axe",
          ruleId: "target-size",
          outcome: "violation",
          impact: "serious",
          wcag: ["2.5.8"],
          help: "target",
          nodes: [{ selector: "#accessibility", html: '<a class="skip-link" href="#container">본문 바로가기</a>', box: { x: 0, y: 0, w: 1, h: 1 }, message: "" }],
        },
      ],
    }));
    expect(f.some((x) => x.ruleId === "target-size")).toBe(false);
  });

  it("axe가 href/html을 생략해도 스킵 링크 컨테이너는 제외한다", () => {
    const f = findingsFromState(pack, state({
      results: [
        {
          engine: "axe",
          ruleId: "target-size",
          outcome: "violation",
          impact: "serious",
          wcag: ["2.5.8"],
          help: "target",
          nodes: [{ selector: "#accessibility > a:nth-of-type(1)", html: "", box: { x: 0, y: 0, w: 1, h: 1 }, message: "" }],
        },
      ],
    }));
    expect(f.some((x) => x.ruleId === "target-size")).toBe(false);
  });

  it("주메뉴 바로가기 링크도 작은 영역 오탐에서 제외한다", () => {
    const f = findingsFromState(pack, state({
      results: [
        {
          engine: "axe",
          ruleId: "target-size",
          outcome: "violation",
          impact: "serious",
          wcag: ["2.5.8"],
          help: "target",
          nodes: [{ selector: "#accessibility > a:nth-of-type(2)", html: '<a href="#header">주메뉴 바로가기</a>', box: { x: 0, y: 0, w: 1, h: 1 }, message: "" }],
        },
      ],
    }));
    expect(f.some((x) => x.ruleId === "target-size")).toBe(false);
  });

  it("일반 fragment 링크의 target-size 검토는 유지한다", () => {
    const f = findingsFromState(pack, state({
      results: [
        {
          engine: "axe",
          ruleId: "target-size",
          outcome: "violation",
          impact: "serious",
          wcag: ["2.5.8"],
          help: "target",
          nodes: [{ selector: "#section-link", html: '<a href="#section-2">2장</a>', box: { x: 0, y: 0, w: 10, h: 10 }, message: "" }],
        },
      ],
    }));
    expect(f.some((x) => x.ruleId === "target-size" && x.result === "review")).toBe(true);
  });

  it("요소가 없으면 해당 없음, 사람 확인 항목은 검토 필요, 사람 결정이 우선", () => {
    const items = summarizeItems(pack, [{ itemCode: "5.4.3", method: "auto", result: "fail", humanResult: "pass" }], [applicable]);
    expect(items.find((i) => i.code === "5.2.1")?.status).toBe("na"); // 미디어 없음
    expect(items.find((i) => i.code === "5.3.3")?.status).toBe("review"); // 사람 확인
    expect(items.find((i) => i.code === "7.3.1")?.status).toBe("review"); // 근거가 없으면 적합으로 보지 않음
    expect(items.find((i) => i.code === "5.4.3")?.status).toBe("pass"); // 사람이 문제 없음으로 정함
    expect(items.find((i) => i.code === "7.1.1")?.status).toBe("pass"); // 자동 항목, 문제 없음
  });

  it("항목 단위 결정이 가장 우선", () => {
    const items = summarizeItems(pack, [], [applicable], [{ itemCode: "6.4.4", status: "na", note: "전자출판 아님" }]);
    expect(items.find((i) => i.code === "6.4.4")).toMatchObject({ status: "na", decidedBy: "human" });
  });

  it("화면이 하나도 없으면 미점검 (적합·검토 필요 아님)", () => {
    const items = summarizeItems(pack, [], []);
    expect(items.every((i) => i.status === "untested" && displayStatus(i) === "untested")).toBe(true);
  });

  it("자동 항목에서 문제가 없으면 '문제 미발견(자동)' — 적합 확정 아님", () => {
    const items = summarizeItems(pack, [], [applicable]);
    const it711 = items.find((i) => i.code === "7.1.1")!;
    expect(it711.status).toBe("pass");
    expect(it711.decidedBy).toBe("auto");
    expect(displayStatus(it711)).toBe("clear_auto");
  });

  it("발견 사항을 사람이 '문제 없음'으로 봐도 항목은 적합 확정이 아님 (항목 단위 결정만 확정)", () => {
    const items = summarizeItems(pack, [{ itemCode: "5.4.3", method: "auto", result: "fail", humanResult: "pass" }], [applicable]);
    expect(displayStatus(items.find((i) => i.code === "5.4.3")!)).toBe("clear_auto");
    const decided = summarizeItems(pack, [{ itemCode: "5.4.3", method: "auto", result: "fail", humanResult: "pass" }], [applicable], [{ itemCode: "5.4.3", status: "pass" }]);
    expect(displayStatus(decided.find((i) => i.code === "5.4.3")!)).toBe("pass");
  });

  it("자동 부적합은 '부적합(자동)', 사람이 문제로 확인하면 '부적합'", () => {
    const auto = summarizeItems(pack, [{ itemCode: "5.1.1", method: "auto", result: "fail" }], [applicable]);
    expect(displayStatus(auto.find((i) => i.code === "5.1.1")!)).toBe("fail_auto");
    const human = summarizeItems(pack, [{ itemCode: "5.1.1", method: "ai", result: "review", humanResult: "fail" }], [applicable]);
    expect(displayStatus(human.find((i) => i.code === "5.1.1")!)).toBe("fail");
  });

  it("요소가 없으면 '해당 없음(자동)', 사람이 정하면 '해당 없음'", () => {
    const auto = summarizeItems(pack, [], [applicable]);
    expect(displayStatus(auto.find((i) => i.code === "5.2.1")!)).toBe("na_auto");
    const human = summarizeItems(pack, [], [applicable], [{ itemCode: "5.2.1", status: "na" }]);
    expect(displayStatus(human.find((i) => i.code === "5.2.1")!)).toBe("na");
  });

  it("AI 결과만 있는 항목은 어떤 경우에도 적합이 되지 않음", () => {
    // AI 판정은 이제 fail 또는 review 만 낸다. review 가 남아 있으면 항목은 검토 필요.
    const items = summarizeItems(pack, [{ itemCode: "5.1.1", method: "ai", result: "review" }], [applicable]);
    expect(items.find((i) => i.code === "5.1.1")!.status).toBe("review");
  });

  it("이전 버전에 저장된 AI pass 는 검토 필요로 표시 (기존 데이터)", () => {
    const items = summarizeItems(pack, [{ itemCode: "5.1.1", method: "ai", result: "pass" }], [applicable]);
    expect(items.find((i) => i.code === "5.1.1")!.status).toBe("review");
    // 사람이 그 발견 사항을 문제로 확인하면 부적합 확정
    const human = summarizeItems(pack, [{ itemCode: "5.1.1", method: "ai", result: "pass", humanResult: "fail" }], [applicable]);
    expect(displayStatus(human.find((i) => i.code === "5.1.1")!)).toBe("fail");
  });

  it("상태 전이: 사람 결정이 항상 마지막에 이김 (자동 부적합 → 사람 적합, 자동 미발견 → 사람 부적합)", () => {
    const a = summarizeItems(pack, [{ itemCode: "5.1.1", method: "auto", result: "fail" }], [applicable], [{ itemCode: "5.1.1", status: "pass" }]);
    expect(displayStatus(a.find((i) => i.code === "5.1.1")!)).toBe("pass");
    const b = summarizeItems(pack, [], [applicable], [{ itemCode: "7.1.1", status: "fail" }]);
    expect(displayStatus(b.find((i) => i.code === "7.1.1")!)).toBe("fail");
  });
});
