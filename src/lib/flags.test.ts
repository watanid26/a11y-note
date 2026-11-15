import { describe, expect, it } from "vitest";
import { readFlags } from "./flags";
import { isSafeSearchForm } from "./flows";

describe("기능 플래그 (P0-6)", () => {
  it("아무것도 설정하지 않으면 전부 꺼짐", () => {
    expect(readFlags({})).toEqual({ flowAutoTry: false, flowSearch: false, flowEmptySubmit: false, aiFlows: false });
  });
  it("on / 1 / true 만 켜짐, 그 밖의 값은 꺼짐", () => {
    for (const v of ["on", "1", "true", " ON ", "True"]) expect(readFlags({ FLOW_AUTOTRY: v }).flowAutoTry).toBe(true);
    for (const v of ["off", "0", "false", "yes", "", "enabled"]) expect(readFlags({ FLOW_AUTOTRY: v }).flowAutoTry).toBe(false);
  });
  it("세부 플래그만 켜도 전체 스위치가 꺼져 있으면 동작하지 않음", () => {
    const f = readFlags({ FLOW_SEARCH: "on", FLOW_EMPTY_SUBMIT: "on" });
    expect(f.flowSearch).toBe(false);
    expect(f.flowEmptySubmit).toBe(false);
  });
  it("전체 스위치와 세부 플래그를 함께 켜야 동작", () => {
    const f = readFlags({ FLOW_AUTOTRY: "on", FLOW_SEARCH: "on" });
    expect(f.flowSearch).toBe(true);
    expect(f.flowEmptySubmit).toBe(false);
  });
  it("AI 흐름 다듬기는 따로 켬", () => {
    expect(readFlags({ AI_FLOWS: "1" }).aiFlows).toBe(true);
  });
});

describe("검색 자동 실행이 안전한 폼인지", () => {
  const page = "https://a.kr/index.html";
  it("같은 사이트 GET 폼만 허용", () => {
    expect(isSafeSearchForm({ exists: true, method: null, action: "/search.html" }, page)).toBe(true);
    expect(isSafeSearchForm({ exists: true, method: "GET", action: "https://a.kr/s" }, page)).toBe(true);
    expect(isSafeSearchForm({ exists: true, method: "get", action: null }, page)).toBe(true);
  });
  it("폼 없는 검색, POST, 다른 사이트, 이상한 주소는 거부", () => {
    expect(isSafeSearchForm({ exists: false, method: null, action: null }, page)).toBe(false);
    expect(isSafeSearchForm({ exists: true, method: "post", action: "/search" }, page)).toBe(false);
    expect(isSafeSearchForm({ exists: true, method: "dialog", action: null }, page)).toBe(false);
    expect(isSafeSearchForm({ exists: true, method: null, action: "https://other.kr/search" }, page)).toBe(false);
    expect(isSafeSearchForm({ exists: true, method: null, action: "javascript:alert(1)" }, page)).toBe(false);
    expect(isSafeSearchForm({ exists: true, method: null, action: "http://a.kr/search" }, page)).toBe(false); // 프로토콜이 달라도 다른 출처
  });
});
