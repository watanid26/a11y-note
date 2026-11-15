// 화면 언어. 언어가 점검 기준도 정한다: 한국어 = KWCAG 2.2, 日本語 = JIS X 8341-3:2016.
// 쿠키 "lang" 에 저장한다 (로그인과 무관, 필수 쿠키).
import { cookies } from "next/headers";

export type Lang = "ko" | "ja";
export const LANG_COOKIE = "lang";

export function getLang(): Lang {
  try {
    return cookies().get(LANG_COOKIE)?.value === "ja" ? "ja" : "ko";
  } catch {
    return "ko";
  }
}

export function packForLang(lang: Lang): "kwcag22" | "jis2016" {
  return lang === "ja" ? "jis2016" : "kwcag22";
}
