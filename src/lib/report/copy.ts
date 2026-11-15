// 보고서 문구 규칙 (보고서 품질 고정).
// 원칙
//  - 보고서 본문(Word·PDF)은 이 파일과 규칙 설명(rule-help)의 고정 문구만 쓴다. AI 자유문장은 넣지 않는다.
//  - AI 출력은 구조화된 코드(reasonCode·suggestionCode)와 짧은 근거(evidence)로 제한한다.
//  - 내부 작업 자료(Excel·Markdown)에 AI 근거를 남길 때도 길이·접속어·중복을 정리한 짧은 문장만 쓴다.

/** AI 판단 사유 코드 → 고정 문구 */
export const AI_REASON_CODES = {
  alt_matches: "대체 텍스트가 이미지 내용과 같은 뜻으로 보임",
  alt_mismatch: "대체 텍스트가 이미지 내용과 다름",
  alt_generic: "대체 텍스트가 파일명·일반 단어임",
  alt_decorative: "꾸밈 이미지로 보여 빈 대체 텍스트가 적절함",
  link_clear: "링크 문구로 목적지를 알 수 있음",
  link_unclear: "링크 문구만으로 목적지를 알 수 없음",
  title_ok: "페이지 제목이 내용을 설명함",
  title_generic: "페이지 제목이 일반적이거나 다른 화면과 같음",
  caption_ok: "표 제목이 내용을 설명함",
  caption_weak: "표 제목이 없거나 내용을 설명하지 못함",
  pause_ok: "자동 전환을 멈출 수단이 있음",
  pause_missing: "자동 전환을 멈출 수단이 보이지 않음",
  captcha_alt_ok: "보안문자에 대체 수단이 있음",
  captcha_alt_missing: "보안문자에 대체 수단이 보이지 않음",
  captions_ok: "자막·대본이 있음",
  captions_missing: "자막·대본이 보이지 않음",
  insufficient: "판단할 근거가 부족함",
} as const;
export type AiReasonCode = keyof typeof AI_REASON_CODES;

/** AI 수정 제안 코드 → 고정 문구 */
export const AI_SUGGESTION_CODES = {
  rewrite_alt: "이미지가 전하는 내용(그림 속 글자 포함)으로 대체 텍스트를 고쳐요.",
  empty_alt: "꾸밈 이미지는 alt=\"\"로 비워요.",
  rewrite_link: "링크 문구에 목적지를 넣거나 aria-label로 목적을 밝혀요.",
  unique_title: "\"화면 이름 | 사이트 이름\" 형식으로 화면마다 다른 제목을 써요.",
  add_caption: "표 내용을 설명하는 caption을 넣어요.",
  add_pause: "자동 전환 영역에 정지·이전·다음 버튼을 둬요.",
  add_captcha_alt: "음성 등 보안문자 대체 수단을 제공해요.",
  add_captions: "자막이나 대본을 제공해요.",
  none: "",
} as const;
export type AiSuggestionCode = keyof typeof AI_SUGGESTION_CODES;

export function isReasonCode(x: unknown): x is AiReasonCode {
  return typeof x === "string" && x in AI_REASON_CODES;
}
export function isSuggestionCode(x: unknown): x is AiSuggestionCode {
  return typeof x === "string" && x in AI_SUGGESTION_CODES;
}

/** 길이 제한 (글자) */
export const LIMIT = { aiEvidence: 60, aiNote: 90, cardLine: 160, title: 45 } as const;

const FILLER = /^(?:또한|그리고|따라서|그러므로|하지만|다만|참고로|결론적으로|전반적으로|즉|특히)[,\s]+/;
const PREFIX = /^(?:\s*(?:참고\([^)]*\)|AI\s*의견\s*\([^)]*\)|AI\s*의견|규칙\s*판정|\[[^\]]{1,20}\])\s*[:：]?\s*)+/;

/**
 * 짧은 한 문장으로 정리: 접두 표시·장황한 접속어·중복 공백·줄바꿈 제거, 첫 문장만, 최대 길이.
 * 잘라야 하면 말줄임표를 붙인다.
 */
export function clip(text: string | null | undefined, max: number): string {
  let s = String(text ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(PREFIX, "").replace(FILLER, "").trim();
  // 첫 문장만 (마침표·물음표·느낌표 + 공백 또는 끝)
  const m = /^(.+?[.!?。])(?:\s|$)/.exec(s);
  if (m && m[1].length >= 8) s = m[1];
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).replace(/[\s,·]+$/, "")}…`;
}

/** AI 판정을 저장할 때의 형식: "[AI:코드] 짧은 근거" */
export function aiStoredReason(code: AiReasonCode, evidence: string): string {
  const ev = clip(evidence, LIMIT.aiEvidence);
  return ev ? `[AI:${code}] ${ev}` : `[AI:${code}]`;
}

export interface ParsedAiReason {
  source: "ai" | "rule" | "none";
  code: AiReasonCode | null;
  /** 내부 자료용 짧은 문장 (코드 문구 + 근거) */
  note: string;
}

/** 저장된 aiReason 을 출처·코드·짧은 문장으로 해석 (이전 버전 자유문장도 정리해서 읽는다) */
export function parseAiReason(raw: string | null | undefined): ParsedAiReason {
  const s = String(raw ?? "").trim();
  if (!s) return { source: "none", code: null, note: "" };
  if (s.startsWith("[규칙 판정]")) return { source: "rule", code: null, note: clip(s.replace(/^\[규칙 판정\]\s*/, "").replace(/\s*\((?:AI\s*)?(?:미사용)\)/g, ""), LIMIT.aiNote) };
  const m = /^\[AI:([a-z_]+)\]\s*(.*)$/.exec(s);
  if (m && isReasonCode(m[1])) {
    const label = AI_REASON_CODES[m[1]];
    return { source: "ai", code: m[1], note: clip(m[2] ? `${label} — ${m[2]}` : label, LIMIT.aiNote) };
  }
  // 이전 버전: AI 자유문장 → 접두 제거 후 짧게
  return { source: "ai", code: null, note: clip(s, LIMIT.aiNote) };
}

/** 보고서 본문에 axe 원문 메시지가 그대로 나가지 않게: 번역투 원문을 규칙 문구로 바꾸고 측정값만 남긴다 */
export function reportActual(ruleId: string, message: string, fallbackTitle: string): string {
  const [head, detail = ""] = message.split(" — ");
  const axeLike = /엘리먼트|반드시|요소는 .*해야 해요|Ensure|must have/i.test(message);
  if (!axeLike) return clip(message, LIMIT.cardLine);
  const ratio = /(\d+(?:\.\d+)?:1)/.exec(message)?.[1];
  if (ruleId === "color-contrast" || /명도 대비|명암비/.test(message)) return ratio ? `글자와 배경의 명암비가 ${ratio}로 측정되었어요 (기준 4.5:1).` : "글자와 배경의 명암비가 기준(4.5:1)보다 낮은 것으로 측정되었어요.";
  const facts = clip(detail.replace(/엘리먼트/g, "요소"), 80);
  return clip(`${fallbackTitle}${facts && !/반드시/.test(facts) ? ` (${facts})` : ""}`, LIMIT.cardLine) || clip(head, LIMIT.cardLine);
}
