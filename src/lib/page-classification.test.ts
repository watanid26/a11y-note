import { describe, expect, it } from "vitest";
import { classifyPage } from "./page-classification";

describe("page classification", () => {
  it("diagnostic 안내 화면을 정상 화면과 분리한다", () => {
    expect(classifyPage({ url: "https://example.com/public/info/urlList.html", title: "네트워크/방화벽 정책 등록 안내", text: "접속이 되지 않으면 네트워크 정책을 확인하세요" })).toMatchObject({ kind: "diagnostic" });
  });

  it("intro 주소는 별도 상태로 기록한다", () => {
    expect(classifyPage({ url: "https://example.com/intro", title: "서비스 시작", text: "서비스를 시작합니다" })).toMatchObject({ kind: "intro" });
  });

  it("일반 본문은 normal로 둔다", () => {
    expect(classifyPage({ url: "https://example.com/news", title: "공지사항", text: "오늘의 공지사항입니다" })).toMatchObject({ kind: "normal" });
  });
});
