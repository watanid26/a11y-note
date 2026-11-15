import { describe, expect, it } from "vitest";
import { DANGER_URL } from "../../worker/browser";

describe("자동 탐색이 누르지 않는 주소 (Codex 추가 확인)", () => {
  it("상태를 바꾸는 GET 주소는 막음", () => {
    for (const u of ["https://a.kr/member/logout.do", "https://a.kr/board/delete?id=1", "https://a.kr/news/subscribe?mail=1", "https://a.kr/bbs/unsubscribe.do", "https://a.kr/goods/addCart.do?id=3", "https://a.kr/bbs/recommend.do?id=3", "https://a.kr/poll/vote?id=1", "https://a.kr/order/cancel.do", "https://a.kr/favorite_add?id=1", "https://a.kr/apply/confirm?id=1"]) {
      expect(DANGER_URL.test(u), u).toBe(true);
    }
  });
  it("평범한 화면은 막지 않음", () => {
    for (const u of ["https://a.kr/apply.html", "https://a.kr/board/list.do?menuId=1", "https://a.kr/notice/view.do?id=3", "https://a.kr/likelion/intro", "https://a.kr/cancellation-policy", "https://a.kr/help.html"]) {
      expect(DANGER_URL.test(u), u).toBe(false);
    }
  });
});
