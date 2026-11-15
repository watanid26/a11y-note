import { redactText } from "./url";

// 로그에 남기기 전 개인정보·토큰이 들어 있을 수 있는 부분을 지운다 (P0-9).
//  - 주소의 쿼리 문자열·조각(#) (세션 ID, 토큰, 검색어 등)
//  - ;jsessionid= 같은 경로 세션 ID
//  - HTML 조각 (입력값·개인정보가 들어 있을 수 있음)
//  - 연결 키·Bearer 값
export function scrubLog(input: unknown, max = 300): string {
  let s = redactText(String(input ?? ""));
  s = s.replace(/(https?:\/\/[^\s?#"'<>]+?)(;jsessionid=[^\s?#"'<>]*)?[?#][^\s"'<>]*/gi, "$1");
  s = s.replace(/;jsessionid=[^\s?#"'<>/]*/gi, "");
  s = s.replace(/<([a-z][a-z0-9]*)\b[^>]*>[^<]*<\/\1>/gi, "[HTML]"); // <td>홍길동</td> 처럼 내용 포함
  s = s.replace(/<\/?[a-z][^>]*>/gi, "[HTML]"); // 남은 단독 태그
  s = s.replace(/(\[HTML\]\s*)+/g, "[HTML] ").replace(/\[HTML\] $/, "[HTML]");
  s = s.replace(/\ban_[0-9a-f]{48}\b/g, "an_[숨김]");
  s = s.replace(/Bearer\s+\S+/gi, "Bearer [숨김]");
  return s.slice(0, max);
}
