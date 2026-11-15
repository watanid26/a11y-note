import { describe, expect, it } from "vitest";
import { aiCandidateKey, noAutoPass, toResult, verdictsFromAiText } from "./judge";
import { fallbackVerdict } from "./fallback";
import type { Candidate } from "../../core/types";

describe("AI·규칙 의미 판단은 적합 근거가 되지 않음 (P0-7)", () => {
  it("AI 가 확신도 0.99 로 pass 를 내도 검토 필요", () => {
    expect(toResult({ verdict: "pass", confidence: 0.99 })).toBe("review");
  });
  it("AI fail 은 확신도가 기준 이상일 때만 문제 후보, 낮으면 검토 필요", () => {
    expect(toResult({ verdict: "fail", confidence: 0.9, reason: "대체 텍스트가 파일명입니다." })).toBe("fail");
    expect(toResult({ verdict: "fail", confidence: 0.5 })).toBe("review");
    expect(toResult({ verdict: "unsure", confidence: 0.9 })).toBe("review");
  });

  const passCases: [string, Candidate, object][] = [
    ["제목에 h1 포함", { kind: "title", selector: "title", box: null, text: { title: "공지사항 | OO시청", h1: "공지사항" } }, { siblingTitles: ["공지사항 | OO시청", "민원 | OO시청"] }],
    ["표 캡션 있음", { kind: "table", selector: "table", box: null, text: { caption: "2026년 예산 현황" } }, {}],
    ["슬라이드 정지 버튼 있음", { kind: "carousel", selector: ".slide", box: null, text: { controls: "정지 이전 다음" } }, {}],
    ["자막 트랙 있음", { kind: "media", selector: "video", box: null, text: { tracks: "captions" } }, {}],
  ];
  for (const [name, c, extra] of passCases) {
    it(`규칙 판정 "${name}" 은 참고 의견만 남기고 검토 필요`, () => {
      const raw = fallbackVerdict(c, { locale: "ko", ...extra });
      const v = noAutoPass(raw, "rule");
      expect(v.result).not.toBe("pass");
      if (raw.result === "pass") {
        expect(v.result).toBe("review");
        expect(v.reason.startsWith("참고")).toBe(true);
      }
    });
  }

  it("규칙 판정의 fail 은 그대로 문제 후보", () => {
    const raw = fallbackVerdict({ kind: "image", selector: "img", box: null, text: { alt: "banner01.png" } }, { locale: "ko" });
    expect(noAutoPass(raw, "rule").result).toBe("fail");
  });
});

describe("테스트 전제 확인", () => {
  it("위 4가지 입력은 원래 규칙 판정이 pass 를 내는 경우 (pass 차단이 실제로 작동하는지 보장)", () => {
    expect(fallbackVerdict({ kind: "title", selector: "title", box: null, text: { title: "공지사항 | OO시청", h1: "공지사항" } }, { locale: "ko", siblingTitles: ["공지사항 | OO시청", "민원 | OO시청"] }).result).toBe("pass");
    expect(fallbackVerdict({ kind: "table", selector: "table", box: null, text: { caption: "2026년 예산 현황" } }, { locale: "ko" }).result).toBe("pass");
    expect(fallbackVerdict({ kind: "carousel", selector: ".slide", box: null, text: { controls: "정지 이전 다음" } }, { locale: "ko" }).result).toBe("pass");
    expect(fallbackVerdict({ kind: "media", selector: "video", box: null, text: { tracks: "captions" } }, { locale: "ko" }).result).toBe("pass");
  });
});

describe("AI 응답이 이상할 때 (GPT 리뷰 반영)", () => {
  const ids = new Set(["a", "b"]);
  it("근거 없는 부적합 의견은 검토 필요", () => {
    expect(toResult({ verdict: "fail", confidence: 0.95, reason: "" })).toBe("review");
    const m = verdictsFromAiText('[{"id":"a","verdict":"fail","confidence":0.95,"reasonCode":"alt_generic","evidence":""}]', ids);
    expect(m.get("a")?.result).toBe("review");
    expect(m.get("a")?.reason).toBe("[AI:alt_generic]");
  });
  it("근거 있는 부적합 의견만 문제 후보", () => {
    const m = verdictsFromAiText('```json\n[{"id":"a","verdict":"fail","confidence":0.9,"reasonCode":"alt_generic","suggestionCode":"rewrite_alt","evidence":"alt=\\"banner01.png\\""}]\n```', ids);
    expect(m.get("a")?.result).toBe("fail");
    expect(m.get("a")?.reason).toBe('[AI:alt_generic] alt="banner01.png"');
    expect(m.get("a")?.suggestion).toContain("대체 텍스트를 고쳐요");
  });
  it("AI 가 pass 를 내도 검토 필요", () => {
    const m = verdictsFromAiText('[{"id":"a","verdict":"pass","confidence":1,"reasonCode":"title_ok","evidence":"제목 \\"공지사항 | OO시\\""}]', ids);
    expect(m.get("a")?.result).toBe("review");
    expect(m.get("a")?.reason).toBe('[AI:title_ok] 제목 "공지사항 | OO시"');
  });
  it("모르는 id·빠진 id 는 판정에 넣지 않음 (빠진 것은 호출 쪽에서 규칙 판정)", () => {
    const m = verdictsFromAiText('[{"id":"zzz","verdict":"fail","confidence":1,"reason":"x"}]', ids);
    expect(m.size).toBe(0);
  });
  it("JSON 이 아니거나 배열이 아니면 예외 → 규칙 판정으로 대체", () => {
    expect(() => verdictsFromAiText("죄송합니다, 판단할 수 없습니다.", ids)).toThrow();
    expect(() => verdictsFromAiText('{"id":"a","verdict":"fail"}', ids)).toThrow();
  });
  it("확신도가 숫자가 아니면 0 으로 보고 검토 필요", () => {
    const m = verdictsFromAiText('[{"id":"a","verdict":"fail","confidence":"high","reason":"이유가 충분히 있습니다"}]', ids);
    expect(m.get("a")?.result).toBe("review");
  });
});

import { aiSafeText } from "./judge";
describe("외부 AI 전송 최소화 (P0-9)", () => {
  it("같은 후보·캡처는 같은 키를 만들어 중복 AI 호출을 줄임", () => {
    const candidate: Candidate = { kind: "image", selector: ".one", box: null, text: { alt: "배너", src: "/banner.png" } };
    const same: Candidate = { ...candidate, selector: ".two" };
    const different: Candidate = { ...candidate, text: { ...candidate.text, alt: "다른 배너" } };
    const crop = Buffer.from("same-crop");
    expect(aiCandidateKey("ko", candidate, crop)).toBe(aiCandidateKey("ko", same, crop));
    expect(aiCandidateKey("ko", candidate, crop)).not.toBe(aiCandidateKey("ko", different, crop));
    expect(aiCandidateKey("ko", candidate, crop)).not.toBe(aiCandidateKey("ja", candidate, crop));
  });

  it("주소의 쿼리·세션 ID·data URL 제거, 긴 문맥 자름", () => {
    const t = aiSafeText({ src: "https://a.kr/img/banner.png?user=hong&token=abc", href: "/board/view.do;jsessionid=XYZ?id=3#c", alt: "배너", context: "가".repeat(500), data: undefined, icon: "data:image/png;base64,AAAA" });
    expect(t.src).toBe("https://a.kr/img/banner.png");
    expect(t.href).toBe("/board/view.do");
    expect(t.context.length).toBe(200);
    expect(t.icon).toBe("data:(생략)");
    expect("data" in t).toBe(false);
  });

  it("제목 후보의 페이지 주소(url)도 쿼리·조각을 빼고 보냄 (Codex 리뷰 1)", () => {
    const t = aiSafeText({ title: "내 정보", url: "https://a.kr/my.do?name=홍길동&token=secret#x", note: "https://a.kr/x?session=1" });
    expect(t.url).toBe("https://a.kr/my.do");
    expect(t.note).toBe("https://a.kr/x");
    expect(JSON.stringify(t)).not.toMatch(/홍길동|secret|session/);
  });
});
