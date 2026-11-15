// 오류별 "쉽게 보기"와 개선 방향 (한국어 보고서 전용).
// 기준 원문(항목 번호·제목·판정)은 그대로 두고, 그 옆에 쉬운 설명을 붙인다.
//  - 누가 어떻게 불편한가: 실제 사용자와 상황을 한 문장으로
//  - 수정 전·후: 점검 도구가 본 실제 HTML 과, 그 HTML 을 기준으로 만든 수정 예시 (못 만들면 일반 예시로 표시)
//  - 개선 방향: 어디를(공통 요소 먼저) 무엇으로 고치는지 단계별로, 왜 이 순서인지
//  - 고친 뒤 확인: 사람이 직접 확인하는 방법 + 재점검
// 모든 문장은 이 파일의 고정 문구다 (copy.ts 원칙: 보고서 본문에 AI 자유문장 없음). 판정에는 쓰지 않는다.

import { STATE_LABEL, causeGroups, fixedExample, type IssueRecord } from "./model";

interface Guide {
  /** 누가 어떻게 불편한가 (한 문장) */
  who: string;
  /** 고치는 단계 (공통 요소 안내·재점검은 자동으로 앞뒤에 붙는다) */
  steps: string[];
  /** 고친 뒤 사람이 확인하는 방법 */
  verify: string;
}

const SR = "화면 낭독기(스크린 리더)를 쓰는 시각장애인";
const KB = "마우스를 쓰기 어려워 키보드로만 이동하는 사용자(운동장애인·화면 낭독기 사용자)";

const ALT: Guide = {
  who: `${SR}은 이 이미지를 "이미지" 또는 파일 이름으로만 듣게 되어, 이미지가 전하는 정보나 버튼의 기능을 알 수 없어요.`,
  steps: [
    "이미지가 무엇을 전하는지 먼저 정해요. 정보를 주는 이미지면 그 내용(그림 속 글자 포함)을, 링크·버튼 안의 아이콘이면 기능(예: 장바구니, 검색)을 alt 에 적어요.",
    "꾸밈용 이미지(배경 무늬, 옆 글자와 같은 뜻의 아이콘)는 alt=\"\" 로 비워 화면 낭독기가 건너뛰게 해요.",
    "파일명·\"이미지\"·\"아이콘\" 같은 말은 쓰지 않아요. 이미지 속 글이 길면 alt 는 요약하고 본문에 같은 내용을 글로 둬요.",
  ],
  verify: "개발자 도구에서 alt 값이 이미지 내용과 같은 뜻인지 보고, 화면 낭독기(NVDA·VoiceOver 등)로 들었을 때 그 내용이 읽히는지 확인해요.",
};

const NAME: Guide = {
  who: `${SR}은 이 요소를 "링크" 또는 "버튼"이라고만 듣게 되어, 누르면 무엇이 되는지 알 수 없어 원하는 기능을 쓰지 못해요.`,
  steps: [
    "화면에 보이는 글자가 있으면 그 글자를 요소 안에 넣는 것이 가장 좋아요 (숨김 글자 class 도 가능).",
    "아이콘만 있는 요소는 aria-label 에 목적지나 기능(예: \"통합검색\", \"메뉴 열기\")을 적고, 안쪽 아이콘(svg·img)은 aria-hidden=\"true\" 또는 alt=\"\" 로 둬요.",
    "같은 아이콘이 여러 화면에 반복되면 공통 컴포넌트에서 한 번에 고쳐요.",
  ],
  verify: "화면 낭독기로 Tab 이동했을 때 \"통합검색, 링크\"처럼 이름과 역할이 함께 읽히는지 확인해요.",
};

const LABEL: Guide = {
  who: `${SR}은 이 칸을 "편집, 입력란"으로만 듣게 되어 무엇을 적어야 하는지 모르고, 자리표시 글자는 입력을 시작하면 사라져 저시력·인지장애 사용자도 무엇을 적던 칸인지 잊기 쉬워요.`,
  steps: [
    "보이는 이름표를 <label for=\"입력칸 id\"> 로 입력칸과 연결해요. 이름표를 화면에 둘 수 없으면 aria-label 이나 title 로 이름을 줘요.",
    "placeholder(자리표시)만으로 이름을 대신하지 않아요.",
    "필수 입력, 입력 형식(예: 숫자 8자리)이 있으면 이름표나 설명에 함께 적어요.",
  ],
  verify: "이름표 글자를 누르면 해당 입력칸에 초점이 가는지, 화면 낭독기가 \"검색어, 편집\"처럼 이름을 읽는지 확인해요.",
};

const CONTRAST: Guide = {
  who: "저시력인, 노안이 온 고령자, 햇빛 아래에서 휴대폰을 보는 사용자는 배경과 비슷한 색의 글자를 읽지 못하거나 읽는 데 오래 걸려요.",
  steps: [
    "글자색을 더 진하게 하거나 배경을 더 밝게(또는 반대로) 바꿔 명암비를 4.5:1 이상(18pt·굵은 14pt 이상 큰 글자는 3:1 이상)으로 맞춰요.",
    "흰 배경의 회색 글자는 #767676 보다 진한 색을 써요. 이미지 위 글자는 글자 뒤에 반투명 어두운 판을 깔아요.",
    "같은 색이 디자인 토큰·공통 CSS 변수에서 오면 그 한 곳을 고쳐요.",
  ],
  verify: "크롬 개발자 도구의 색 선택기(Contrast ratio)나 명암비 측정 도구로 글자색·배경색 명암비가 기준 이상인지 확인해요.",
};

const KEYBOARD: Guide = {
  who: `${KB}는 이 기능에 초점을 옮길 수 없어 메뉴를 열거나 신청을 끝낼 수 없어요.`,
  steps: [
    "클릭 기능이 걸린 div·span·li 를 <button type=\"button\"> 이나 <a href> 로 바꿔요. 이것만으로 Tab 이동과 Enter·Space 실행이 생겨요.",
    "태그를 바꿀 수 없으면 tabindex=\"0\", 알맞은 role, Enter·Space 키 처리를 함께 넣어요.",
    "마우스를 올려야만 열리는 메뉴는 초점(focus)이 올 때도 열리게 해요.",
  ],
  verify: "마우스를 쓰지 않고 Tab·Shift+Tab·Enter·Space 만으로 해당 기능을 처음부터 끝까지 실행해 봐요.",
};

const FOCUS: Guide = {
  who: `${KB}는 지금 초점이 어디에 있는지 보이지 않아, 무엇을 누르게 될지 모른 채 Enter 를 눌러야 해요.`,
  steps: [
    "CSS 의 outline: none(또는 outline: 0)을 지우거나, :focus-visible 에 눈에 띄는 테두리를 줘요.",
    "초점 표시 색은 주변 배경과 명암비 3:1 이상, 두께 2px 이상을 권장해요.",
    "공통 CSS(reset·base)에서 outline 을 없앤 경우가 많으므로 그 한 곳을 먼저 확인해요.",
  ],
  verify: "Tab 키로 페이지 처음부터 이동하며 모든 링크·버튼·입력칸에서 초점 테두리가 보이는지 확인해요.",
};

const SKIP: Guide = {
  who: `${KB}는 페이지마다 머리글 메뉴를 수십 번 Tab 으로 지나가야 본문에 닿아요.`,
  steps: [
    "<body> 바로 다음, 첫 Tab 위치에 \"본문 바로가기\" 링크를 둬요.",
    "링크의 href(예: #content)가 가리키는 id 를 본문 시작 요소(<main> 등)에 실제로 붙여요.",
    "링크를 평소에 숨기더라도 초점을 받으면 화면에 보이게 해요 (display:none 은 쓰지 않아요).",
  ],
  verify: "페이지를 열고 Tab 을 한 번 눌러 첫 초점이 \"본문 바로가기\"인지, Enter 를 누르면 본문 첫 부분으로 이동하는지 확인해요.",
};

const KO: Record<string, Guide> = {
  "image-alt": ALT,
  "input-image-alt": ALT,
  "role-img-alt": ALT,
  "svg-img-alt": ALT,
  "area-alt": ALT,
  "ai-image": {
    who: `${SR}은 alt 에 적힌 말만 듣기 때문에, alt 가 그림 내용(특히 배너 속 글자·날짜)과 다르면 화면을 보는 사람과 다른 정보를 받아요.`,
    steps: ALT.steps,
    verify: ALT.verify,
  },
  "image-redundant-alt": {
    who: `${SR}은 이미지 설명과 바로 옆 글자를 연달아 들어 같은 말을 두 번 듣게 돼요.`,
    steps: ["옆에 같은 뜻의 글자가 있으면 이미지는 alt=\"\" 로 비워요.", "링크 하나 안에 이미지와 글자가 함께 있으면 글자만 이름이 되게 해요."],
    verify: "화면 낭독기로 들었을 때 같은 말이 두 번 읽히지 않는지 확인해요.",
  },
  "color-contrast": CONTRAST,
  "link-in-text-block": {
    who: "색을 구분하기 어려운 사용자(색각이상인)와 흑백 화면 사용자는 본문 속 링크가 어디인지 알아보지 못해요.",
    steps: ["본문 속 링크에 밑줄을 넣어요.", "밑줄을 쓰지 않으려면 주변 글자와 명암비 3:1 이상 차이를 주고, 초점·마우스 올림 때 밑줄 등 추가 표시를 줘요."],
    verify: "화면을 흑백으로 보거나(개발자 도구 Rendering > 색각 이상 시뮬레이션) 링크가 주변 글자와 구분되는지 확인해요.",
  },
  "link-name": NAME,
  "button-name": NAME,
  "input-button-name": NAME,
  "aria-command-name": NAME,
  "aria-input-field-name": { ...LABEL },
  "aria-toggle-field-name": NAME,
  "aria-hidden-focus": {
    who: `${SR}은 Tab 을 눌렀는데 아무 소리도 나지 않는 곳(숨긴 슬라이드·닫힌 메뉴)으로 초점이 가서, 어디에 있는지 놓치고 같은 자리를 맴돌아요.`,
    steps: [
      "화면에서 숨긴 영역(aria-hidden=\"true\")에는 inert 속성을 함께 주어 초점이 들어가지 않게 해요.",
      "inert 를 쓸 수 없으면 숨긴 영역 안의 링크·버튼에 tabindex=\"-1\" 을 주고, 다시 보일 때 원래대로 돌려요.",
      "슬라이드 라이브러리를 쓰면 접근성 옵션(a11y·accessibility)이 켜져 있는지 먼저 확인해요.",
    ],
    verify: "Tab 으로 이동하며 화면에 보이지 않는 곳에 초점이 가지 않는지 확인해요.",
  },
  label: LABEL,
  "select-name": LABEL,
  "label-title-only": LABEL,
  "form-field-multiple-labels": LABEL,
  "document-title": {
    who: `${SR}은 페이지를 열 때 제목부터 듣는데, 제목이 없거나 모든 페이지가 같으면 지금 어느 페이지에 왔는지 알 수 없어요. 브라우저 탭을 여러 개 연 사용자도 탭을 구분하지 못해요.`,
    steps: ["<title> 에 \"페이지 이름 | 사이트 이름\" 형식으로 페이지마다 다른 제목을 적어요.", "검색 결과·단계형 신청 화면은 상태도 넣어요 (예: \"검색 결과 12건 | 사이트명\", \"2단계 정보 입력 | 민원 신청\")."],
    verify: "브라우저 탭에 마우스를 올려 제목이 페이지 내용을 설명하고 다른 페이지와 다른지 확인해요.",
  },
  "frame-title": {
    who: `${SR}은 삽입된 영역(iframe)을 "프레임"으로만 듣게 되어, 지도인지 동영상인지 알 수 없어요.`,
    steps: ["iframe 마다 내용을 설명하는 title 을 줘요 (예: title=\"오시는 길 지도\").", "꾸밈·추적용 빈 iframe 은 title 을 주고 aria-hidden=\"true\" 와 tabindex=\"-1\" 을 함께 둬요."],
    verify: "개발자 도구에서 iframe 의 title 값을 확인해요.",
  },
  "html-has-lang": {
    who: `${SR}은 페이지 언어를 알 수 없으면 한국어를 영어 발음 규칙으로 읽어, 내용을 알아들을 수 없게 돼요.`,
    steps: ["<html> 태그에 lang=\"ko\" 를 넣어요.", "공통 레이아웃(HTML 뼈대) 한 곳을 고치면 모든 페이지가 함께 해결돼요."],
    verify: "개발자 도구에서 <html lang=\"ko\"> 인지 확인해요.",
  },
  "html-lang-valid": {
    who: `${SR}은 잘못된 언어 값 때문에 알맞은 발음을 고르지 못해요.`,
    steps: ["lang 값을 ko, en 처럼 올바른 언어 코드로 고쳐요."],
    verify: "개발자 도구에서 lang 값이 올바른 언어 코드인지 확인해요.",
  },
  bypass: SKIP,
  "kr-skip-link": SKIP,
  "kr-click-only": KEYBOARD,
  "nested-interactive": KEYBOARD,
  "scrollable-region-focusable": {
    who: `${KB}는 스크롤 영역 안쪽 내용(약관·표 등)을 스크롤할 수 없어 끝까지 읽지 못해요.`,
    steps: ["스크롤 영역에 tabindex=\"0\" 과 이름(aria-label, 예: \"이용약관 전문\")을 줘요.", "가능하면 영역 안에 초점을 받을 수 있는 요소를 두지 말고 내용을 펼쳐 보이게 해요."],
    verify: "Tab 으로 영역에 초점을 옮긴 뒤 방향키로 안쪽을 스크롤할 수 있는지 확인해요.",
  },
  "kr-keyboard-trap": {
    who: `${KB}는 이 영역에 들어간 뒤 빠져나오지 못해 페이지의 나머지를 전혀 쓸 수 없어요.`,
    steps: ["Tab·Shift+Tab 으로 영역 밖으로 나갈 수 있게 초점 가두기 코드를 고쳐요.", "레이어 팝업은 Esc 와 닫기 버튼으로 닫히고, 닫히면 팝업을 연 버튼으로 초점을 돌려보내요.", "동영상·지도 등 외부 플레이어는 키보드 탈출 방법을 함께 안내해요."],
    verify: "해당 영역에서 Tab·Shift+Tab·Esc 를 눌러 바깥으로 나올 수 있는지 확인해요.",
  },
  "kr-focus-indicator": FOCUS,
  "kr-focus-order": {
    who: `${KB}는 Tab 을 누를 때마다 엉뚱한 곳으로 초점이 튀어, 화면 순서대로 내용을 이해하지 못해요.`,
    steps: ["tabindex 에 0보다 큰 값(1, 2…)을 쓰지 않아요.", "화면에 보이는 순서와 HTML 순서를 맞춰요 (CSS 로만 위치를 바꾸지 않아요)."],
    verify: "Tab 으로 처음부터 이동하며 초점 순서가 화면을 읽는 순서(위→아래, 왼쪽→오른쪽)와 같은지 확인해요.",
  },
  tabindex: {
    who: `${KB}는 Tab 순서가 화면 순서와 달라져 원하는 곳을 찾기 어려워요.`,
    steps: ["tabindex 는 0 이나 -1 만 써요.", "순서를 바꾸고 싶으면 HTML 순서를 바꿔요."],
    verify: "Tab 순서가 화면 순서와 같은지 확인해요.",
  },
  "target-size": {
    who: "손 떨림이 있는 사용자, 큰 손가락으로 휴대폰을 쓰는 사용자는 작은 버튼을 정확히 누르기 어려워 옆 버튼을 잘못 누르기 쉬워요.",
    steps: [
      "개발자 도구에서 실제 크기를 재어 대각선이 6mm(약 22.7px) 미만인지 먼저 확인해요. 이 신호는 WCAG 2.5.8 에서 나온 참고 신호로, KWCAG 6.1.3 위반 확정이 아니에요.",
      "작다면 보이는 아이콘은 그대로 두고 padding 이나 min-width·min-height 로 누르는 영역을 키워요. 권장은 가로세로 44px 이상이에요.",
    ],
    verify: "개발자 도구에서 요소의 가로·세로를 재어 대각선 6mm(약 22.7px) 이상인지 확인해요.",
  },
  "kr-small-target": {
    who: "손 떨림이 있는 사용자, 큰 손가락으로 휴대폰을 쓰는 사용자는 작은 버튼을 정확히 누르기 어려워 옆 버튼을 잘못 누르기 쉬워요.",
    steps: ["보이는 아이콘은 그대로 두고 padding 이나 min-width·min-height 로 누르는 영역을 대각선 6mm(약 22.7px) 이상으로 키워요.", "권장은 가로세로 44px 이상이며, 붙어 있는 버튼 사이에는 간격을 둬요."],
    verify: "개발자 도구에서 요소의 가로·세로를 재어 대각선 6mm(약 22.7px) 이상인지 확인해요.",
  },
  "kr-new-window": {
    who: `${SR}은 새 창이 열린 것을 모르고 "뒤로 가기"를 눌러도 이전 화면으로 돌아가지 못해 길을 잃을 수 있어요.`,
    steps: [
      "새 창이 꼭 필요한 링크인지 먼저 정해요. 필요 없으면 target=\"_blank\" 를 지워 같은 창에서 열어요.",
      "새 창이 필요하면 링크 글자에 \"(새 창)\"을 넣거나 title=\"새 창\" 으로 미리 알려요.",
      "안내가 없다는 것만으로는 부적합이 아니에요. 사용자가 의도하지 않은 새 창·맥락 변화가 실제로 생기는지 캡처와 동작을 보고 판정해요.",
    ],
    verify: "링크를 눌러 새 창이 열리는지, 열린다면 누르기 전에 그 사실을 알 수 있는지 확인해요.",
  },
  "kr-generic-link": {
    who: `${SR}은 링크만 모아 들을 때 "더보기, 더보기, 더보기"만 들려 어느 게시판으로 가는지 구분하지 못해요.`,
    steps: ["링크 글자에 대상을 넣어요 (예: \"공지사항 더보기\").", "디자인상 글자를 늘릴 수 없으면 숨김 글자나 aria-label 로 보충해요. 이때 aria-label 은 보이는 글자로 시작하게 해요."],
    verify: "화면 낭독기의 링크 목록 기능으로 들었을 때 링크마다 목적지를 구분할 수 있는지 확인해요.",
  },
  "ai-link": {
    who: `${SR}은 링크 글자만 듣고 이동 여부를 정하는데, "여기", "바로가기"만으로는 어디로 가는지 알 수 없어요.`,
    steps: ["링크 글자(또는 같은 문장·목록 항목)만으로 목적지를 알 수 있게 고쳐요.", "보이는 글자를 바꿀 수 없으면 숨김 글자로 보충해요."],
    verify: "링크 글자와 주변 문맥만으로 목적지를 알 수 있는지 확인해요.",
  },
  "ai-title": {
    who: `${SR}은 페이지 제목으로 지금 위치를 확인하는데, 모든 페이지 제목이 같으면 어디에 왔는지 알 수 없어요.`,
    steps: ["\"페이지 이름 | 사이트 이름\" 형식으로 페이지마다 다른 제목을 적어요."],
    verify: "브라우저 탭 제목이 페이지 내용을 설명하고 다른 페이지와 다른지 확인해요.",
  },
  "label-content-name-mismatch": {
    who: "음성으로 컴퓨터를 조작하는 사용자(상지장애인)가 화면에 보이는 글자대로 \"검색 눌러\"라고 말해도, 실제 이름이 달라 버튼이 눌리지 않아요.",
    steps: ["aria-label 을 지워 보이는 글자가 이름이 되게 하거나, aria-label 이 보이는 글자로 시작하게 고쳐요 (예: 보이는 글자 \"검색\" → aria-label=\"검색 실행\")."],
    verify: "개발자 도구 Accessibility 탭에서 계산된 이름(Name)에 보이는 글자가 그대로 들어 있는지 확인해요.",
  },
  "kr-autoplay": {
    who: `${SR}은 페이지 소리가 자동으로 나오면 낭독 소리와 겹쳐 아무것도 듣지 못하고, 멈춤 버튼도 찾기 어려워요.`,
    steps: ["autoplay 를 지우고 사용자가 재생하게 해요.", "자동 재생이 꼭 필요하면 muted 로 시작하거나 3초 안에 멈추게 하고, 정지·음량 버튼을 둬요."],
    verify: "페이지를 열었을 때 소리가 자동으로 나지 않는지(또는 3초 안에 멈추는지) 확인해요.",
  },
  "kr-carousel-stop": {
    who: "읽는 속도가 느린 사용자(저시력·인지장애·고령자)는 내용을 다 읽기 전에 슬라이드가 넘어가 정보를 놓쳐요.",
    steps: ["자동으로 넘어가는 슬라이드 가까이에 정지·재생 버튼을 둬요.", "초점이나 마우스가 슬라이드에 있으면 자동 전환을 멈춰요."],
    verify: "정지 버튼을 키보드로 눌러 슬라이드가 멈추는지 확인해요.",
  },
  "kr-captcha": {
    who: "시각장애인은 그림 글자로 된 보안문자를 읽을 수 없어 가입·신청을 끝내지 못해요.",
    steps: ["음성 보안문자, 문자·이메일 인증 등 다른 방법을 함께 둬요.", "가능하면 사람이 풀어야 하는 퍼즐 없이 확인하는 방식을 써요."],
    verify: "그림을 보지 않고(화면 낭독기만으로) 보안 확인을 통과할 수 있는지 확인해요.",
  },
  "video-caption": {
    who: "청각장애인은 영상 속 말과 소리를 들을 수 없어 내용을 알 수 없어요.",
    steps: ["영상에 자막(<track kind=\"captions\">)을 붙이거나, 자막을 넣을 수 없으면 대본(원고)을 함께 제공해요."],
    verify: "영상을 소리 없이 재생해 자막이나 대본만으로 내용을 알 수 있는지 확인해요.",
  },
  "kr-table-caption": {
    who: `${SR}은 표를 만나면 제목부터 듣고 읽을지 정하는데, 제목이 없으면 칸을 하나씩 들어 봐야 표의 주제를 알 수 있어요.`,
    steps: ["데이터 표에 <caption> 으로 표 제목(필요하면 요약)을 적어요.", "caption 이 없다는 것만으로 부적합은 아니에요. 표 앞 제목이나 문맥으로 알 수 있는지 함께 봐요."],
    verify: "화면 낭독기로 표에 들어갈 때 표 제목이 읽히는지 확인해요.",
  },
  "duplicate-id-aria": {
    who: `${SR}은 이름표·설명이 엉뚱한 요소에 연결되어 다른 칸의 이름을 듣게 될 수 있어요.`,
    steps: ["같은 id 를 페이지 안에서 한 번만 쓰도록 고쳐요.", "반복 컴포넌트는 id 에 번호 등을 붙여 고유하게 만들어요."],
    verify: "개발자 도구 콘솔에서 document.querySelectorAll('#id값').length 가 1인지 확인해요.",
  },
  "meta-refresh": {
    who: "읽는 속도가 느린 사용자와 화면 낭독기 사용자는 읽던 중 페이지가 바뀌어 처음부터 다시 읽어야 해요.",
    steps: ["<meta http-equiv=\"refresh\"> 를 없애거나, 사용자가 이동 시점을 정하게 버튼을 둬요."],
    verify: "페이지를 열어 두었을 때 저절로 새로 고쳐지거나 이동하지 않는지 확인해요.",
  },
};
KO["kr-duplicate-id"] = KO["duplicate-id-aria"];
KO["kr-meta-refresh"] = KO["meta-refresh"];
KO["no-autoplay-audio"] = KO["kr-autoplay"];
KO["ai-carousel"] = KO["kr-carousel-stop"];
KO["ai-captcha"] = KO["kr-captcha"];
KO["ai-media"] = KO["video-caption"];
KO["ai-table"] = KO["kr-table-caption"];

/** 규칙 설명이 없을 때: 기준 항목(앞 두 자리)별로 누가 불편한지 */
const WHO_BY_ITEM: [RegExp, string][] = [
  [/^5\.1\./, `${SR}은 이미지·그림이 전하는 정보를 받을 수 없어요.`],
  [/^5\.2\./, "청각장애인은 영상·음성의 내용을 알 수 없어요."],
  [/^5\.3\./, `${SR}은 표·목록·순서 같은 구조를 알 수 없어 내용을 잘못 이해할 수 있어요.`],
  [/^5\.4\./, "저시력인·색각이상인·고령자는 내용을 구분하거나 읽기 어려워요."],
  [/^6\.1\./, `${KB}는 이 기능을 쓰지 못하거나 쓰는 데 오래 걸려요.`],
  [/^6\.2\./, "읽는 속도가 느린 사용자는 시간 안에 내용을 읽거나 입력을 끝내지 못해요."],
  [/^6\.3\./, "광과민성 발작이 있는 사용자는 깜빡이는 화면 때문에 발작을 일으킬 수 있어요."],
  [/^6\.4\./, `${SR}과 키보드 사용자는 원하는 내용을 찾아가기 어려워요.`],
  [/^6\.5\./, "손 움직임이 불편한 사용자와 음성으로 조작하는 사용자는 이 기능을 쓰기 어려워요."],
  [/^7\.1\./, `${SR}은 내용을 알맞은 발음으로 듣지 못해요.`],
  [/^7\.2\./, `${SR}과 인지장애인은 예상하지 못한 화면 변화 때문에 위치를 잃을 수 있어요.`],
  [/^7\.3\./, `${SR}과 인지장애인은 무엇을 입력해야 하는지, 무엇이 틀렸는지 알기 어려워요.`],
  [/^8\./, `${SR}은 요소의 이름·역할·상태를 정확히 전달받지 못해 기능을 잘못 쓰게 될 수 있어요.`],
];

export interface PlainGuide {
  /** 기준 원문 그대로: 항목 번호·제목 · 판정 상태 · 우선순위 */
  criterion: string;
  /** 무엇이 문제인가 (쉬운 말) */
  problem: string;
  /** 누가 어떻게 불편한가 */
  who: string;
  /** 수정 전: 점검 도구가 본 실제 코드 (없으면 null) */
  before: { selector: string; html: string } | null;
  /** 수정 후 예시. based = 실제 코드를 바탕으로 만든 예시인지 (아니면 일반 예시) */
  after: { code: string; note: string; based: boolean } | null;
  /** 개선 방향 (번호 없이 순서대로). 사람 확인 필요 항목은 확인 절차 */
  steps: string[];
  /** Word 오류 카드용 짧은 개선 방향: 6.3 표가 대신 말하는 "공통 요소부터"·"다시 점검" 단계를 뺀 것 */
  core: string[];
  /** 고친 뒤 확인 */
  verify: string;
  /** 왜 이 순서로 고치는지 */
  why: string;
  /** 수정 범위 (공통 요소 k곳 / 개별 요소 j곳) */
  scope: string;
}

const HTML_MAX = 260;

/** model.ts 의 확인 절차("~한다.")를 보고서 문체("~해요.")로 */
function polite(s: string): string {
  return s.replace(/한다\./g, "해요.").replace(/본다\./g, "봐요.").replace(/이다\./g, "이에요.").replace(/있다\./g, "있어요.").replace(/없다\./g, "없어요.");
}

/** 긴 HTML 은 여는 태그 위주로 자른다 (clip 은 문장 단위라 코드에 쓰지 않는다) */
export function shortHtml(html: string, max = HTML_MAX): string {
  const s = html.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

const PRIORITY_WHY: [RegExp, string][] = [
  [/^1순위/, "기능 차단: 고치기 전에는 해당 사용자가 이 기능을 끝까지 쓸 수 없어요. 가장 먼저 고쳐요."],
  [/^2순위/, "이용 불편: 쓸 수는 있지만 오래 걸리거나 실수하기 쉬워요. 1순위 다음에 고쳐요."],
  [/^3순위/, "개선 권장: 이용을 막지는 않지만 고치면 더 편해져요. 1·2순위를 고친 뒤 처리해요."],
];

/** 한국어(KWCAG) 보고서에서만 만든다. 일본 기준은 null */
export function plainGuide(rec: IssueRecord, ja = false, at?: { selector: string; html: string }): PlainGuide | null {
  if (ja) return null;
  const g = KO[rec.ruleId];
  const review = rec.state === "review";
  const groups = causeGroups(rec);
  const shared = groups.filter((x) => x.shared);
  const pages = new Set(rec.locations.map((l) => l.pageStateId)).size;
  // at: 화면에서 지금 보고 있는 위치 (없으면 문제 묶음의 첫 위치)
  const first = at?.html ? at : rec.locations.find((l) => l.html) ?? null;
  const before = first ? { selector: first.selector, html: shortHtml(first.html) } : null;

  let after: PlainGuide["after"] = null;
  if (!review) {
    const own = basedExample(rec.ruleId, first?.html ?? "", rec.variant);
    const ex = own ?? fixedExample(rec.ruleId, first?.html ?? "", rec.example, false);
    if (own) after = { code: own.code, note: (own.note), based: true };
    else if (ex) {
      const tag = /^<([a-z0-9-]+)/i.exec(first?.html ?? "")?.[1]?.toLowerCase();
      const based = Boolean(tag && ex.code.toLowerCase().startsWith(`<${tag}`) && !ex.code.includes("(현재 파일)"));
      after = { code: ex.code, note: (ex.note || (based ? "" : "일반 예시예요. 실제 요소에 맞게 바꿔 주세요.")), based };
    }
  }

  const who = g?.who ?? WHO_BY_ITEM.find(([re]) => re.test(rec.itemCode))?.[1] ?? rec.why;
  const steps: string[] = [];
  let lead = 0;
  if (review) {
    steps.push(`먼저 확인해요: ${polite(rec.howToCheck)}`);
    steps.push("이 항목이 부적합으로 판정됐다면 아래처럼 고쳐요.");
    steps.push(...(g?.steps ?? [rec.fix]));
  } else {
    if (shared.length) {
      lead = 1;
      steps.push(`공통 요소부터 고쳐요: 여러 화면에 반복되는 원인 ${shared.length}곳(머리글·바닥글·공통 컴포넌트)을 한 번 고치면 영향 화면이 함께 해결돼요.`);
    }
    // 스킵 링크 "목적지 없음"은 링크는 있으므로 목적지 고치는 문구(rec.fix)가 더 정확하다
    steps.push(...(rec.variant === "skip_destination" ? [rec.fix] : g?.steps ?? [rec.fix]));
  }
  steps.push("고친 뒤 같은 페이지를 다시 점검해, 회차 비교에서 이 문제가 \"해결됨\"으로 바뀌었는지 확인해요.");

  const why = review
    ? "판정 반영: 자동 규칙만으로는 결론이 안 난 곳이라, 점검노트가 캡처를 보고 항목 판정에 반영했어요. 항목이 부적합이면 영향에 따라 순위를 정해요."
    : PRIORITY_WHY.find(([re]) => re.test(rec.priority))?.[1] ?? rec.priority;
  const single = groups.length - shared.length;
  const scope = `고칠 곳 ${groups.length}곳 (공통 요소 ${shared.length}곳 · 개별 요소 ${single}곳) / 영향 페이지 ${pages}개`;

  return {
    criterion: `${rec.itemCode} ${rec.itemTitle} · ${STATE_LABEL.ko[rec.state]} · ${rec.priority}`,
    problem: rec.title,
    who: (who),
    before,
    after,
    steps: steps,
    core: steps.slice(lead, -1),
    verify: (g?.verify ?? polite(rec.howToCheck)),
    why,
    scope,
  };
}

export interface PlanRow {
  stage: string;
  ids: string[];
  what: string;
}

/**
 * 보고서 전체의 개선 방향: 고치는 순서.
 *  1) 여러 화면 공통 요소가 있는 문제 (적은 수정으로 많은 화면 해결)
 *  2) 1순위 → 2순위 → 3순위
 *  3) 사람 확인 필요 항목은 점검자 확인 후
 */
export function improvementPlan(issues: IssueRecord[], ja = false): PlanRow[] {
  if (ja) return [];
  const fix = issues.filter((r) => r.state !== "review");
  const review = issues.filter((r) => r.state === "review");
  const pages = (r: IssueRecord) => new Set(r.locations.map((l) => l.pageStateId)).size;
  const shared = (r: IssueRecord) => causeGroups(r).some((g) => g.shared);
  // 같은 순위 안에서는 공통 요소가 있는 문제 → 영향 화면이 많은 문제 순
  const order = (list: IssueRecord[]) => [...list].sort((a, b) => Number(shared(b)) - Number(shared(a)) || pages(b) - pages(a) || a.priorityRank - b.priorityRank);
  const rows: PlanRow[] = [];
  const push = (stage: string, list: IssueRecord[], what: string) => {
    if (!list.length) return;
    const ids = order(list).map((r) => r.id);
    const common = order(list).filter(shared).map((r) => r.id);
    const tail = !common.length
      ? " 영향 화면이 많은 순서로 적었어요."
      : common.length === list.length
        ? " 모두 여러 화면에 반복되는 공통 요소가 있어 한 곳을 고치면 여러 화면이 함께 해결돼요. 영향 화면이 많은 순서로 적었어요."
        : ` 이 중 ${common.join(", ")}은(는) 여러 화면 공통 요소라 한 곳만 고쳐도 여러 화면이 함께 해결되므로 먼저 적었어요.`;
    rows.push({ stage, ids, what: what + tail });
  };
  push("1단계 · 1순위 (기능 차단)", fix.filter((r) => r.priorityRank < 200), "해당 사용자가 기능을 끝까지 쓸 수 없게 막는 문제예요. 다음 배포 전에 고쳐요.");
  push("2단계 · 2순위 (이용 불편)", fix.filter((r) => r.priorityRank >= 200 && r.priorityRank < 300), "쓸 수는 있지만 오래 걸리거나 실수하기 쉬운 문제예요. 1순위 다음에 고쳐요.");
  push("3단계 · 3순위 (개선 권장)", fix.filter((r) => r.priorityRank >= 300), "이용을 막지는 않지만 고치면 더 편해지는 문제예요. 정기 개선 때 처리해요.");
  push("판정 반영", review, "자동 규칙만으로 결론이 안 난 오류 의심이에요. 해당 항목이 부적합으로 판정됐으면 위 순서에 넣어 고쳐요.");
  if (rows.length) rows.push({ stage: "마무리 · 재점검", ids: [], what: "고친 다음 같은 범위를 재점검하면 해결됨·그대로 남음·새로 생김으로 나눠서 비교해 줘요." });
  return rows;
}

/** 점검 도구가 본 실제 HTML 을 그대로 고친 예시 (규칙별로 확실히 만들 수 있을 때만). 못 만들면 null */
export function basedExample(ruleId: string, html: string, variant?: IssueRecord["variant"]): { code: string; note: string } | null {
  const h = html.trim();
  if (!h) return null;
  const open = /^<([a-z][a-z0-9-]*)\b[^>]*>/i.exec(h);
  if (!open) return null;
  const tag = open[0];
  const name = open[1].toLowerCase();
  const attr = (n: string) => new RegExp(`\\s${n}=("([^"]*)"|'([^']*)')`, "i").exec(tag);
  const addAttr = (t: string, a: string) => t.replace(/\s*\/?>$/, (end) => ` ${a}${end.includes("/") ? " />" : ">"}`);
  if (ruleId === "kr-click-only" && /^(div|span|li|td|p|img)$/.test(name)) {
    const inner = name === "img" ? "" : new RegExp(`^<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(h)?.[1] ?? "…";
    const keep = tag.slice(name.length + 1, -1).replace(/\s(style|role|tabindex)=("[^"]*"|'[^']*')/gi, "").trim();
    return { code: `<button type="button"${keep ? ` ${keep}` : ""}>${inner || "기능 이름"}</button>`, note: "클릭만 걸린 요소를 button 으로 바꾼 예시예요. 다른 화면으로 이동만 한다면 <a href=\"이동할 주소\"> 가 더 알맞아요. 모양은 CSS 로 맞춰요." };
  }
  if ((ruleId === "label" || ruleId === "select-name" || ruleId === "label-title-only") && /^(input|select|textarea)$/.test(name)) {
    const id = attr("id")?.[2] ?? attr("id")?.[3] ?? attr("name")?.[2] ?? attr("name")?.[3] ?? "field1";
    const field = attr("id") ? tag : addAttr(tag, `id="${id}"`);
    const type = (attr("type")?.[2] ?? attr("type")?.[3] ?? "").toLowerCase();
    const label = ({ password: "비밀번호", search: "검색어", email: "이메일", tel: "전화번호" } as Record<string, string>)[type] ?? "입력칸 이름";
    return { code: `<label for="${id}">${label}</label>\n${field}`, note: "보이는 이름표를 for/id 로 연결한 예시예요. 이름표를 화면에 둘 수 없으면 aria-label 을 써요." };
  }
  if ((ruleId === "kr-autoplay" || ruleId === "no-autoplay-audio") && /^(video|audio)$/.test(name)) {
    const t = tag.replace(/\sautoplay(=("[^"]*"|'[^']*'))?/i, "");
    return { code: `${/\scontrols\b/i.test(t) ? t : addAttr(t, "controls")}</${name}>`, note: "autoplay 를 지우고 재생 버튼(controls)을 둔 예시예요. 자동 재생이 꼭 필요하면 muted 로 시작해요." };
  }
  if (ruleId === "color-contrast") {
    const cls = (attr("class")?.[2] ?? attr("class")?.[3] ?? "").trim().split(/\s+/)[0];
    if (cls) return { code: `.${cls} { color: #595959; } /* 흰 배경 기준 약 7:1. 실제 배경색과 4.5:1 이상인지 측정 */`, note: "점검한 요소의 class 에 더 진한 글자색을 준 예시예요. 색은 실제 배경과 디자인에 맞춰 정해요." };
    return null;
  }
  if (ruleId === "aria-hidden-focus" && attr("aria-hidden")) {
    return { code: addAttr(tag, "inert"), note: "숨긴 영역에 inert 를 함께 주어 안쪽 링크·버튼에 초점이 가지 않게 한 예시예요. 다시 보일 때는 aria-hidden 과 inert 를 함께 지워요." };
  }
  if (ruleId === "frame-title" && name === "iframe") {
    return { code: addAttr(tag.replace(/\stitle=("[^"]*"|'[^']*')/i, ""), 'title="삽입 내용 설명 (예: 오시는 길 지도)"') + "</iframe>", note: "" };
  }
  if ((ruleId === "kr-skip-link" || ruleId === "bypass") && variant === "skip_destination" && name === "a") {
    const target = /^#(.+)$/.exec(attr("href")?.[2] ?? attr("href")?.[3] ?? "")?.[1];
    if (target) return { code: `${h.length > 200 ? `${tag}…</a>` : h}\n…\n<main id="${target}">`, note: `링크가 가리키는 #${target} 를 본문 시작 요소에 붙인 예시예요.` };
  }
  return null;
}

/** Word·수정 요청서 공통 칸 이름 (한국어) */
export const PLAIN_LABEL = {
  easy: "쉽게 보기 · 고치는 법",
  criterion: "기준 (원문 그대로)",
  problem: "무엇이 문제인가요",
  who: "누가 어떻게 불편한가요",
  before: "수정 전 (현재 코드)",
  afterBased: "수정 후 (현재 코드 기준 예시)",
  afterGeneric: "수정 후 (일반 예시)",
  exampleHow: "예시 설명",
  steps: "이렇게 고쳐요",
  reviewSteps: "확인하고 고치는 방법",
  verify: "고친 뒤 확인",
  why: "왜 이 순서인가요",
  scope: "수정 범위",
  exampleNote: "수정 예시는 참고용 고정 예시이며 판정에 쓰지 않아요. 실제 내용(예: alt 문구)은 화면을 보고 정해 주세요.",
  planSub: "6.3 고치는 순서",
  sheet: "쉽게 보기·개선 방향",
  planLead: "같은 결과를 고치는 순서로 다시 묶었어요. 여러 화면에 반복되는 공통 요소를 먼저 고치면 적은 수정으로 많은 화면이 해결돼요. 오류별 고치는 법(수정 전·후 코드, 확인 방법)은 7장의 오류 카드에 있어요.",
  planHead: ["단계", "오류 ID", "무엇을 하나"],
  where: "위치",
  readOrder: "읽는 순서: ① 아래 숫자와 \"우선 처리할 오류\" → ② 2장 지적사항 (오류마다 설명, 캡처, 고치는 방법을 한 장에 정리했어요) → ③ 3장 항목별 판정. 점검 범위와 판정 기준은 부록에 있어요.",
} as const;

/** 단계 목록을 "1. … 2. …" 줄로 */
export function numbered(steps: string[]): string {
  return steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

// ── 같은 요소에서 나온 오류 묶기 ──
// 한 위젯(예: 탭 목록)이 여러 규칙으로 나뉘어 문제 수가 부풀어 보이는 것을 막는다 (공공기관 실사용 시험 2026-10-26).
// 같은 페이지에서 한 요소(선택자)이거나 그 안쪽(선택자 앞부분 + " > ")에서 나온 문제를 그 요소의 묶음으로 본다.
// 판정·문제 수는 바꾸지 않고 "함께 고칠 묶음"으로만 보여 준다.

export interface ElementGroup {
  /** 묶음의 대표 선택자 (가장 바깥 요소) */
  selector: string;
  /** 묶인 오류 ID (우선순위 순서 유지) */
  ids: string[];
  /** 묶음이 나온 화면 수 */
  pages: number;
}

/** 너무 넓은 선택자(html, body, body > main 등)는 묶음의 기준으로 쓰지 않는다 */
function anchorable(sel: string): boolean {
  if (!sel || /^(html|body)$/i.test(sel)) return false;
  return sel.includes("#") || sel.split(" > ").length >= 3;
}

export function sameElementGroups(issues: IssueRecord[]): ElementGroup[] {
  // 요소(선택자)마다: 그 요소이거나 그 안쪽에서 나온 문제를 모은다. 같은 페이지 안에서만 관계를 본다.
  const byEl = new Map<string, { ids: Set<string>; pages: Set<string> }>();
  const anchors = new Set(issues.flatMap((r) => r.locations.map((l) => l.selector)).filter(anchorable));
  for (const sel of anchors) {
    const ids = new Set<string>();
    const pages = new Set<string>();
    for (const r of issues) {
      const hit = r.locations.filter((l) => l.selector === sel || l.selector.startsWith(`${sel} > `));
      if (!hit.length) continue;
      ids.add(r.id);
      for (const l of hit) pages.add(l.pageStateId);
    }
    if (ids.size > 1) byEl.set(sel, { ids, pages });
  }
  // 같은 페이지에서 실제로 함께 나온 경우만 남긴다 (다른 화면의 같은 선택자끼리는 같은 요소라고 단정하지 않음)
  const together = (sel: string, ids: Set<string>) => {
    const perPage = new Map<string, Set<string>>();
    for (const r of issues) {
      if (!ids.has(r.id)) continue;
      for (const l of r.locations) if (l.selector === sel || l.selector.startsWith(`${sel} > `)) perPage.set(l.pageStateId, (perPage.get(l.pageStateId) ?? new Set()).add(r.id));
    }
    const keep = new Set<string>();
    const pages = new Set<string>();
    for (const [p, set] of perPage) if (set.size > 1) { for (const id of set) keep.add(id); pages.add(p); }
    return { keep, pages };
  };
  const list = [...byEl.entries()]
    .map(([selector, v]) => { const t = together(selector, v.ids); return { selector, ids: issues.filter((r) => t.keep.has(r.id)).map((r) => r.id), pages: t.pages.size }; })
    .filter((g) => g.ids.length > 1);
  // 바깥 요소 묶음이 안쪽 요소 묶음의 문제를 모두 담으면 안쪽은 뺀다 (같은 묶음을 두 번 보여 주지 않음)
  return list
    .filter((g) => !list.some((o) => o !== g && g.selector.startsWith(`${o.selector} > `) && g.ids.every((id) => o.ids.includes(id))))
    .sort((a, b) => b.ids.length - a.ids.length || b.pages - a.pages || a.selector.localeCompare(b.selector));
}

// ── 용어 풀이 ──
// 보고서에 자주 나오는 표준 용어를 한 줄로 푼다. 오류 카드에는 그 카드에 나온 용어만 붙인다.
export const GLOSSARY: { term: string; re: RegExp; plain: string }[] = [
  { term: "대체 텍스트(alt)", re: /대체 텍스트|\balt\b/i, plain: "이미지를 볼 수 없는 사람에게 이미지 대신 읽어 주는 글이에요." },
  { term: "화면 낭독기", re: /화면 ?낭독기|스크린 ?리더/, plain: "화면의 글과 버튼 이름을 소리로 읽어 주는 프로그램이에요 (예: NVDA, VoiceOver)." },
  { term: "명도 대비", re: /명도 ?대비|명암/, plain: "글자색과 배경색의 밝기 차이예요. 차이가 작으면 저시력·고령 사용자가 글자를 읽기 어려워요." },
  { term: "초점(focus)", re: /초점|focus/i, plain: "키보드로 지금 선택된 위치예요. Tab 키를 누르면 다음 요소로 옮겨 가요." },
  { term: "레이블(label)", re: /레이블|\blabel\b/i, plain: "입력칸 옆에 붙는 이름표예요. 화면 낭독기는 이 이름으로 무엇을 적는 칸인지 알려 줘요." },
  { term: "건너뛰기 링크", re: /건너뛰기|본문 바로가기|스킵 ?링크/, plain: "페이지 맨 앞에서 메뉴를 건너뛰고 본문으로 바로 가게 해 주는 링크예요." },
  { term: "선택자", re: /선택자/, plain: "코드에서 그 요소를 찾아가는 주소예요. 개발자 도구에서 이 값으로 요소를 찾을 수 있어요." },
  { term: "공통 요소", re: /공통 요소/, plain: "머리글·바닥글처럼 여러 화면에 똑같이 들어가는 부분이에요. 한 번 고치면 모든 화면이 함께 고쳐져요." },
  { term: "자막·대본", re: /자막|대본|caption/i, plain: "영상의 말소리를 글로 보여 주는 것이에요. 청각장애인이 내용을 알 수 있어요." },
  { term: "오류 의심", re: /오류 의심/, plain: "자동 규칙만으로는 결론이 안 난 곳이에요. 점검노트가 캡처와 함께 보고 항목 판정에 반영해요." },
];

/** 글에 나온 용어만 골라 "용어 — 풀이" 줄로 (최대 n개) */
export function termsIn(text: string, n = 3): string[] {
  return GLOSSARY.filter((g) => g.re.test(text)).slice(0, n).map((g) => `${g.term} — ${g.plain}`);
}

// ── 사람 확인을 예/아니오 질문으로 ──
// "예"는 언제나 "문제 있음"이다. 질문이 없는 규칙은 기존처럼 오류 맞음/아님만 보여 준다.
// 6.1.3(6mm)은 원문상 권고라 확정 질문을 만들지 않는다. 7.2.1·5.3.1 은 판정 정책(안내·caption 없음만으로는 부적합 아님)을 질문에 담는다.
const REVIEW_Q: Record<string, { q: string; hint: string }> = {
  "kr-new-window": { q: "이 링크를 누르면 이용자가 예상하지 못한 새 창이나 화면 전환이 실제로 생기나요?", hint: "직접 눌러 봐요. 새 창 안내 문구가 없다는 것만으로는 \"예\"가 아니에요." },
  "ai-title": { q: "브라우저 탭의 페이지 제목이 이 화면의 내용을 알려 주지 못하나요?", hint: "예: 모든 화면 제목이 사이트 이름만 같게 나오면 \"예\"이에요." },
  "document-title": { q: "브라우저 탭의 페이지 제목이 이 화면의 내용을 알려 주지 못하나요?", hint: "예: 모든 화면 제목이 사이트 이름만 같게 나오면 \"예\"이에요." },
  "kr-generic-link": { q: "링크 글자만 듣고는 어디로 가는지 알 수 없나요?", hint: "\"더보기\"·\"바로가기\"처럼 앞뒤 문맥 없이 알 수 없는 링크면 \"예\"이에요." },
  "ai-link": { q: "링크 글자만 듣고는 어디로 가는지 알 수 없나요?", hint: "\"더보기\"·\"바로가기\"처럼 앞뒤 문맥 없이 알 수 없는 링크면 \"예\"이에요." },
  "kr-captcha": { q: "자동입력 방지 문자(CAPTCHA)를 대신할 다른 방법(음성 안내·문자 인증 등)이 없나요?", hint: "그림 문자만 있고 다른 방법이 없으면 \"예\"이에요." },
  "ai-captcha": { q: "자동입력 방지 문자(CAPTCHA)를 대신할 다른 방법(음성 안내·문자 인증 등)이 없나요?", hint: "그림 문자만 있고 다른 방법이 없으면 \"예\"이에요." },
  "color-contrast": { q: "대비 측정 도구로 쟀을 때 글자와 배경의 명도 대비가 4.5:1(큰 글자는 3:1)보다 낮나요?", hint: "배경 이미지·그라데이션 위 글자는 도구가 못 재므로 직접 재요." },
  "video-caption": { q: "말소리가 있는 영상에 자막이나 대본이 없나요?", hint: "말소리가 없는 영상이면 \"아니오\"이에요." },
  "ai-media": { q: "말소리가 있는 영상에 자막이나 대본이 없나요?", hint: "말소리가 없는 영상이면 \"아니오\"이에요." },
  "ai-image": { q: "이미지의 대체 텍스트가 이미지가 전하는 내용과 맞지 않나요?", hint: "꾸밈용 이미지가 alt=\"\" 로 비어 있으면 \"아니오\"이에요." },
  "kr-table-caption": { q: "표의 제목이나 요약이 없어, 표가 무엇을 보여 주는지 알기 어렵나요?", hint: "caption 이 없다는 것만으로는 \"예\"가 아니에요. 표 앞 제목·제목 셀로 알 수 있으면 \"아니오\"이에요." },
  "ai-table": { q: "표의 제목이나 요약이 없어, 표가 무엇을 보여 주는지 알기 어렵나요?", hint: "caption 이 없다는 것만으로는 \"예\"가 아니에요. 표 앞 제목·제목 셀로 알 수 있으면 \"아니오\"이에요." },
  "kr-carousel-stop": { q: "자동으로 넘어가는 슬라이드를 멈추거나 이전·다음으로 넘길 방법이 없나요?", hint: "정지 버튼이나 이전·다음 버튼이 있고 키보드로 쓸 수 있으면 \"아니오\"이에요." },
  "ai-carousel": { q: "자동으로 넘어가는 슬라이드를 멈추거나 이전·다음으로 넘길 방법이 없나요?", hint: "정지 버튼이나 이전·다음 버튼이 있고 키보드로 쓸 수 있으면 \"아니오\"이에요." },
  "page-has-heading-one": { q: "이 화면에 내용을 대표하는 제목(h1 등)이 없나요?", hint: "로고만 있고 화면 제목이 없으면 \"예\"이에요." },
};

export function reviewQuestion(ruleId: string): { q: string; hint: string } | null {
  return REVIEW_Q[ruleId] ?? null;
}
