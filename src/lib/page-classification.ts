import type { ScreenKind } from "../core/types";

export interface PageClassification {
  kind: ScreenKind;
  reason: string | null;
}

/**
 * HTTP 성공 여부와 실제 화면의 성격은 다를 수 있다.
 * 사이트별 문구가 아니라 공통적인 안내·차단·인트로 신호만 보수적으로 분류한다.
 */
export function classifyPage(input: { url: string; title: string; text: string }): PageClassification {
  const haystack = `${input.url} ${input.title} ${input.text}`.slice(0, 12000);
  if (/access[- ]?denied|forbidden|service unavailable|network\s+(?:error|policy)|firewall|접속\s*(?:차단|불가|안내)|네트워크\s*(?:오류|안내|정책)|방화벽/i.test(haystack)) {
    return { kind: "diagnostic", reason: "접속·네트워크·오류 안내 신호가 확인됨" };
  }
  if (/(^|[/_-])intro(?:[/_.-]|\s|$)|landing|welcome|시작 화면|인트로/i.test(`${input.url} ${input.title}`)) {
    return { kind: "intro", reason: "인트로·랜딩 화면으로 보이는 주소 또는 제목" };
  }
  if (/error|not found|maintenance|오류 페이지|페이지를 찾을 수 없|점검 중/i.test(`${input.url} ${input.title}`)) {
    return { kind: "error", reason: "오류·점검 화면으로 보이는 주소 또는 제목" };
  }
  if (!input.text.trim()) return { kind: "unknown", reason: "본문 텍스트가 없어 화면 성격을 확인하지 못함" };
  return { kind: "normal", reason: null };
}
