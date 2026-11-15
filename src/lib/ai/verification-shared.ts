// 서버 AI 호출과 결과 화면이 함께 쓰는 순수 검수 규칙·표시값.
// 이 파일에는 Node 전용 모듈이나 DB·이미지 처리를 import하지 않는다.

export type VerificationResult = "supported" | "contradicted" | "uncertain" | "insufficient_evidence";
export const VERIFICATION_RESULTS: VerificationResult[] = ["supported", "contradicted", "uncertain", "insufficient_evidence"];

export const VERIFICATION_LABEL: Record<"ko" | "ja", Record<VerificationResult, string>> = {
  ko: { supported: "AI 지지", contradicted: "AI 반박", uncertain: "AI 판단 보류", insufficient_evidence: "AI 근거 부족" },
  ja: { supported: "AI支持", contradicted: "AI反論", uncertain: "AI判断保留", insufficient_evidence: "AI根拠不足" },
};

/** 관찰 근거의 고정 코드 (자유문장은 저장하지 않는다) */
export const VERIFY_REASON_CODES = {
  issue_observed: "자동 점검이 지적한 문제가 입력에서 관찰됨",
  issue_not_observed: "자동 점검이 지적한 문제가 입력에서 관찰되지 않음",
  hidden_or_decorative: "숨김·꾸밈 요소라 자동 신호가 과할 수 있음",
  context_dependent: "주변 문맥·실제 동작을 봐야 판단 가능",
  insufficient: "판단할 근거가 부족함",
} as const;
export type VerifyReasonCode = keyof typeof VERIFY_REASON_CODES;

export type VerificationRoute = "keep_signal" | "human_review" | "record_only";

export const ROUTE_LABEL: Record<"ko" | "ja", Record<VerificationRoute, string>> = {
  ko: { keep_signal: "자동 신호 유지 (확정 아님)", human_review: "사람 확인 필요", record_only: "기록만 (자동 결과 그대로)" },
  ja: { keep_signal: "自動の兆候を維持（未確定）", human_review: "試験者の確認が必要", record_only: "記録のみ（自動結果のまま）" },
};

export const DEFAULT_VERIFY_CONFIDENCE_THRESHOLD = 0.75;

/** 자동 결과와 AI 검수 결과로 다음 처리를 정한다. 결과 값은 바꾸지 않는다. */
export function routeVerification(
  autoResult: string,
  v: { result: VerificationResult; confidence: number | null },
  threshold = DEFAULT_VERIFY_CONFIDENCE_THRESHOLD,
): VerificationRoute {
  const confident = (v.confidence ?? 0) >= threshold;
  if (autoResult === "fail") {
    if (v.result === "insufficient_evidence") return "record_only";
    return v.result === "supported" && confident ? "keep_signal" : "human_review";
  }
  if (autoResult === "pass") return v.result === "contradicted" ? "human_review" : "record_only";
  return "human_review";
}
