// 점검해야 할 "흐름"(여러 화면을 거치는 업무) 찾기와 길 안내 문구.
// 1) 메뉴·폼을 보고 규칙으로 찾고, 2) AI 키가 있으면 AI 가 다듬는다 (src/lib/ai/flows.ts).
// 자동으로 끝낼 수 있는 흐름(검색, 빈 칸 제출 오류 확인)은 워커가 먼저 시도하고,
// 나머지는 사람이 크롬 확장으로 한 번 녹화한다.

import type { PageOutline } from "../core/types";

export type FlowKind = "search" | "login" | "signup" | "apply" | "reserve" | "contact" | "order" | "mypage";

export interface FlowSuggestion {
  kind: FlowKind;
  name: string;
  startUrl: string | null;
  guide: string;
  stopBefore: string | null;
  /** 워커가 자동으로 시도할 수 있는 흐름인지 */
  autoTry: boolean;
}

const RULES: { kind: FlowKind; re: RegExp; name: string; guide: string; stopBefore: string | null; autoTry: boolean }[] = [
  { kind: "search", re: /통합\s?검색|검색|search|検索/i, name: "검색 결과 화면",
    guide: "검색창에 아무 단어나 넣고 검색해 결과 화면까지 보여 주세요.", stopBefore: null, autoTry: true },
  { kind: "login", re: /로그인|login|sign\s?in|ログイン/i, name: "로그인 후 화면",
    guide: "확장 프로그램을 켠 크롬에서 테스트 계정으로 로그인한 뒤, 마이페이지 같은 로그인 후 첫 화면까지 이동해 주세요. 비밀번호는 저장되지 않습니다.",
    stopBefore: null, autoTry: false },
  { kind: "signup", re: /회원\s?가입|join|sign\s?up|register|会員登録/i, name: "회원가입 입력 화면",
    guide: "약관 동의 → 정보 입력 화면까지 진행해 주세요. 빈 칸으로 '다음'을 한 번 눌러 오류 안내도 보여 주세요.",
    stopBefore: "가입 완료·가입하기 버튼", autoTry: true },
  { kind: "apply", re: /민원|신청|접수|apply|申請/i, name: "신청서 작성·오류 안내",
    guide: "신청서 작성 화면까지 이동한 뒤, 빈 칸으로 '신청' 버튼을 눌러 오류 안내가 나오는 화면까지 보여 주세요.",
    stopBefore: "최종 신청·접수 완료 버튼 (빈 칸 제출은 괜찮음)", autoTry: true },
  { kind: "reserve", re: /예약|reserv|booking|予約/i, name: "예약 단계별 화면",
    guide: "예약할 대상을 고르고 '다음'을 누르며 단계마다 화면을 보여 주세요. 마지막 확인 화면 직전에서 멈춰 주세요.",
    stopBefore: "예약 확정·결제 버튼", autoTry: false },
  { kind: "contact", re: /문의|상담|고객\s?센터|contact|問い合わせ|お問合せ/i, name: "문의 작성·오류 안내",
    guide: "문의 작성 화면에서 빈 칸으로 '등록'을 눌러 오류 안내 화면까지 보여 주세요.",
    stopBefore: "실제 등록 (내용을 채운 뒤 제출)", autoTry: true },
  { kind: "order", re: /장바구니|주문|구매|cart|order|カート|購入/i, name: "장바구니→주문서",
    guide: "상품 하나를 장바구니에 담고 주문서 작성 화면까지 이동해 주세요.",
    stopBefore: "결제·주문 완료 버튼", autoTry: false },
  { kind: "mypage", re: /마이\s?페이지|my\s?page|マイページ/i, name: "마이페이지",
    guide: "로그인한 상태에서 마이페이지 주요 메뉴를 차례로 열어 주세요.",
    stopBefore: "회원 탈퇴·정보 삭제", autoTry: false },
];

/** 규칙으로 만든 흐름 안내의 일본어 (저장된 한국어 문구와 같을 때만 바꿔 보여 준다) */
const RULES_JA: Record<FlowKind, { name: string; guide: string; stopBefore: string | null }> = {
  search: { name: "検索結果の画面", guide: "検索欄に何か言葉を入れて検索し、結果の画面まで表示してください。", stopBefore: null },
  login: { name: "ログイン後の画面", guide: "拡張機能を入れたChromeでテスト用アカウントにログインし、マイページなどログイン後の最初の画面まで移動してください。パスワードは保存されません。", stopBefore: null },
  signup: { name: "会員登録の入力画面", guide: "規約への同意から情報の入力画面まで進めてください。空欄のまま「次へ」を一度押し、エラーの案内も表示してください。", stopBefore: "登録完了・登録するボタン" },
  apply: { name: "申請書の作成・エラーの案内", guide: "申請書の作成画面まで移動し、空欄のまま「申請」を押してエラーの案内が出る画面まで表示してください。", stopBefore: "最終の申請・受付完了ボタン（空欄での送信は問題ありません）" },
  reserve: { name: "予約の各ステップの画面", guide: "予約する対象を選び、「次へ」を押しながら各ステップの画面を表示してください。最後の確認画面の手前で止めてください。", stopBefore: "予約確定・決済ボタン" },
  contact: { name: "お問い合わせの作成・エラーの案内", guide: "お問い合わせの作成画面で空欄のまま「送信」を押し、エラーの案内の画面まで表示してください。", stopBefore: "実際の送信（内容を入れたうえでの送信）" },
  order: { name: "カートから注文画面まで", guide: "商品を一つカートに入れ、注文情報の入力画面まで移動してください。", stopBefore: "決済・注文完了ボタン" },
  mypage: { name: "マイページ", guide: "ログインした状態で、マイページの主なメニューを順に開いてください。", stopBefore: "退会・情報の削除" },
};

export function flowText(f: { kind: string; name: string; guide: string | null; stopBefore: string | null }, ja: boolean) {
  const rule = RULES.find((r) => r.kind === f.kind);
  const jp = RULES_JA[f.kind as FlowKind];
  if (!ja || !rule || !jp) return { name: f.name, guide: f.guide, stopBefore: f.stopBefore };
  return {
    name: f.name === rule.name ? jp.name : f.name,
    guide: f.guide === rule.guide ? jp.guide : f.guide,
    stopBefore: f.stopBefore === rule.stopBefore ? jp.stopBefore : f.stopBefore,
  };
}

// 예전 회차에는 "검사"로 저장된 이름이 남아 있어 둘 다 받는다
const SCAN_LABEL_JA: Record<string, string> = { "자동 점검": "自動チェック", "자동 검사": "自動チェック", "재점검": "再点検", "다시 검사": "再点検", "확장 점검": "拡張機能での点検", "확장 검사": "拡張機能での点検", "파일 업로드": "ファイルのアップロード" };
const PLAN_NAME_JA: Record<string, string> = { "기본 한도": "基本枠", "확장 한도": "拡張枠", "대용량 한도": "大容量枠" };
const SCAN_LABEL_KO: Record<string, string> = { "자동 검사": "자동 점검", "다시 검사": "재점검", "확장 검사": "확장 프로그램 점검", "확장 점검": "확장 프로그램 점검" };
export const scanLabelText = (label: string, ja: boolean) => (ja ? SCAN_LABEL_JA[label] : SCAN_LABEL_KO[label]) ?? label;
export const planNameText = (name: string, ja: boolean) => (ja ? PLAN_NAME_JA[name] ?? name : name);

export function suggestFlows(outlines: PageOutline[], baseUrl: string): FlowSuggestion[] {
  const links = outlines.flatMap((o) => o.navLinks);
  const forms = outlines.flatMap((o) => o.forms);
  const out: FlowSuggestion[] = [];
  for (const r of RULES) {
    const link = links.find((l) => r.re.test(l.text));
    const hasSearch = r.kind === "search" && outlines.some((o) => o.searchInput);
    const hasForm = forms.some((f) => (r.kind === "login" ? f.kind === "login" : r.kind === "signup" ? f.kind === "signup" : false));
    if (!link && !hasSearch && !hasForm) continue;
    out.push({ kind: r.kind, name: r.name, startUrl: link?.href ?? (hasSearch ? baseUrl : null), guide: r.guide, stopBefore: r.stopBefore, autoTry: r.autoTry });
  }
  return out;
}

/** 위험한 버튼인지 (자동 시도·녹화 재생 때 절대 누르지 않음) */
export const DANGER_BUTTON = /결제|구매하기|주문\s?(하기|완료)|예약\s?확정|신청\s?완료|접수\s?완료|탈퇴|삭제|송금|이체|pay|purchase|checkout|place order|delete|remove account|確定|購入|退会|削除/i;

/**
 * 검색 자동 실행이 안전한 폼인지: 실제 <form> 안에 있고, 방식이 GET(또는 미지정)이며, 같은 사이트로 보낼 때만.
 * 폼이 없는 자바스크립트 검색, POST 검색, 다른 사이트로 보내는 검색은 사람이 직접 하도록 넘긴다.
 */
export function isSafeSearchForm(form: { exists: boolean; method: string | null; action: string | null }, pageUrl: string): boolean {
  if (!form.exists) return false;
  const method = (form.method ?? "").trim().toLowerCase();
  if (method && method !== "get") return false;
  let target: URL;
  try {
    target = new URL(form.action && form.action.trim() ? form.action : pageUrl, pageUrl);
  } catch {
    return false;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  return target.origin === new URL(pageUrl).origin;
}
