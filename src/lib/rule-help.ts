// 규칙별 쉬운 설명: 무엇이 문제인지(title), 누가 왜 곤란한지(why), 어떻게 고치는지(fix, example).
// 기준 항목 설명보다 구체적이라 "오류 상세" 화면과 수정 요청서에서 먼저 쓴다. 없는 규칙은 기준 항목 설명으로 대신한다.

import { JA } from "./rule-help-ja";

export interface RuleHelp {
  title: string;
  why: string;
  fix: string;
  example?: string;
}

const KO: Record<string, RuleHelp> = {
  "image-alt": {
    title: "이미지에 대체 텍스트(alt)가 없어요",
    why: "화면 낭독기 사용자는 이 이미지가 무엇인지 알 수 없고, 파일 이름이 읽히기도 해요.",
    fix: "이미지가 전하는 내용을 alt 에 적어요. 꾸밈용이면 alt=\"\" 로 비워 둬요.",
    example: '<img src="banner.png" alt="2026 서울미식주간 10월 23일~29일">',
  },
  "input-image-alt": {
    title: "이미지 버튼에 이름(alt)이 없어요",
    why: "버튼이 무슨 일을 하는지 화면 낭독기로 알 수 없어요.",
    fix: "버튼 기능을 alt 에 적어요.",
    example: '<input type="image" src="search.png" alt="검색">',
  },
  "role-img-alt": { title: "그림 역할 요소에 설명이 없어요", why: "role=\"img\" 요소의 내용을 화면 낭독기가 알려 줄 수 없어요.", fix: "aria-label 로 그림 내용을 적어요.", example: '<div role="img" aria-label="별점 5점 만점에 4점"></div>' },
  "svg-img-alt": { title: "SVG 그림에 설명이 없어요", why: "의미 있는 SVG 그림이 화면 낭독기에서 무시되거나 이상하게 읽혀요.", fix: "<title> 을 넣거나 aria-label 을 줘요. 꾸밈용이면 aria-hidden=\"true\".", example: '<svg role="img" aria-label="다운로드"><title>다운로드</title>…</svg>' },
  "area-alt": { title: "이미지 지도 영역에 설명이 없어요", why: "클릭 영역이 어디로 가는지 알 수 없어요.", fix: "<area> 마다 alt 를 적어요." },
  "image-redundant-alt": { title: "이미지 설명이 옆 글자와 똑같아요", why: "화면 낭독기가 같은 말을 두 번 읽어요.", fix: "옆에 글자가 있으면 이미지는 alt=\"\" 로 둬요." },
  "color-contrast": {
    title: "글자와 배경의 색 차이가 작아요",
    why: "눈이 나쁜 사용자, 햇빛 아래 휴대폰 사용자는 글자를 읽기 어려워요. 기준은 명암비 4.5:1(큰 글자 3:1) 이상이에요.",
    fix: "글자색을 더 진하게 하거나 배경을 더 밝게 해요. 회색 글자는 #767676 보다 진하게.",
    example: "color: #595959; /* 흰 배경에서 7:1 */",
  },
  "link-in-text-block": { title: "본문 속 링크가 색으로만 구분돼요", why: "색을 구분하기 어려운 사용자는 링크인지 알 수 없어요.", fix: "링크에 밑줄을 넣거나 주변 글자와 명암비 3:1 이상 차이를 줘요." },
  "link-name": {
    title: "링크에 이름이 없어요",
    why: "화면 낭독기가 \"링크\" 라고만 읽어서 어디로 가는지 알 수 없어요. 아이콘만 있는 링크에서 자주 생겨요.",
    fix: "링크 안에 글자를 넣거나, 아이콘이면 aria-label 로 목적지를 적어요.",
    example: '<a href="/search" aria-label="통합검색"><svg aria-hidden="true">…</svg></a>',
  },
  "button-name": {
    title: "버튼에 이름이 없어요",
    why: "화면 낭독기가 \"버튼\" 이라고만 읽어서 무엇을 하는 버튼인지 알 수 없어요.",
    fix: "버튼 안에 글자를 넣거나 aria-label 을 줘요.",
    example: '<button aria-label="메뉴 열기"><svg aria-hidden="true">…</svg></button>',
  },
  "input-button-name": { title: "입력 버튼에 이름이 없어요", why: "무엇을 하는 버튼인지 알 수 없어요.", fix: "value 에 버튼 이름을 적어요.", example: '<input type="submit" value="검색">' },
  "aria-command-name": { title: "버튼·메뉴 역할 요소에 이름이 없어요", why: "화면 낭독기가 무엇을 누르는지 알려 주지 못해요.", fix: "aria-label 이나 안쪽 글자로 이름을 줘요." },
  "aria-hidden-focus": {
    title: "숨긴 영역 안에 키보드 초점이 들어가요",
    why: "aria-hidden 으로 화면 낭독기에서 숨긴 영역에 Tab 키가 들어가면, 낭독기 사용자는 아무 소리 없는 곳에 갇힌 것처럼 느껴요. 슬라이드의 안 보이는 장면에서 자주 생겨요.",
    fix: "숨긴 영역 안의 링크·버튼에 tabindex=\"-1\" 을 주거나, 영역을 숨길 때 inert 속성을 같이 써요.",
    example: '<div class="slide" aria-hidden="true" inert>…</div>',
  },
  "aria-prohibited-attr": { title: "이 요소에 쓸 수 없는 ARIA 속성을 썼어요", why: "aria-label 같은 속성을 쓸 수 없는 요소(예: 역할이 없는 div, span)에 붙이면 화면 낭독기가 읽지 않거나 다르게 읽어요.", fix: "알맞은 역할(role)을 주거나, 보이는 글자로 바꾸거나, 그 aria-* 속성을 지워요." },
  "aria-allowed-attr": { title: "역할에 맞지 않는 ARIA 속성을 썼어요", why: "화면 낭독기가 요소를 잘못 설명할 수 있어요.", fix: "그 역할에서 쓸 수 없는 aria-* 속성을 지워요." },
  "aria-valid-attr-value": { title: "ARIA 속성 값이 잘못됐어요", why: "가리키는 id 가 없거나 값이 틀리면 화면 낭독기가 정보를 못 읽어요.", fix: "aria-controls·aria-labelledby 가 가리키는 id 가 실제로 있는지, 값이 올바른지 확인해요." },
  "aria-valid-attr": { title: "없는 ARIA 속성 이름을 썼어요", why: "철자가 틀린 속성은 무시돼요.", fix: "속성 이름 철자를 고쳐요 (예: aria-labeledby → aria-labelledby)." },
  "aria-required-attr": { title: "역할에 꼭 필요한 ARIA 속성이 빠졌어요", why: "예: role=\"slider\" 에 현재 값이 없으면 값을 알 수 없어요.", fix: "역할에 필요한 속성(aria-valuenow, aria-checked 등)을 넣어요." },
  "aria-required-children": { title: "ARIA 목록·메뉴 안 구성이 맞지 않아요", why: "role=\"list\"·\"menu\"·\"tablist\" 안에 알맞은 항목 역할이 없으면 개수와 위치를 알려 주지 못해요.", fix: "부모 역할에 맞는 자식 역할(listitem, menuitem, tab)을 줘요." },
  "aria-required-parent": { title: "ARIA 항목이 알맞은 부모 안에 있지 않아요", why: "role=\"tab\" 이 tablist 밖에 있는 식이면 화면 낭독기가 묶음을 이해하지 못해요.", fix: "항목을 맞는 부모 역할 안에 넣어요." },
  "aria-roles": { title: "없는 역할(role) 이름을 썼어요", why: "잘못된 role 은 무시돼요.", fix: "올바른 role 값으로 고쳐요." },
  "aria-input-field-name": { title: "입력 역할 요소에 이름이 없어요", why: "무엇을 입력하는 칸인지 알 수 없어요.", fix: "aria-label 이나 aria-labelledby 로 이름을 줘요." },
  "aria-toggle-field-name": { title: "켜기/끄기 요소에 이름이 없어요", why: "무엇을 켜고 끄는지 알 수 없어요.", fix: "aria-label 로 이름을 줘요." },
  "aria-hidden-body": { title: "페이지 전체가 화면 낭독기에서 숨겨져 있어요", why: "<body> 에 aria-hidden 이 있으면 아무것도 읽히지 않아요.", fix: "<body> 의 aria-hidden 을 지워요." },
  label: {
    title: "입력칸에 이름표(label)가 없어요",
    why: "화면 낭독기가 \"입력란\" 이라고만 읽어서 무엇을 적어야 할지 알 수 없어요. 자리표시(placeholder)는 이름표를 대신하지 못해요.",
    fix: "<label for> 로 입력칸과 이름을 연결하거나, 보이지 않게 하려면 aria-label 을 써요.",
    example: '<label for="q">검색어</label>\n<input id="q" type="search">',
  },
  "select-name": { title: "선택 상자에 이름표가 없어요", why: "무엇을 고르는 상자인지 알 수 없어요.", fix: "<label for> 를 연결하거나 aria-label 을 줘요." },
  "label-title-only": { title: "입력칸 이름이 title 로만 있어요", why: "title 은 일부 환경에서 읽히지 않아요.", fix: "보이는 <label> 을 붙여요." },
  "form-field-multiple-labels": { title: "입력칸에 이름표가 여러 개예요", why: "화면 낭독기가 이름을 섞어 읽을 수 있어요.", fix: "이름표를 하나로 정리해요." },
  "document-title": { title: "페이지 제목(title)이 없어요", why: "브라우저 탭과 화면 낭독기가 어떤 페이지인지 알려 주지 못해요.", fix: "<title> 에 \"페이지 이름 | 사이트 이름\" 형태로 적어요.", example: "<title>민원 신청 | 서울특별시</title>" },
  "frame-title": { title: "iframe 에 제목이 없어요", why: "화면 낭독기가 삽입된 영역이 무엇인지 알려 주지 못해요.", fix: "iframe 에 title 을 줘요.", example: '<iframe src="map.html" title="오시는 길 지도"></iframe>' },
  "frame-title-unique": { title: "iframe 제목이 서로 같아요", why: "여러 삽입 영역을 구분할 수 없어요.", fix: "iframe 마다 다른 title 을 줘요." },
  "page-has-heading-one": { title: "페이지에 대표 제목(h1)이 없어요", why: "화면 낭독기 사용자는 제목으로 페이지를 훑는데, 시작점을 찾기 어려워요.", fix: "페이지 주제를 <h1> 으로 하나 둬요." },
  "empty-heading": { title: "내용이 빈 제목(h1~h6)이 있어요", why: "제목 목록에 빈 항목이 생겨 혼란스러워요.", fix: "빈 제목 태그를 지우거나 글자를 넣어요." },
  "heading-order": { title: "제목 단계가 건너뛰어요", why: "h2 다음에 바로 h4 가 오면 구조를 이해하기 어려워요.", fix: "제목 단계를 순서대로(h2 → h3) 써요." },
  bypass: { title: "본문 바로가기가 없어요", why: "키보드 사용자가 매 페이지마다 메뉴를 수십 번 Tab 으로 지나가야 해요.", fix: "페이지 맨 앞에 본문으로 가는 링크를 둬요.", example: '<a href="#content" class="skip">본문 바로가기</a>\n…\n<main id="content">' },
  "kr-skip-link": { title: "본문 바로가기가 없어요", why: "키보드 사용자가 매 페이지마다 메뉴를 수십 번 Tab 으로 지나가야 해요.", fix: "페이지 맨 앞(첫 Tab 위치)에 본문으로 가는 링크를 둬요.", example: '<a href="#content" class="skip">본문 바로가기</a>\n…\n<main id="content">' },
  "html-has-lang": { title: "페이지 언어가 지정돼 있지 않아요", why: "화면 낭독기가 한국어를 영어 발음으로 읽을 수 있어요.", fix: "<html> 에 lang 을 넣어요.", example: '<html lang="ko">' },
  "html-lang-valid": { title: "페이지 언어 값이 잘못됐어요", why: "화면 낭독기가 발음을 고를 수 없어요.", fix: "lang=\"ko\" 처럼 올바른 언어 코드를 써요." },
  "valid-lang": { title: "부분 언어 값이 잘못됐어요", why: "외국어 부분 발음이 틀려요.", fix: "lang 값을 올바른 코드로 고쳐요." },
  "duplicate-id-aria": { title: "같은 id 가 여러 번 쓰였어요", why: "이름표·설명이 엉뚱한 요소에 연결될 수 있어요.", fix: "id 를 페이지 안에서 하나씩만 쓰게 고쳐요." },
  "kr-duplicate-id": { title: "같은 id 가 여러 번 쓰였어요", why: "이름표·설명 연결이 엉뚱한 요소로 갈 수 있어요.", fix: "id 를 페이지 안에서 하나씩만 쓰게 고쳐요." },
  list: { title: "목록(ul/ol) 안에 항목이 아닌 요소가 있어요", why: "화면 낭독기가 항목 개수를 잘못 알려 줘요.", fix: "<ul>·<ol> 바로 안에는 <li> 만 두어요." },
  listitem: { title: "목록 밖에 목록 항목(li)이 있어요", why: "목록으로 인식되지 않아요.", fix: "<li> 를 <ul> 이나 <ol> 안에 넣어요." },
  "definition-list": { title: "정의 목록(dl) 구성이 맞지 않아요", why: "용어와 설명의 짝을 알 수 없어요.", fix: "<dl> 안에는 <dt>·<dd> 만 두어요." },
  dlitem: { title: "정의 목록 밖에 dt/dd 가 있어요", why: "용어와 설명으로 인식되지 않아요.", fix: "<dt>·<dd> 를 <dl> 안에 넣어요." },
  "td-headers-attr": { title: "표의 headers 속성이 잘못된 칸을 가리켜요", why: "칸을 읽을 때 제목 칸이 틀리게 읽혀요.", fix: "headers 가 같은 표의 th id 를 가리키게 고쳐요." },
  "th-has-data-cells": { title: "내용 칸이 없는 표 제목 칸이 있어요", why: "표 구조를 잘못 알려 줘요.", fix: "쓰지 않는 th 를 지우거나 td 로 바꿔요." },
  "td-has-header": { title: "큰 표의 칸에 제목 칸이 연결되지 않았어요", why: "칸 값을 들어도 무엇의 값인지 알 수 없어요.", fix: "th 에 scope 를 주거나 headers 로 연결해요." },
  "kr-table-caption": { title: "표에 제목(caption)이 없어요", why: "표가 무엇에 관한 것인지 먼저 알 수 없어요.", fix: "<caption> 으로 표 제목과 요약을 적어요.", example: "<caption>2026년 민원 처리 현황</caption>" },
  "empty-table-header": { title: "비어 있는 표 제목 칸이 있어요", why: "칸 제목을 알 수 없어요.", fix: "th 에 글자를 넣거나 td 로 바꿔요." },
  "scrollable-region-focusable": { title: "스크롤 영역에 키보드로 들어갈 수 없어요", why: "키보드 사용자는 안쪽 내용을 스크롤해서 볼 수 없어요.", fix: "스크롤 영역에 tabindex=\"0\" 과 이름(aria-label)을 줘요." },
  "nested-interactive": { title: "누르는 요소 안에 또 누르는 요소가 있어요", why: "링크 안에 버튼처럼 겹치면 키보드·화면 낭독기로 안쪽을 쓸 수 없어요.", fix: "겹친 요소를 따로 떼어 놓아요." },
  "kr-click-only": {
    title: "마우스로만 누를 수 있는 곳이 있어요",
    why: "div·li 같은 요소에 클릭만 걸려 있으면 키보드로는 초점이 가지 않아 쓸 수 없어요.",
    fix: "<button> 이나 <a href> 로 바꿔요. 바꿀 수 없으면 tabindex=\"0\", role, Enter·Space 키 처리를 넣어요.",
    example: '<button type="button" onclick="openMenu()">전체메뉴</button>',
  },
  "kr-keyboard-trap": { title: "키보드 초점이 빠져나오지 못하는 곳이 있어요", why: "Tab 키를 눌러도 그 자리에서 벗어날 수 없어 페이지를 더 쓸 수 없어요.", fix: "Tab·Shift+Tab 으로 영역 밖으로 나갈 수 있게 하고, 팝업은 Esc 로 닫히게 해요." },
  "kr-focus-indicator": {
    title: "키보드 초점 표시가 보이지 않아요",
    why: "키보드 사용자는 지금 어디에 있는지 알 수 없어요. CSS 의 outline:none 이 흔한 원인이에요.",
    fix: "outline:none 을 지우거나 :focus-visible 에 눈에 띄는 테두리를 줘요.",
    example: "a:focus-visible, button:focus-visible { outline: 3px solid #1D4ED8; outline-offset: 2px; }",
  },
  "kr-focus-order": { title: "키보드 이동 순서가 화면 순서와 달라요", why: "Tab 을 누를 때마다 엉뚱한 곳으로 튀어 혼란스러워요.", fix: "tabindex 양수 값을 지우고, HTML 순서를 화면 순서와 맞춰요." },
  tabindex: { title: "tabindex 에 0보다 큰 값을 썼어요", why: "키보드 이동 순서가 화면 순서와 달라져요.", fix: "tabindex 는 0 이나 -1 만 써요." },
  "target-size": { title: "누르는 영역 크기 확인이 필요해요 (WCAG 2.5.8 참고)", why: "WCAG 2.5.8 기준(24×24px 또는 간격)에 걸린 신호예요. KWCAG 6.1.3 은 대각선 6mm(약 23px) 기준이라, 점검자가 실제 크기를 재어 판단해야 해요.", fix: "대각선 6mm(약 23px)보다 작으면 키워요. 권장은 가로세로 44px 이상이에요." },
  "kr-small-target": { title: "누르는 영역이 너무 작아요", why: "손 떨림이 있거나 휴대폰을 쓰는 사용자가 잘못 누르기 쉬워요. KWCAG 기준은 대각선 6mm(약 23px) 이상이에요.", fix: "버튼·링크를 대각선 6mm(약 23px) 이상으로 키워요. 권장은 가로세로 44px 이상이에요." },
  "kr-new-window": {
    title: "새 창이 열린다는 안내가 없어요",
    why: "화면 낭독기 사용자는 새 창이 열린 걸 모르고 '뒤로 가기' 가 안 돼 당황해요.",
    fix: "새 창으로 열리는 링크에 \"새 창\" 안내를 넣어요 (글자 또는 title).",
    example: '<a href="https://…" target="_blank" title="새 창 열림">관련 사이트</a>',
  },
  "kr-generic-link": { title: "\"더보기\" 처럼 목적지를 알 수 없는 링크가 있어요", why: "화면 낭독기로 링크만 훑으면 \"더보기, 더보기, 더보기\" 만 들려요.", fix: "무엇을 더 보는지 함께 적거나 aria-label 로 보충해요.", example: '<a href="/notice" aria-label="공지사항 더보기">더보기</a>' },
  "label-content-name-mismatch": { title: "보이는 글자와 실제 이름이 달라요", why: "음성으로 \"검색 눌러\" 라고 말해도 실제 이름이 달라 동작하지 않아요.", fix: "aria-label 에 화면에 보이는 글자를 그대로 포함해요." },
  "kr-autoplay": { title: "소리가 자동으로 재생돼요", why: "화면 낭독기 소리와 겹쳐 아무것도 들리지 않아요.", fix: "자동 재생을 끄거나 음소거로 시작하고, 멈춤 버튼을 둬요." },
  "no-autoplay-audio": { title: "소리가 자동으로 재생돼요", why: "화면 낭독기 소리와 겹쳐 아무것도 들리지 않아요.", fix: "자동 재생을 끄거나 3초 안에 멈추게 해요." },
  "kr-carousel-stop": { title: "자동으로 넘어가는 슬라이드를 멈출 수 없어요", why: "읽는 속도가 느린 사용자는 내용을 다 보기 전에 넘어가 버려요.", fix: "정지·재생 버튼을 슬라이드 가까이에 둬요." },
  "kr-captcha": { title: "보안문자(캡차)에 다른 방법이 없어요", why: "시각장애인은 그림 글자를 읽을 수 없어 가입·신청을 못 해요.", fix: "음성 캡차나 문자 인증 같은 다른 방법을 함께 둬요." },
  "kr-meta-refresh": { title: "페이지가 자동으로 새로 고쳐지거나 이동해요", why: "읽던 중에 화면이 바뀌어 처음부터 다시 읽어야 해요.", fix: "자동 이동을 없애거나 사용자가 조절할 수 있게 해요." },
  "meta-refresh": { title: "페이지가 자동으로 새로 고쳐지거나 이동해요", why: "읽던 중에 화면이 바뀌어 처음부터 다시 읽어야 해요.", fix: "<meta http-equiv=\"refresh\"> 를 없애요." },
  "video-caption": { title: "영상에 자막이 없어요", why: "청각장애인은 영상의 말을 알 수 없어요.", fix: "<track kind=\"captions\"> 로 자막을 붙이거나 대본을 제공해요." },
  "autocomplete-valid": { title: "자동완성(autocomplete) 값이 잘못됐어요", why: "브라우저가 이름·전화번호를 자동으로 채워 주지 못해요.", fix: "autocomplete=\"name\", \"tel\", \"email\" 처럼 표준 값을 써요." },
  "accesskeys": { title: "단축키가 서로 겹쳐요", why: "같은 단축키가 여러 기능에 걸리면 원하는 기능을 쓸 수 없어요.", fix: "accesskey 값을 겹치지 않게 하거나 지워요." },
  "ai-image": { title: "이미지 설명이 그림 내용과 맞는지 확인이 필요해요", why: "대체 텍스트가 있어도 그림 내용(특히 그림 속 글자)과 다르면 정보를 잃어요.", fix: "그림이 전하는 내용(글자 포함)을 alt 에 그대로 적어요." },
  "ai-link": { title: "링크 문구로 목적지를 알 수 있는지 확인이 필요해요", why: "\"여기\", \"바로가기\" 만으로는 어디로 가는지 알 수 없어요.", fix: "링크 문구에 목적지를 담아요." },
  "ai-title": { title: "페이지 제목이 내용을 잘 설명하는지 확인이 필요해요", why: "모든 페이지 제목이 같으면 탭·기록에서 구분할 수 없어요.", fix: "\"페이지 이름 | 사이트 이름\" 형태로 페이지마다 다르게 적어요." },
  "ai-table": { title: "표 제목이 내용을 잘 설명하는지 확인이 필요해요", why: "표의 목적을 알기 어려워요.", fix: "caption 에 표 제목과 요약을 적어요." },
  "ai-carousel": { title: "자동 슬라이드를 멈출 수 있는지 확인이 필요해요", why: "읽기 전에 넘어가 버릴 수 있어요.", fix: "정지 버튼을 둬요." },
  "ai-captcha": { title: "보안문자에 다른 방법이 있는지 확인이 필요해요", why: "그림 글자만 있으면 시각장애인이 통과할 수 없어요.", fix: "음성 등 다른 방법을 함께 둬요." },
  "ai-media": { title: "영상·음성에 자막이나 대본이 있는지 확인이 필요해요", why: "청각장애인은 내용을 알 수 없어요.", fix: "자막이나 대본을 제공해요." },
};

/** 한국어 화면(KWCAG)에서 규칙별 설명. 일본 기준(JIS)은 아직 기준 항목 설명을 쓴다 */
export function ruleHelp(ruleId: string, locale: "ko" | "ja" = "ko"): RuleHelp | null {
  if (locale === "ja") return JA[ruleId] ?? null;
  return KO[ruleId] ?? null;
}
