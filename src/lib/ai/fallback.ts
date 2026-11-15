// AI 키가 없거나 예산을 넘었을 때 쓰는 규칙 기반 판정.
// 확실한 것만 판정하고, 애매하면 "검토 필요"로 사람에게 넘긴다.

import type { Candidate } from "../../core/types";

export interface Verdict {
  result: "pass" | "fail" | "review";
  confidence: number;
  reason: string;
  suggestion: string | null;
}

const MEANINGLESS_ALT = /^(이미지|그림|사진|아이콘|배너\s?\d*|image\d*|img\d*|photo|picture|icon|banner\s?\d*|画像|写真|아이콘\s?이미지|\s*)$/i;
const FILE_ALT = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;
const STOP = /정지|멈춤|일시\s?정지|pause|stop|停止/i;

export function fallbackVerdict(c: Candidate, ctx: { locale: "ko" | "ja"; siblingTitles?: string[] }): Verdict {
  const ja = ctx.locale === "ja";
  switch (c.kind) {
    case "image": {
      const alt = (c.text.alt ?? "").trim();
      if (alt && (FILE_ALT.test(alt) || MEANINGLESS_ALT.test(alt))) {
        return { result: "fail", confidence: 0.9, reason: ja ? `代替テキスト「${alt}」は画像の内容を説明していません。` : `대체 텍스트 "${alt}" 는 이미지 내용을 설명하지 못합니다 (파일명·일반 단어).`, suggestion: ja ? "画像が伝える内容を代替テキストにしてください。" : "이미지가 전달하는 내용(글자, 의미)을 대체 텍스트로 적어 주세요." };
      }
      if (!alt) return { result: "review", confidence: 0.4, reason: ja ? "alt=\"\"（装飾画像）として扱ってよいか確認が必要です。" : "alt=\"\" 로 꾸밈 처리된 큰 이미지입니다. 정보가 없는 이미지인지 확인이 필요합니다.", suggestion: null };
      return { result: "review", confidence: 0.5, reason: ja ? "代替テキストが画像の内容と一致するか確認が必要です。" : "대체 텍스트가 이미지와 맞는지 사람이 확인해야 합니다 (AI 미사용).", suggestion: null };
    }
    case "link":
      return { result: "review", confidence: 0.5, reason: ja ? "周囲の文脈でリンクの目的が分かるか確認が必要です。" : `"${c.text.name}" 링크의 목적이 주변 문맥으로 드러나는지 확인이 필요합니다.`, suggestion: ja ? null : `예: "${(c.text.context ?? "").slice(0, 20)} 더보기" 처럼 목적을 포함하거나 aria-label 을 추가하세요.` };
    case "title": {
      const title = (c.text.title ?? "").trim();
      if (!title) return { result: "fail", confidence: 0.95, reason: ja ? "ページタイトルがありません。" : "페이지 제목(title)이 비어 있습니다.", suggestion: ja ? null : "\"페이지 이름 | 사이트 이름\" 형식으로 제목을 넣어 주세요." };
      const dup = (ctx.siblingTitles ?? []).filter((t) => t === title).length > 1;
      if (dup) return { result: "fail", confidence: 0.8, reason: ja ? "複数のページで同じタイトルです。" : "여러 페이지가 같은 제목을 씁니다. 페이지마다 고유한 제목이 필요합니다.", suggestion: null };
      const h1 = (c.text.h1 ?? "").trim();
      if (h1 && title.includes(h1.slice(0, 6))) return { result: "pass", confidence: 0.85, reason: ja ? "タイトルが見出しと一致します。" : "제목이 페이지 대표 제목(h1)을 포함합니다.", suggestion: null };
      return { result: "review", confidence: 0.5, reason: ja ? "タイトルが内容を表しているか確認が必要です。" : "제목이 페이지 내용을 설명하는지 확인이 필요합니다.", suggestion: null };
    }
    case "table": {
      const cap = (c.text.caption ?? "").trim();
      if (cap.length < 2) return { result: "fail", confidence: 0.85, reason: ja ? "表のキャプションが短すぎます。" : "표 캡션이 너무 짧습니다.", suggestion: null };
      return { result: "pass", confidence: 0.8, reason: ja ? "表にキャプションがあります。" : `표 캡션 "${cap}" 이 있습니다.`, suggestion: null };
    }
    case "carousel":
      return STOP.test(c.text.controls ?? "")
        ? { result: "pass", confidence: 0.8, reason: ja ? "停止ボタンがあります。" : "정지 버튼이 있습니다.", suggestion: null }
        : { result: "review", confidence: 0.5, reason: ja ? "自動で切り替わるか、停止できるか確認が必要です。" : "자동으로 넘어가는지, 정지할 수 있는지 확인이 필요합니다.", suggestion: ja ? null : "슬라이드에 정지·이전·다음 버튼을 넣으세요." };
    case "captcha":
      return { result: "review", confidence: 0.4, reason: ja ? "代替手段があるか確認が必要です。" : "음성 캡차 등 대체 수단이 있는지 확인이 필요합니다.", suggestion: null };
    case "media":
      return /captions|subtitles/.test(c.text.tracks ?? "")
        ? { result: "pass", confidence: 0.8, reason: ja ? "字幕トラックがあります。" : "자막 트랙이 있습니다.", suggestion: null }
        : { result: "review", confidence: 0.5, reason: ja ? "字幕・原稿があるか確認が必要です。" : "자막이나 대본이 있는지 확인이 필요합니다.", suggestion: null };
    default:
      return { result: "review", confidence: 0, reason: "", suggestion: null };
  }
}
