// 점검 코어가 주고받는 자료 형태.
// 브라우저(서버 워커의 Playwright, 크롬 확장) 안에서 만든 결과를 서버가 받아 판정한다.

export type Impact = "minor" | "moderate" | "serious" | "critical" | null;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 규칙 엔진(axe-core 또는 자체 규칙)이 찾은 문제 하나의 대상 요소 */
export interface RawNode {
  selector: string;
  html: string;
  box: Box | null;
  message: string;
}

/** 규칙 하나의 결과. outcome = 위반(violation) 또는 사람이 봐야 하는 것(incomplete) */
export interface RawResult {
  engine: "axe" | "custom";
  ruleId: string;
  outcome: "violation" | "incomplete";
  impact: Impact;
  /** WCAG 성공기준 번호 (예: "1.1.1") */
  wcag: string[];
  help: string;
  nodes: RawNode[];
}

/**
 * axe 의 통과(passes)·해당 없음(inapplicable) 결과 (원본 보존용, 판정에 쓰지 않음).
 * 위반·확인 필요는 results 에 있다. axe 는 resultTypes 밖 결과에 노드를 1개까지만 주므로 sample 은 최대 1개다.
 */
export interface RuleOutcomeEntry {
  ruleId: string;
  /** axe 원본 태그 (wcag111·best-practice·ACT 등) */
  tags: string[];
  help: string;
  sample: { selector: string; html: string } | null;
}
export interface RuleOutcomes {
  engine: "axe";
  passed: RuleOutcomeEntry[];
  inapplicable: RuleOutcomeEntry[];
}

/** 점검한 브라우저 환경 (WCAG-EM 보고 항목). 개인정보가 아닌 값만 */
export interface BrowserEnvironment {
  userAgent: string;
  language: string;
  viewport: { w: number; h: number };
  screen: { w: number; h: number };
  devicePixelRatio: number;
  reducedMotion: boolean;
  colorScheme: "light" | "dark" | "no-preference";
}

/** AI 판정 후보: 규칙만으로는 적절한지 알 수 없는 요소 */
export interface Candidate {
  kind: "image" | "link" | "title" | "heading" | "table" | "carousel" | "captcha" | "media";
  selector: string;
  box: Box | null;
  /** 판단에 필요한 텍스트 정보 (alt, 링크 문구, 주변 글 등) */
  text: Record<string, string>;
}

/** 이 페이지에 해당 항목이 "있는지" (없으면 해당 없음 처리) */
export interface Applicability {
  images: number;
  media: number;
  tables: number;
  forms: number;
  inputs: number;
  links: number;
  newWindowLinks: number;
  carousels: number;
  captchas: number;
  iframes: number;
  timeLimitHint: boolean;
  accessKeys: number;
}

/** 흐름 안내용 페이지 요약 (메뉴, 폼, 검색창) */
export interface PageOutline {
  navLinks: { text: string; href: string }[];
  forms: { selector: string; kind: "login" | "search" | "signup" | "contact" | "other"; fields: number; submitText: string }[];
  searchInput: string | null;
}

export interface PageSnapshot {
  coreVersion: string;
  url: string;
  title: string;
  lang: string;
  viewport: { w: number; h: number; scrollH: number };
  results: RawResult[];
  candidates: Candidate[];
  applicable: Applicability;
  outline: PageOutline;
  /** DOM 뼈대 요약 — 같은 틀로 찍어낸 페이지를 묶을 때 쓴다 */
  templateSignature: string;
  /** axe 통과·해당 없음 (0.3.0 부터. 예전 확장·파일 업로드에는 없음) */
  ruleOutcomes?: RuleOutcomes;
  /** 점검한 브라우저 환경 (0.3.0 부터) */
  environment?: BrowserEnvironment;
}

/** Tab 키로 이동한 기록 한 칸 */
export interface FocusStop {
  index: number;
  selector: string;
  tag: string;
  text: string;
  box: Box | null;
  /** 초점을 받았을 때 모양이 바뀌었는지 (바뀌지 않으면 초점 표시 없음 의심) */
  indicator: boolean;
}

export interface KeyboardTrace {
  stops: FocusStop[];
  focusableCount: number;
  /** 같은 요소에서 빠져나가지 못한 경우 (Tab 정방향) */
  trappedAt: string | null;
  /** Shift+Tab(역방향)으로 빠져나가지 못한 요소 (Codex 리뷰 7). 역방향 점검을 안 했으면 undefined */
  reverseTrappedAt?: string | null;
  /** 첫 Tab 에 건너뛰기 링크가 있었는지 */
  firstStopIsSkipLink: boolean;
}

/** 브라우저가 요청한 주소와 실제로 화면을 만든 주소를 구분한다. */
export interface NavigationTrace {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  redirected: boolean;
  redirectChain: { url: string; status: number | null }[];
}

/** HTTP 200이어도 정상 업무 화면이 아닐 수 있어 화면 성격을 별도로 기록한다. */
export type ScreenKind = "normal" | "intro" | "diagnostic" | "error" | "unknown";

/** 한 화면 상태의 수집 결과 (서버 워커·확장 공통 업로드 형식) */
export interface CapturedState {
  url: string;
  title: string;
  label: string;
  flowId?: string | null;
  flowStep?: number | null;
  snapshot: PageSnapshot;
  keyboard?: KeyboardTrace | null;
  /** PNG base64 (data: 접두어 없이). 입력칸 글자는 흐리게 가린 상태 */
  screenshot?: string | null;
  screenshotScale?: number;
  navigation?: NavigationTrace;
  screenKind?: ScreenKind;
  screenReason?: string | null;
}
