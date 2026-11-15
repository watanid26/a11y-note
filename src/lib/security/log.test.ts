import { describe, expect, it } from "vitest";
import { scrubLog } from "./log";

describe("로그 정리 (P0-9)", () => {
  it("주소의 쿼리·조각·세션 ID 제거", () => {
    expect(scrubLog("page.goto: net::ERR at https://a.kr/mypage.do?name=홍길동&phone=010-1234-5678#top")).toBe("page.goto: net::ERR at https://a.kr/mypage.do");
    expect(scrubLog("GET http://a.kr/board/view.do;jsessionid=ABC123?id=3 실패")).toBe("GET http://a.kr/board/view.do 실패");
  });
  it("HTML 조각·연결 키·Bearer 제거", () => {
    expect(scrubLog('요소 <input value="홍길동" name="nm"> 오류')).toBe("요소 [HTML] 오류");
    expect(scrubLog("셀 <td>홍길동</td><td>010-1234-5678</td> 끝")).toBe("셀 [HTML] 끝");
    expect(scrubLog(`키 an_${"a".repeat(48)} 거부`)).toBe("키 an_[숨김] 거부");
    expect(scrubLog("authorization: Bearer abc.def")).toBe("authorization: Bearer [숨김]");
  });
  it("길이 제한", () => expect(scrubLog("x".repeat(1000)).length).toBe(300));
});
