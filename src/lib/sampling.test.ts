import { describe, expect, it } from "vitest";
import { pickRepresentatives, pickSample, pageType, RANDOM_REASON, urlPattern } from "./sampling";
import { fallbackVerdict } from "./ai/fallback";
import { suggestFlows } from "./flows";

describe("대표 페이지 선정", () => {
  it("숫자 id 가 다른 페이지는 같은 틀로 묶는다", () => {
    expect(urlPattern("https://a.kr/notice/12.html")).toBe(urlPattern("https://a.kr/notice/99.html"));
    expect(urlPattern("https://a.kr/board/view?id=3&page=1")).toBe(urlPattern("https://a.kr/board/view?page=9&id=7"));
  });

  it("홈과 필수 페이지를 먼저 넣고, 같은 틀은 하나만", () => {
    const base = "https://a.kr/";
    const entries = [
      { url: base, texts: ["홈"], depth: 0 },
      ...Array.from({ length: 30 }, (_, i) => ({ url: `https://a.kr/notice/${i + 1}.html`, texts: [`공지 ${i + 1}`], depth: 2 })),
      { url: "https://a.kr/member/login.do", texts: ["로그인"], depth: 1 },
      { url: "https://a.kr/search.do", texts: ["통합검색"], depth: 1 },
    ];
    const picked = pickRepresentatives(entries, base, 40);
    expect(picked[0].reason).toBe("홈");
    expect(picked.some((p) => p.reason === "필수: 로그인")).toBe(true);
    // 구조적 표본은 같은 틀에서 하나만 (무작위 표본은 같은 틀의 다른 페이지일 수 있다, 3단계)
    expect(picked.filter((p) => p.url.includes("/notice/") && p.reason !== RANDOM_REASON)).toHaveLength(1);
    expect(picked.find((p) => p.url.includes("/notice/"))?.groupSize).toBe(30);
  });

  it("무작위 표본: 구조적 표본의 10%(올림)를 아직 안 뽑힌 주소에서, 같은 입력이면 같은 결과", () => {
    const base = "https://a.kr/";
    const entries = [
      { url: base, texts: ["홈"], depth: 0 },
      ...Array.from({ length: 30 }, (_, i) => ({ url: `https://a.kr/notice/${i + 1}.html`, texts: [], depth: 2 })),
      ...Array.from({ length: 12 }, (_, i) => ({ url: `https://a.kr/sec${String.fromCharCode(97 + i)}/index.html`, texts: [], depth: 1 })),
    ];
    const a = pickRepresentatives(entries, base, 40);
    const structured = a.filter((p) => p.reason !== RANDOM_REASON);
    const random = a.filter((p) => p.reason === RANDOM_REASON);
    expect(random).toHaveLength(Math.ceil(structured.length * 0.1));
    expect(random.every((r) => !structured.some((s) => s.url === r.url))).toBe(true);
    expect(pickRepresentatives([...entries].reverse(), base, 40).filter((p) => p.reason === RANDOM_REASON).map((p) => p.url).sort()).toEqual(random.map((p) => p.url).sort());
    expect(pickRepresentatives(entries, base, 40, { randomShare: 0 }).some((p) => p.reason === RANDOM_REASON)).toBe(false);
  });

  it("무작위 표본 자리는 틀 대표를 빼서 만들고, 홈·필수 화면은 빼지 않는다", () => {
    const base = "https://a.kr/";
    const entries = [
      { url: base, texts: ["홈"], depth: 0 },
      { url: "https://a.kr/login.do", texts: ["로그인"], depth: 1 },
      ...Array.from({ length: 50 }, (_, i) => ({ url: `https://a.kr/p${i}/x`, texts: [], depth: 1 })),
    ];
    const picked = pickRepresentatives(entries, base, 10);
    expect(picked).toHaveLength(10);
    expect(picked[0].reason).toBe("홈");
    expect(picked.some((p) => p.reason === "필수: 로그인")).toBe(true);
    expect(picked.filter((p) => p.reason === RANDOM_REASON)).toHaveLength(1);
  });

  it("최대 수를 넘지 않는다", () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({ url: `https://a.kr/p${String.fromCharCode(97 + (i % 26))}${i}/x`, texts: [], depth: 1 }));
    expect(pickRepresentatives(entries, "https://a.kr/", 10)).toHaveLength(10);
  });
});

describe("규칙 기반 판정 (AI 없을 때)", () => {
  it("파일명·일반 단어 대체 텍스트는 부적합", () => {
    expect(fallbackVerdict({ kind: "image", selector: "img", box: null, text: { alt: "banner01.png" } }, { locale: "ko" }).result).toBe("fail");
    expect(fallbackVerdict({ kind: "image", selector: "img", box: null, text: { alt: "이미지" } }, { locale: "ko" }).result).toBe("fail");
  });
  it("의미 있어 보이는 대체 텍스트는 사람 확인", () => {
    expect(fallbackVerdict({ kind: "image", selector: "img", box: null, text: { alt: "2026 주민 설명회 일정 안내" } }, { locale: "ko" }).result).toBe("review");
  });
  it("여러 페이지가 같은 제목이면 부적합", () => {
    expect(fallbackVerdict({ kind: "title", selector: "title", box: null, text: { title: "OO시청", h1: "공지" } }, { locale: "ko", siblingTitles: ["OO시청", "OO시청"] }).result).toBe("fail");
  });
});

describe("흐름 찾기", () => {
  it("메뉴에서 로그인·신청·예약 흐름을 찾는다", () => {
    const flows = suggestFlows(
      [{ navLinks: [{ text: "로그인", href: "https://a.kr/login" }, { text: "민원신청", href: "https://a.kr/apply" }, { text: "시설예약", href: "https://a.kr/reserve" }], forms: [], searchInput: "#q" }],
      "https://a.kr/",
    );
    expect(flows.map((f) => f.kind).sort()).toEqual(["apply", "login", "reserve", "search"]);
    expect(flows.find((f) => f.kind === "reserve")?.stopBefore).toContain("예약 확정");
  });
});

describe("표본 커버리지 (pickSample)", () => {
  it("한도 때문에 넣지 못한 유형별 대표를 따로 돌려준다", () => {
    const base = "https://a.kr/";
    const entries = [{ url: base, texts: ["홈"], depth: 0 }, ...Array.from({ length: 30 }, (_, i) => ({ url: `https://a.kr/s${i}/list.do`, texts: [], depth: 1 }))];
    const r = pickSample(entries, base, 10);
    expect(r.picked).toHaveLength(10);
    expect(r.templates).toBe(31);
    expect(r.picked.length + r.uncovered.length).toBe(31);
    expect(r.uncovered.some((u) => r.picked.some((p) => p.url === u.url))).toBe(false);
  });
  it("페이지 유형을 주소·문구로 추정한다", () => {
    expect(pageType("https://a.kr/", "홈")).toBe("메인");
    expect(pageType("https://a.kr/member/login.do", "필수: 로그인")).toBe("로그인·가입");
    expect(pageType("https://a.kr/board/list.do", "개별 페이지")).toBe("목록");
    expect(pageType("https://a.kr/board/view.do?nttId=3", "개별 페이지")).toBe("상세");
    expect(pageType("https://a.kr/apply/step1", "주요 업무: 신청·예약")).toBe("입력 폼");
  });
});
