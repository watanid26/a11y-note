// JIS X 8341-3:2016 (= WCAG 2.0, ISO/IEC 40500:2012) 레벨 A·AA 달성기준 38개.
// 일본 공공기관은 "みんなの公共サイト運用ガイドライン"에 따라 AA 준거 시험을 매년 실시·공개한다.
// 항목 코드 = 달성기준 번호. 서류는 WAIC 예시를 따른 "達成基準チェックリスト" 형식으로 낸다.

import type { PackItem } from "./types";

type Row = [code: string, title: string, level: "A" | "AA", method: PackItem["method"], applies?: PackItem["applies"]];
// 2.4.6 見出し及びラベル: 見出し・ラベルが内容を説明しているかは自動で判定できない (P0-8 で追加)
const NEEDS_HUMAN = new Set(["1.3.2", "1.4.5", "2.4.3", "2.4.6", "3.2.3", "3.3.1", "3.3.3"]);

const ROWS: Row[] = [
  ["1.1.1", "非テキストコンテンツ", "A", "ai", "images"],
  ["1.2.1", "音声のみ及び映像のみ（収録済み）", "A", "manual", "media"],
  ["1.2.2", "キャプション（収録済み）", "A", "ai", "media"],
  ["1.2.3", "音声解説、又はメディアに対する代替（収録済み）", "A", "manual", "media"],
  ["1.2.4", "キャプション（ライブ）", "AA", "manual", "media"],
  ["1.2.5", "音声解説（収録済み）", "AA", "manual", "media"],
  ["1.3.1", "情報及び関係性", "A", "auto"],
  ["1.3.2", "意味のある順序", "A", "ai"],
  ["1.3.3", "感覚的な特徴", "A", "manual"],
  ["1.4.1", "色の使用", "A", "manual"],
  ["1.4.2", "音声の制御", "A", "auto", "media"],
  ["1.4.3", "コントラスト（最低限レベル）", "AA", "auto"],
  ["1.4.4", "テキストのサイズ変更", "AA", "manual"],
  ["1.4.5", "文字画像", "AA", "ai", "images"],
  ["2.1.1", "キーボード", "A", "auto"],
  ["2.1.2", "キーボードトラップなし", "A", "auto"],
  ["2.2.1", "タイミング調整可能", "A", "ai", "timeLimitHint"],
  ["2.2.2", "一時停止、停止及び非表示", "A", "ai", "carousels"],
  ["2.3.1", "3回のせん（閃）光、又は閾値以下", "A", "manual"],
  ["2.4.1", "ブロックスキップ", "A", "auto"],
  ["2.4.2", "ページタイトル", "A", "ai"],
  ["2.4.3", "フォーカス順序", "A", "ai"],
  ["2.4.4", "リンクの目的（コンテキスト内）", "A", "ai"],
  ["2.4.5", "複数の手段", "AA", "manual"],
  ["2.4.6", "見出し及びラベル", "AA", "ai"],
  ["2.4.7", "フォーカスの可視化", "AA", "auto"],
  ["3.1.1", "ページの言語", "A", "auto"],
  ["3.1.2", "一部分の言語", "AA", "manual"],
  ["3.2.1", "フォーカス時", "A", "manual"],
  ["3.2.2", "入力時", "A", "manual"],
  ["3.2.3", "一貫したナビゲーション", "AA", "ai"],
  ["3.2.4", "一貫した識別性", "AA", "manual"],
  ["3.3.1", "エラーの特定", "A", "ai", "forms"],
  ["3.3.2", "ラベル又は説明", "A", "auto", "inputs"],
  ["3.3.3", "エラー修正の提案", "AA", "ai", "forms"],
  ["3.3.4", "エラー回避（法的、金融、データ）", "AA", "manual", "forms"],
  ["4.1.1", "構文解析", "A", "auto"],
  ["4.1.2", "名前（name）、役割（role）及び値（value）", "A", "auto"],
];

export const JIS2016_ITEMS: PackItem[] = ROWS.map(([code, title, level, method, applies]) => ({
  code,
  title,
  level,
  method,
  applies,
  needsHuman: NEEDS_HUMAN.has(code),
  principle: { "1": "知覚可能", "2": "操作可能", "3": "理解可能", "4": "堅牢" }[code[0]] ?? "",
  wcag: [code],
  how: method === "auto" ? "自動チェックで判定" : method === "ai" ? "AIが下書き判定、人が確認" : "人による確認",
  fix: "",
}));

/** 자체 규칙 → 달성기준. axe 규칙은 결과에 붙은 WCAG 번호로 바로 연결된다. */
export const JIS2016_RULE_MAP: Record<string, string> = {
  "kr-skip-link": "2.4.1", "kr-generic-link": "2.4.4", "kr-autoplay": "1.4.2", "kr-table-caption": "1.3.1",
  "kr-carousel-stop": "2.2.2", "kr-captcha": "1.1.1", "kr-focus-indicator": "2.4.7", "kr-keyboard-trap": "2.1.2",
  "kr-meta-refresh": "2.2.1", "kr-click-only": "2.1.1", "kr-focus-order": "2.4.3",
  // 한국 고유 기준(새 창 안내, 컨트롤 크기)은 JIS AA 에 없으므로 연결하지 않는다.
  "label": "3.3.2", "select-name": "3.3.2",
  // axe-core 4.14 で duplicate-id が廃止されたため自前の確認を 4.1.1 に連結
  "kr-duplicate-id": "4.1.1", "duplicate-id-aria": "4.1.1",
  // 見出しの空・構造の手がかりは 2.4.6 の確認材料として提示 (判定は試験者)
  "empty-heading": "2.4.6", "heading-order": "2.4.6", "page-has-heading-one": "2.4.6",
  "ai-image": "1.1.1", "ai-link": "2.4.4", "ai-title": "2.4.2", "ai-table": "1.3.1", "ai-carousel": "2.2.2", "ai-captcha": "1.1.1", "ai-media": "1.2.2",
};
