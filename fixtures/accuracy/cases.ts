// 정확성 검증용 정답 화면 세트 (P0-8).
// 자동 판정 항목마다 "문제 있는 화면(bad)"과 "문제 없는 화면(good)"을 쌍으로 둔다.
// 기대: bad → 해당 항목이 부적합(자동) 또는 최소한 검토 필요 (절대 "문제 미발견" 이면 안 됨 = 거짓 문제 미발견)
//       good → 해당 항목에 부적합이 없어야 함 (있으면 거짓 부적합)
// 실무자 검토: 이 파일과 fixtures/expected.kwcag22.json 을 접근성 실무자가 확인한다.

/** 정답 세트를 고치면 올린다 (검사 코드 버전과 함께 결과 파일에 기록) */
export const CASES_VERSION = "cases-r3"; // r3: 숨긴 입력·건너뛰기 링크 6.1.3 오탐 사례 (2026-10-28).  r2: 6.1.3·7.2.1·5.3.1 자체 규칙 사례를 fail → flag (KWCAG 2.2 원문 대조, 2026-10-24)

export interface AccuracyCase {
  id: string;
  kr: string; // KWCAG 2.2 항목
  jis?: string; // JIS X 8341-3:2016 달성기준 (해당 시)
  what: string;
  /** 정답의 근거 (기준 조항) */
  basis?: string;
  /** 문제가 생기는 조건 */
  condition?: string;
  /** bad 에서 기대하는 최소 결과: fail = 반드시 부적합, flag = 부적합 또는 검토 필요 */
  expect: "fail" | "flag";
  bad: Page;
  good: Page;
}
interface Page {
  body: string;
  head?: string;
  title?: string;
  lang?: string | null;
  skip?: boolean;
}

export const CASES: AccuracyCase[] = [
  { id: "img-alt", basis: "KWCAG 5.1.1 / WCAG 1.1.1: 의미 있는 이미지는 대체 텍스트 제공", condition: "alt 속성이 없는 img", kr: "5.1.1", jis: "1.1.1", what: "이미지 대체 텍스트 없음", expect: "fail",
    bad: { body: `<img src="/logo.png" width="120" height="40">` }, good: { body: `<img src="/logo.png" width="120" height="40" alt="테스트 시청 로고">` } },
  { id: "table-headers", basis: "KWCAG 5.3.1 / WCAG 1.3.1: 표의 제목 셀과 내용 셀 연결", condition: "td 의 headers 가 존재하지 않는 id 를 가리킴", kr: "5.3.1", jis: "1.3.1", what: "표의 headers 가 없는 제목 셀을 가리킴", expect: "fail",
    bad: { body: `<table><caption>명단</caption><tr><th id="h1">이름</th></tr><tr><td headers="nothere">홍길동</td></tr></table>` },
    good: { body: `<table><caption>명단</caption><tr><th id="h1" scope="col">이름</th></tr><tr><td headers="h1">홍길동</td></tr></table>` } },
  // 자동 판정 불가·사람 확인 필요: KWCAG 5.3.1 원문에 <caption> 요구가 명시돼 있지 않다. caption 누락만으로 부적합 확정이 아니며
  // 표 제목·제목 셀·관계와 구조를 사람이 본다. 그래서 bad 는 "검토 필요 이상"만 기대한다 (적합 기대 아님).
  { id: "table-caption", basis: "KWCAG 5.3.1 (국내 진단 실무): 데이터 표 제목(caption) 제공 — 원문 미명시, 사람 확인 필요", condition: "th 가 있는 데이터 표에 caption 없음", kr: "5.3.1", what: "데이터 표 캡션 없음 (한국 실무 기준, 사람 확인)", expect: "flag",
    bad: { body: `<table><tr><th scope="col">이름</th></tr><tr><td>홍길동</td></tr></table>` },
    good: { body: `<table><caption>명단</caption><tr><th scope="col">이름</th></tr><tr><td>홍길동</td></tr></table>` } },
  { id: "contrast", basis: "KWCAG 5.4.3 / WCAG 1.4.3: 텍스트 명도 대비 4.5:1 이상", condition: "#bbb 글자 / #fff 배경 (약 1.9:1)", kr: "5.4.3", jis: "1.4.3", what: "글자 명도 대비 부족", expect: "fail",
    bad: { body: `<p style="color:#bbbbbb;background:#ffffff">공지사항 본문입니다.</p>` }, good: { body: `<p style="color:#222222;background:#ffffff">공지사항 본문입니다.</p>` } },
  { id: "click-only", basis: "KWCAG 6.1.1 / WCAG 2.1.1: 키보드로 모든 기능 사용", condition: "onclick 만 있고 초점을 받을 수 없는 div", kr: "6.1.1", jis: "2.1.1", what: "마우스로만 실행되는 요소", expect: "fail",
    bad: { body: `<div onclick="location.href='/'" style="cursor:pointer;padding:12px">홈으로 이동</div>` },
    good: { body: `<button type="button" onclick="location.href='/'" style="padding:12px">홈으로 이동</button>` } },
  { id: "keyboard-trap", basis: "KWCAG 6.1.1 / WCAG 2.1.2: 키보드 함정 없음", condition: "Tab 키 기본 동작을 막아 초점이 빠져나가지 못함", kr: "6.1.1", jis: "2.1.2", what: "Tab 키로 빠져나갈 수 없는 요소", expect: "fail",
    bad: { body: `<div id="trap" tabindex="0" style="padding:12px;outline:2px solid #000" onkeydown="if(event.key==='Tab'){event.preventDefault()}">날짜 선택</div><a href="/after">다음 링크</a>` },
    good: { body: `<div id="trap" tabindex="0" style="padding:12px">날짜 선택</div><a href="/after">다음 링크</a>` } },
  { id: "focus-indicator", basis: "KWCAG 6.1.2 / WCAG 2.4.7: 초점이 시각적으로 구별", condition: "a:focus 의 outline·box-shadow 제거", kr: "6.1.2", jis: "2.4.7", what: "초점 표시 없앰", expect: "fail",
    bad: { head: `<style>a:focus,a:focus-visible,button:focus{outline:none!important;box-shadow:none!important}</style>`, body: `<p><a href="/a">공지 1</a></p><p><a href="/b">공지 2</a></p>` },
    good: { head: `<style>a:focus{outline:3px solid #1d4ed8}</style>`, body: `<p><a href="/a">공지 1</a></p><p><a href="/b">공지 2</a></p>` } },
  // 자동 판정 불가·사람 확인 필요: KWCAG 6.1.3 원문은 대각 6mm 이상을 "바람직하다"(권고)로 적는다. 6mm 미만이어도 부적합 확정이 아니다.
  { id: "target-size", basis: "KWCAG 6.1.3 / WCAG 2.5.8: 조작 대상 크기 (국내 대각 6mm 는 원문상 권고)", condition: "12×12px 버튼", kr: "6.1.3", what: "누를 수 있는 컨트롤이 너무 작음 (권고 기준, 사람 확인)", expect: "flag",
    bad: { body: `<p>설정 <button type="button" aria-label="닫기" style="width:12px;height:12px;padding:0;border:1px solid #000;font-size:8px">x</button></p>` },
    good: { body: `<p>설정 <button type="button" aria-label="닫기" style="width:44px;height:44px">x</button></p>` } },
  // 공공기관 실사용 시험(2026-10-26) 오탐: 1×1 로 숨긴 "전체메뉴 바로가기"와, label 을 대신 보여 주는 숨긴 체크박스
  { id: "target-size-hidden", basis: "KWCAG 6.1.3: 실제 누르는 영역으로 판단 (label 클릭도 같은 컨트롤 조작, 건너뛰기 링크는 초점 시 표시)", condition: "12×12px 버튼 / 숨긴 체크박스+label, 1×1 건너뛰기 링크", kr: "6.1.3", what: "숨긴 입력·건너뛰기 링크를 작은 대상으로 세지 않음", expect: "flag",
    bad: { body: `<p>설정 <button type="button" aria-label="닫기" style="width:12px;height:12px;padding:0;border:1px solid #000;font-size:8px">x</button></p>` },
    good: { body: `<a href="#gnb" style="position:absolute;width:1px;height:1px;overflow:hidden">전체메뉴 바로가기</a><nav id="gnb"><a href="/a" style="display:inline-block;padding:12px">메뉴</a></nav><div><input type="checkbox" id="agree" style="position:absolute;width:1px;height:1px;opacity:0"><label for="agree" style="display:inline-block;padding:10px 12px">약관에 동의합니다</label></div>` } },
  { id: "meta-refresh", basis: "KWCAG 6.2.1 / WCAG 2.2.1: 시간 제한 조절", condition: "meta refresh 300초 자동 이동", kr: "6.2.1", jis: "2.2.1", what: "시간 제한 자동 새로고침", expect: "fail",
    bad: { head: `<meta http-equiv="refresh" content="300;url=/">`, body: `<p>본문</p>` }, good: { body: `<p>본문</p>` } },
  { id: "skip-link", basis: "KWCAG 6.4.1 / WCAG 2.4.1: 반복 영역 건너뛰기", condition: "첫 초점 요소가 본문 바로가기가 아님", kr: "6.4.1", jis: "2.4.1", what: "본문 바로가기 없음", expect: "fail",
    bad: { skip: false, body: `<p>본문</p>` }, good: { body: `<p>본문</p>` } },
  { id: "page-title", basis: "KWCAG 6.4.2 / WCAG 2.4.2: 페이지 제목 제공", condition: "title 이 빈 문자열", kr: "6.4.2", jis: "2.4.2", what: "페이지 제목 없음", expect: "fail",
    bad: { title: "", body: `<p>본문</p>` }, good: { title: "공지사항 | 테스트 시청", body: `<p>본문</p>` } },
  { id: "link-name", basis: "KWCAG 6.4.3 / WCAG 2.4.4: 링크 텍스트", condition: 'alt="" 이미지만 있는 링크', kr: "6.4.3", jis: "2.4.4", what: "이름 없는 링크 (빈 alt 이미지 링크)", expect: "fail",
    bad: { body: `<a href="/notice"><img src="/logo.png" alt="" width="40" height="40"></a>` },
    good: { body: `<a href="/notice"><img src="/logo.png" alt="공지사항" width="40" height="40"></a>` } },
  { id: "lang", basis: "KWCAG 7.1.1 / WCAG 3.1.1: 기본 언어 표시", condition: "html 에 lang 없음", kr: "7.1.1", jis: "3.1.1", what: "기본 언어 지정 없음", expect: "fail",
    bad: { lang: null, body: `<p>본문</p>` }, good: { body: `<p>본문</p>` } },
  // 자동 판정 불가·사람 확인 필요: KWCAG 7.2.1 은 사용자가 의도하지 않은 새 창·맥락 변화가 실제로 일어날 때 부적합이다.
  // 이 사례는 안내 문구만 없는 링크라(링크를 누르는 사용자 동작으로 열림) 부적합 확정이 아니라 검토 필요를 기대한다.
  { id: "new-window", basis: "KWCAG 7.2.1 (국내 진단 실무): 새 창 열림 안내 — 안내 문구 누락만으로는 부적합 아님, 사람 확인 필요", condition: "target=_blank 링크에 새 창 안내 없음 (자동으로 열리는 창·맥락 변화 없음)", kr: "7.2.1", what: "새 창 안내 없음 (한국 실무, 사람 확인)", expect: "flag",
    bad: { body: `<a href="https://example.com/" target="_blank">관련 기관</a>` }, good: { body: `<a href="https://example.com/" target="_blank" title="새 창">관련 기관</a>` } },
  { id: "label", basis: "KWCAG 7.3.2 / WCAG 1.3.1·4.1.2: 입력 서식 레이블", condition: "label·aria-label 없는 text 입력칸", kr: "7.3.2", jis: "3.3.2", what: "입력칸 레이블 없음", expect: "fail",
    bad: { body: `<form><input type="text" name="q"><button>검색</button></form>` },
    good: { body: `<form><label for="q">검색어</label><input id="q" type="text" name="q"><button>검색</button></form>` } },
  { id: "duplicate-id", basis: "KWCAG 8.1.1 / JIS 4.1.1(WCAG 2.0 4.1.1): 마크업 오류 방지", condition: "같은 id 두 번 사용", kr: "8.1.1", jis: "4.1.1", what: "중복 id", expect: "fail",
    bad: { body: `<p id="dup">첫째</p><p id="dup">둘째</p>` }, good: { body: `<p id="a1">첫째</p><p id="a2">둘째</p>` } },
  { id: "button-name", basis: "KWCAG 8.2.1 / WCAG 4.1.2: 이름·역할", condition: "내용·레이블 없는 button", kr: "8.2.1", jis: "4.1.2", what: "이름 없는 버튼", expect: "fail",
    bad: { body: `<button type="button" style="width:44px;height:44px"></button>` }, good: { body: `<button type="button" style="width:44px;height:44px">확인</button>` } },
  { id: "autoplay", basis: "KWCAG 5.4.2 / WCAG 1.4.2: 자동 재생 금지", condition: "muted 없는 autoplay video", kr: "5.4.2", jis: "1.4.2", what: "소리 있는 미디어 자동 재생", expect: "flag",
    bad: { body: `<video src="/clip.mp4" autoplay width="320" height="180"></video>` }, good: { body: `<video src="/clip.mp4" controls width="320" height="180"></video>` } },
];

export function render(p: Page): string {
  const lang = p.lang === null ? "" : ` lang="${p.lang ?? "ko"}"`;
  const title = p.title ?? "테스트 화면 | 테스트 시청";
  const skip = p.skip === false ? "" : `<a href="#main">본문 바로가기</a>`;
  return `<!doctype html><html${lang}><head><meta charset="utf-8"><title>${title}</title>${p.head ?? ""}</head><body>${skip}<header><nav aria-label="주 메뉴"><a href="/">홈</a></nav></header><main id="main"><h1>${title || "제목"}</h1>${p.body}</main></body></html>`;
}
