import { describe, expect, it } from "vitest";
import { parseRobots, robotsAllows } from "./robots";

describe("robots.txt", () => {
  const r = parseRobots(`# test
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /admin
Disallow: /*.do$
Allow: /admin/public
Crawl-delay: 2
`);
  it("* 그룹 규칙을 쓴다", () => {
    expect(r.crawlDelay).toBe(2);
    expect(robotsAllows(r, "https://a.kr/")).toBe(true);
    expect(robotsAllows(r, "https://a.kr/admin/x")).toBe(false);
    expect(robotsAllows(r, "https://a.kr/admin/public/1")).toBe(true);
    expect(robotsAllows(r, "https://a.kr/list.do")).toBe(false);
    expect(robotsAllows(r, "https://a.kr/list.do?x=1")).toBe(true);
  });
  it("우리 에이전트 그룹이 있으면 우선", () => {
    const m = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: a11ynote\nDisallow: /private");
    expect(robotsAllows(m, "https://a.kr/notice")).toBe(true);
    expect(robotsAllows(m, "https://a.kr/private/1")).toBe(false);
  });
  it("빈 파일은 모두 허용", () => {
    expect(robotsAllows(parseRobots(""), "https://a.kr/x")).toBe(true);
  });
  it("에이전트 이름은 정확히 일치할 때만 (부분 일치 무시)", () => {
    const m = parseRobots("User-agent: a\nDisallow: /\n\nUser-agent: note\nDisallow: /\n\nUser-agent: *\nDisallow: /x");
    expect(robotsAllows(m, "https://a.kr/y")).toBe(true);
    expect(robotsAllows(m, "https://a.kr/x/1")).toBe(false);
    const m2 = parseRobots("User-agent: A11yNote/1.0\nDisallow: /only-us");
    expect(robotsAllows(m2, "https://a.kr/only-us")).toBe(false);
  });
});
