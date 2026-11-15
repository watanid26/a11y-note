// Phase 2: 자동 점검 "문제 미발견" 표본 검수 — 표본 비율·상한·중복 방지·입력 최소화·기본 꺼짐
import { describe, expect, it } from "vitest";
import { getPack } from "../../core/packs";
import { PAGES } from "../report/test-fixture";
import { inPassSample, passInputHash, passSampleCandidates, passSampleEnabled, passSampleInput, passSampleMaxPerScan, passSampleRate, pickPassSamples, processPassSamples, type PassCandidate } from "./verify-pass";

const pack = getPack("kwcag22");
const KB = {
  stops: [
    { index: 1, selector: "#skip", tag: "a", text: "본문 바로가기", box: { x: 0, y: 0, w: 10, h: 10 }, indicator: true },
    { index: 2, selector: "#login input[name=id]", tag: "input", text: "hong@example.com", box: { x: 400, y: 20, w: 10, h: 10 }, indicator: true },
  ],
  focusableCount: 2,
  trappedAt: null,
  firstStopIsSkipLink: true,
};
const OUTLINE = { navLinks: [{ text: "공지사항", href: "https://example.go.kr/board/list.do?menuId=1&token=secret" }] };
const pages = PAGES.map((p) => ({ ...p, outline: OUTLINE, keyboard: KB })) as never as Parameters<typeof passSampleCandidates>[1];

describe("기본 꺼짐·설정값", () => {
  it("AI_VERIFY_ENABLED 와 AI_VERIFY_PASS_ENABLED 둘 다 켜야 동작", () => {
    expect(passSampleEnabled({})).toBe(false);
    expect(passSampleEnabled({ AI_VERIFY_ENABLED: "1" })).toBe(false);
    expect(passSampleEnabled({ AI_VERIFY_PASS_ENABLED: "1" })).toBe(false);
    expect(passSampleEnabled({ AI_VERIFY_ENABLED: "1", AI_VERIFY_PASS_ENABLED: "1" })).toBe(true);
  });
  it("표본 비율은 0~1 로 자르고, 상한은 0 이상 정수", () => {
    expect(passSampleRate({})).toBe(0.1);
    expect(passSampleRate({ AI_VERIFY_PASS_RATE: "5" })).toBe(1);
    expect(passSampleRate({ AI_VERIFY_PASS_RATE: "-1" })).toBe(0);
    expect(passSampleRate({ AI_VERIFY_PASS_RATE: "abc" })).toBe(0.1);
    expect(passSampleMaxPerScan({})).toBe(10);
    expect(passSampleMaxPerScan({ AI_VERIFY_PASS_MAX_PER_SCAN: "3.7" })).toBe(3);
    expect(passSampleMaxPerScan({ AI_VERIFY_PASS_MAX_PER_SCAN: "-2" })).toBe(10);
  });
  it("플래그가 꺼져 있으면 DB·AI 를 건드리지 않고 0", async () => {
    const before = { a: process.env.AI_VERIFY_ENABLED, b: process.env.AI_VERIFY_PASS_ENABLED };
    delete process.env.AI_VERIFY_ENABLED;
    delete process.env.AI_VERIFY_PASS_ENABLED;
    try {
      expect(await processPassSamples(10)).toBe(0);
    } finally {
      if (before.a !== undefined) process.env.AI_VERIFY_ENABLED = before.a;
      if (before.b !== undefined) process.env.AI_VERIFY_PASS_ENABLED = before.b;
    }
  });
});

describe("결정적 표본", () => {
  it("같은 입력이면 언제나 같은 결과, 비율 0/1 경계", () => {
    for (let i = 0; i < 50; i++) expect(inPassSample("s1", `pg${i}`, "6.4.2", 0.3)).toBe(inPassSample("s1", `pg${i}`, "6.4.2", 0.3));
    expect(inPassSample("s1", "pg1", "6.4.2", 0)).toBe(false);
    expect(inPassSample("s1", "pg1", "6.4.2", 1)).toBe(true);
  });
  it("비율이 대략 맞음 (2000개 중 10% ± 3%p)", () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (inPassSample("s1", `pg${i}`, "6.4.3", 0.1)) n++;
    expect(n / 2000).toBeGreaterThan(0.07);
    expect(n / 2000).toBeLessThan(0.13);
  });
  it("프롬프트 버전이 바뀌면 표본도 새로 뽑힘 (같은 버전 안에서는 고정)", () => {
    const a = Array.from({ length: 200 }, (_, i) => inPassSample("s1", `pg${i}`, "6.4.2", 0.5, "v1"));
    const b = Array.from({ length: 200 }, (_, i) => inPassSample("s1", `pg${i}`, "6.4.2", 0.5, "v2"));
    expect(a).not.toEqual(b);
  });
});

describe("표본 후보", () => {
  const keys = (c: PassCandidate[]) => c.map((x) => `${x.pageStateId}|${x.itemCode}|${x.kind}`).sort();

  it("대상 4종 (제목·링크·건너뛰기·초점 순서) × 화면", () => {
    const c = passSampleCandidates(pack, pages, [], new Set(), new Set());
    expect(new Set(c.map((x) => x.itemCode))).toEqual(new Set(["6.4.2", "6.4.3", "6.4.1", "6.1.2"]));
    expect(c.length).toBe(8);
  });
  it("자동 점검이 문제를 낸 화면·항목, 점검자가 결정한 항목, 이미 검수한 대상은 뺌", () => {
    const c = passSampleCandidates(pack, pages, [{ pageStateId: "pg1", itemCode: "6.4.2" }], new Set(["6.4.3"]), new Set(["pg2|6.4.1"]));
    const k = keys(c);
    expect(k).not.toContain("pg1|6.4.2|title");
    expect(k).toContain("pg2|6.4.2|title");
    expect(k.some((x) => x.includes("|6.4.3|"))).toBe(false);
    expect(k).not.toContain("pg2|6.4.1|bypass");
    expect(k).toContain("pg1|6.4.1|bypass");
  });
  it("저장된 근거가 없으면 후보가 아님 (캡처로 보충하지 않음)", () => {
    const bare = PAGES.map((p) => ({ ...p, title: "", outline: null, keyboard: null })) as never as Parameters<typeof passSampleCandidates>[1];
    expect(passSampleCandidates(pack, bare, [], new Set(), new Set())).toEqual([]);
  });
});

describe("회차 상한", () => {
  const cands: PassCandidate[] = Array.from({ length: 30 }, (_, i) => ({ scanId: "s1", pageStateId: `pg${i}`, itemCode: "6.4.2", kind: "title" }));
  it("이미 검수한 수를 포함해 상한을 넘지 않음", () => {
    expect(pickPassSamples(cands, 1, 10, new Map()).length).toBe(10);
    expect(pickPassSamples(cands, 1, 10, new Map([["s1", 7]])).length).toBe(3);
    expect(pickPassSamples(cands, 1, 10, new Map([["s1", 10]]))).toEqual([]);
    expect(pickPassSamples(cands, 1, 0, new Map())).toEqual([]);
  });
  it("넘겨준 사용량 표를 바꾸지 않음", () => {
    const used = new Map([["s1", 2]]);
    pickPassSamples(cands, 1, 10, used);
    expect(used.get("s1")).toBe(2);
  });
});

describe("외부로 보내는 입력 최소화", () => {
  const p = { ...PAGES[1], outline: OUTLINE, keyboard: KB } as never as Parameters<typeof passSampleInput>[1];
  const all = (c: PassCandidate["kind"]) => JSON.stringify(passSampleInput({ scanId: "s1", pageStateId: "pg2", itemCode: "6.4.2", kind: c }, p, "제목 제공"));

  it("쿼리·이메일·선택자를 보내지 않음", () => {
    for (const k of ["title", "links", "bypass", "focus_order"] as const) {
      const s = all(k);
      expect(s).not.toContain("token=secret");
      expect(s).not.toContain("menuId");
      expect(s).not.toContain("hong@example.com");
      expect(s).not.toContain("#login");
      expect(s).toContain('"autoResult":"pass"');
    }
  });
  it("근거 종류별 내용", () => {
    expect(all("links")).toContain("공지사항");
    expect(all("bypass")).toContain("firstStopIsSkipLink: true");
    expect(all("focus_order")).toMatch(/y=20 x=400/);
  });
  it("같은 입력이면 같은 해시", () => {
    const c: PassCandidate = { scanId: "s1", pageStateId: "pg2", itemCode: "6.4.2", kind: "title" };
    expect(passInputHash(passSampleInput(c, p, "제목 제공"))).toBe(passInputHash(passSampleInput(c, p, "제목 제공")));
    expect(passInputHash(passSampleInput(c, p, "제목 제공"))).toMatch(/^[0-9a-f]{64}$/);
  });
});
