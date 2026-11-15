// 앱 화면(클라이언트) 문구의 언어. 결과 화면은 점검 기준의 언어(view.locale)를 따른다.
// 한 페이지 안에서는 언어가 하나라서 모듈 값 하나로 충분하다. 화면 최상위에서 setUiLang 을 먼저 부른다.
let ja = false;

export function setUiLang(lang: string | null | undefined) {
  ja = lang === "ja";
}

export function isJa(): boolean {
  return ja;
}

/** 한국어, 일본어 문구 중 지금 언어에 맞는 것 */
export function t(ko: string, jp: string): string {
  return ja ? jp : ko;
}
