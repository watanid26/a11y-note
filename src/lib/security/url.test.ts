import { describe, expect, it } from "vitest";
import { aiSafeUrl, looksSensitive, redactText, redactUrl } from "./url";

describe("주소 비식별화 — 기본은 origin + 경로", () => {
  it("허용 목록 밖의 쿼리는 이름과 상관없이 모두 버림", () => {
    expect(redactUrl("https://a.go.kr/list.do?menuId=1234&name=홍길동&token=secret&q=검색어&page=2#top")).toBe("https://a.go.kr/list.do?menuId=1234&page=2");
    expect(redactUrl("https://a.go.kr/view.do?zz9=abc&id=3")).toBe("https://a.go.kr/view.do");
    expect(redactUrl("https://user:pw@a.kr/")).toBe("https://a.kr/");
  });
  it("허용 키라도 값이 규칙에 안 맞으면 버림", () => {
    expect(redactUrl("https://a.kr/x?menuId=hong@example.com&page=abc")).toBe("https://a.kr/x");
    expect(redactUrl("https://a.kr/x?menuId=a8F3k2LmQ9xZ7vB1nC4dE6gH")).toBe("https://a.kr/x");
  });
  it("경로 속 이메일·토큰·세션 ID 는 가림", () => {
    expect(redactUrl("https://a.kr/view.do;jsessionid=ABC123")).toBe("https://a.kr/view.do");
    expect(redactUrl("https://a.kr/users/hong%40example.com/profile")).toBe("https://a.kr/users/[redacted]/profile");
    expect(redactUrl("https://a.kr/reset/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc")).toBe("https://a.kr/reset/[redacted]");
  });
  it("운영 설정으로 허용 키를 더할 수 있음", () => {
    expect(redactUrl("https://a.kr/x?tab=notice&s=1", { A11Y_URL_QUERY_ALLOW: "tab=[a-z]{1,10}" })).toBe("https://a.kr/x?tab=notice");
  });
  it("AI 로는 허용 쿼리도 보내지 않음", () => {
    expect(aiSafeUrl("https://a.kr/list.do?menuId=1&name=홍길동#c")).toBe("https://a.kr/list.do");
  });
});

describe("글(HTML·문맥·로그) 속 주소", () => {
  it("속성값·절대 주소·상대 주소·조각을 모두 처리", () => {
    const html = `<a href="/my.do?token=SECRET1&menuId=5#x">내 정보</a><img src="https://cdn.a.kr/p.png?sig=SECRET2"><form action="//a.kr/s?sid=SECRET3"></form><a href="#main">본문</a> 참고: https://a.kr/x?session=SECRET4.`;
    const out = redactText(html);
    expect(out).not.toMatch(/SECRET\d/);
    expect(out).toContain('href="/my.do?menuId=5"');
    expect(out).toContain('href="#main"');
    expect(out).toContain("https://a.kr/x.");
  });
  it("주소 밖의 이메일·JWT 도 가림", () => {
    expect(redactText("문의 hong@example.com, 토큰 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig")).toBe("문의 [redacted], 토큰 [redacted]");
  });
  it("mailto·tel 링크", () => {
    expect(redactText('<a href="mailto:hong@example.com">메일</a><a href="tel:010-1234-5678">전화</a>')).toBe('<a href="mailto:(생략)">메일</a><a href="tel:(생략)">전화</a>');
  });
});

// ── fuzz: 임의 키·여러 인코딩으로 비밀값을 넣어도 결과에 남지 않아야 한다 ──
function rng(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const SECRETS = [
  "hong.gildong@example.com",
  "010-1234-5678",
  "+82 10 9876 5432",
  "900101-1234567",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJob25nIn0.c2lnbmF0dXJl",
  "dG9rZW4tc2VjcmV0LXZhbHVlLTEyMzQ1Njc4OTA=",
  "a8F3k2LmQ9xZ7vB1nC4dE6gHj2K",
  "4f9c2b7e8a1d3f5c6b0e9a8d7c6b5a4f",
  "홍길동",
  "ｈｏｎｇ＠ｅｘａｍｐｌｅ．ｃｏｍ",
];
const encoders: ((s: string) => string)[] = [
  (s) => s,
  (s) => encodeURIComponent(s),
  (s) => encodeURIComponent(encodeURIComponent(s)),
  (s) => s.replace(/@/g, "%40"),
];
/** 결과에 비밀값(원문·인코딩된 형태)이 남았는지 */
function leaks(out: string, secret: string): boolean {
  const forms = new Set([secret, encodeURIComponent(secret), secret.replace(/@/g, "%40"), secret.normalize("NFKC")]);
  return [...forms].some((f) => f.length >= 3 && out.includes(f));
}

describe("fuzz: 임의 키·인코딩", () => {
  const r = rng(20261011);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const randKey = () => Array.from({ length: 1 + Math.floor(r() * 8) }, () => pick([..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-0123456789"])).join("");

  it("쿼리·조각에 넣은 비밀값은 키 이름과 상관없이 남지 않음 (500회)", () => {
    for (let i = 0; i < 500; i++) {
      const secret = pick(SECRETS);
      const enc = pick(encoders)(secret);
      const key = pick([randKey(), "token", "q", "id", "menuId", "page", "x-amz-signature", "Name", "eMail"]);
      const url = `https://site${i % 7}.go.kr/a/b.do?${key}=${enc}&menuId=12#frag=${enc}`;
      for (const out of [redactUrl(url), aiSafeUrl(url), redactText(`링크 ${url} 끝`), redactText(`<a href="${url}">x</a>`)]) {
        expect(leaks(out, secret), `${url} → ${out}`).toBe(false);
      }
    }
  });

  it("경로에 넣은 개인정보형 값도 남지 않음 (홍길동 같은 일반 글자는 제외)", () => {
    for (const secret of SECRETS.filter((s) => looksSensitive(s))) {
      for (const enc of encoders) {
        const url = `https://a.kr/u/${enc(secret)}/edit`;
        expect(leaks(redactUrl(url), secret), url).toBe(false);
        expect(leaks(aiSafeUrl(url), secret), url).toBe(false);
      }
    }
  });
});
