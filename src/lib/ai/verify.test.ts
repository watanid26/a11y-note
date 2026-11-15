// Phase 1: 자동 점검 결과 AI 2차 검수 — 순수 규칙 (DB·외부 AI 호출 없음)
import { describe, expect, it } from "vitest";
import { inputHash, processVerifications, routeVerification, selectForVerification, verificationInput, verificationsFromAiText, verifyEnabled, verifyMaxPerScan, VERIFICATION_RESULTS } from "./verify";

describe("처리 규칙: AI 검수는 자동 결과를 바꾸지 않고 다음 처리만 정한다", () => {
  it("자동 fail 을 AI 가 반박·보류하면 사람 확인 (pass 로 바꾸지 않음)", () => {
    expect(routeVerification("fail", { result: "contradicted", confidence: 0.99 })).toBe("human_review");
    expect(routeVerification("fail", { result: "uncertain", confidence: 0.9 })).toBe("human_review");
  });
  it("자동 fail 을 AI 가 충분한 신뢰도로 지지하면 자동 신호 유지, 낮으면 사람 확인", () => {
    expect(routeVerification("fail", { result: "supported", confidence: 0.9 })).toBe("keep_signal");
    expect(routeVerification("fail", { result: "supported", confidence: 0.3 })).toBe("human_review");
  });
  it("근거 부족은 기록만", () => {
    expect(routeVerification("fail", { result: "insufficient_evidence", confidence: 0 })).toBe("record_only");
  });
  it("자동 pass 는 AI 지지만으로 적합 확정하지 않고, 반박이면 누락 의심으로 사람 확인", () => {
    expect(routeVerification("pass", { result: "supported", confidence: 1 })).toBe("record_only");
    expect(routeVerification("pass", { result: "contradicted", confidence: 0.8 })).toBe("human_review");
    expect(routeVerification("pass", { result: "insufficient_evidence", confidence: 0 })).toBe("record_only");
  });
  it("사람 확인 필요(review) 결과는 AI 결과와 상관없이 사람 확인", () => {
    for (const r of VERIFICATION_RESULTS) expect(routeVerification("review", { result: r, confidence: 1 })).toBe("human_review");
  });
});

describe("AI 응답 해석", () => {
  const ids = new Set(["a", "b", "c", "d"]);
  it("결과 4종·신뢰도·관찰 근거를 꺼내고, 모르는 값은 근거 부족으로 본다", () => {
    const m = verificationsFromAiText(
      JSON.stringify([
        { id: "a", result: "contradicted", confidence: 1.7, reasonCode: "hidden_or_decorative", evidence: "aria-hidden 영역 안의 장식 아이콘" },
        { id: "b", result: "pass", confidence: 0.9, reasonCode: "issue_observed", evidence: "x" },
        { id: "c", result: "supported", confidence: 0.9, reasonCode: "made_up", evidence: "x" },
        { id: "d", result: "supported", confidence: 0.8, reasonCode: "issue_observed", evidence: "문의 hong@example.com 글자 대비 낮음" },
        { id: "zzz", result: "supported", confidence: 1, reasonCode: "issue_observed" },
      ]),
      ids,
    );
    expect(m.get("a")).toMatchObject({ result: "contradicted", confidence: 1, reasonCode: "hidden_or_decorative" });
    expect(m.get("b")?.result).toBe("insufficient_evidence");
    expect(m.get("c")).toMatchObject({ result: "insufficient_evidence", reasonCode: "insufficient" });
    expect(m.get("d")?.evidence).not.toContain("hong@example.com");
    expect(m.has("zzz")).toBe(false);
  });
  it("배열이 아니면 예외 (호출 쪽은 아무것도 저장하지 않음)", () => {
    expect(() => verificationsFromAiText('{"id":"a"}', ids)).toThrow();
  });
});

describe("외부로 보내는 입력 최소화", () => {
  const f = {
    ruleId: "color-contrast",
    itemCode: "5.4.3",
    result: "fail",
    message: "명도 대비 부족 — 문의 hong@example.com https://example.go.kr/a?token=secret",
    html: '<input name="q" value="홍길동 010-1234-5678"><a href="/board?id=7&token=abc">공지</a>',
    selector: "#q",
  };
  const page = { url: "https://example.go.kr/board/list.do?name=홍길동&token=secret#top", title: "공지사항" };
  const input = verificationInput(f, page, "텍스트 콘텐츠의 명도 대비");
  it("주소는 origin+경로만, 입력값·이메일·토큰은 보내지 않음", () => {
    const text = JSON.stringify(input);
    expect(input.page).toBe("https://example.go.kr/board/list.do");
    expect(text).not.toContain("홍길동 010");
    expect(text).not.toContain("hong@example.com");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("token=abc");
  });
  it("입력 해시는 같은 입력이면 같고, 캡처가 다르면 다름", () => {
    expect(inputHash(input, null)).toBe(inputHash({ ...input }, null));
    expect(inputHash(input, Buffer.from("a"))).not.toBe(inputHash(input, Buffer.from("b")));
  });
});

describe("대상 선정과 호출 상한", () => {
  const t = (n: number) => new Date(2026, 9, 24, 0, 0, n);
  const rows = [
    { id: "r1", scanId: "s1", method: "auto", result: "review", humanResult: null, createdAt: t(1) },
    { id: "f1", scanId: "s1", method: "auto", result: "fail", humanResult: null, createdAt: t(2) },
    { id: "f2", scanId: "s1", method: "auto", result: "fail", humanResult: "pass" as const, createdAt: t(3) },
    { id: "a1", scanId: "s1", method: "ai", result: "fail", humanResult: null, createdAt: t(4) },
    { id: "p1", scanId: "s1", method: "auto", result: "pending", humanResult: null, createdAt: t(5) },
    { id: "f3", scanId: "s2", method: "auto", result: "fail", humanResult: null, createdAt: t(6) },
    { id: "f4", scanId: "s1", method: "auto", result: "fail", humanResult: null, createdAt: t(7) },
  ];
  it("자동(auto) 결과만, fail 먼저, 사람이 판정한 것·이미 검수한 것 제외", () => {
    expect(selectForVerification(rows, new Set(["f4"]), new Map(), 10).map((r) => r.id)).toEqual(["f1", "f3", "r1"]);
  });
  it("회차당 상한은 이미 검수한 수를 포함해 지킨다", () => {
    expect(selectForVerification(rows, new Set(), new Map([["s1", 9]]), 10).map((r) => r.id)).toEqual(["f1", "f3"]);
  });
  it("기본은 꺼짐: AI_VERIFY_ENABLED=1 이 아니면 아무것도 하지 않음 (DB·AI 호출 없음)", async () => {
    expect(verifyEnabled({})).toBe(false);
    expect(verifyEnabled({ AI_VERIFY_ENABLED: "1" })).toBe(true);
    expect(verifyMaxPerScan({})).toBe(30);
    expect(verifyMaxPerScan({ AI_VERIFY_MAX_PER_SCAN: "5" })).toBe(5);
    const prev = process.env.AI_VERIFY_ENABLED;
    delete process.env.AI_VERIFY_ENABLED;
    await expect(processVerifications()).resolves.toBe(0);
    if (prev !== undefined) process.env.AI_VERIFY_ENABLED = prev;
  });
});
