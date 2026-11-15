// 점검표 엑셀 — 기관 담당자·QA 담당자가 쓰는 공식 점검표 형식.
//  1) 자체진단 점검표 (JIS: 達成基準チェックリスト): 항목별 "자동 결과"와 "점검자 판정"을 따로 적는다
//  2) 오류 목록: 위치 한 곳당 한 줄. 담당자·처리 상태를 적어 수정 관리에 쓴다
//  3) 점검 범위: 화면별 주소·선정 이유·점검 방식
//  4) AI 검수: 자동 점검 결과를 AI 가 다시 본 기록 (있을 때만). 자동 결과 · AI 검증 · 점검자 판정을 열로 나눈다
//  5) 기준 외 참고: 검사항목에 연결되지 않은 자동 결과 (있을 때만). 판정에 반영하지 않는다
//  6) 자동 점검 통과·해당 없음: axe 가 통과·해당 없음으로 낸 규칙 (있을 때만). 항목 적합 판정이 아니다
//  7) 수동·보조기술·사용자 평가: 사람이 남긴 평가 기록 이력 (있을 때만). 정정된 이전 기록도 "이전 판"으로 남긴다
// 색은 보조 수단이고, 모든 판정은 글자로 적는다 (범례 포함).

import ExcelJS from "exceljs";
import { referenceRules, ruleOutcomeSummary, type ScanView } from "../scan-view";
import { currentEvaluations, EVAL_KIND_LABEL, EVAL_RESULT_LABEL, maskAccount, SEVERITY_LABEL } from "../manual-eval";
import { environmentText } from "../evidence";
import { BRANCH_STATUS_LABEL, currentBranches } from "../flow-branch";
import { reproLines } from "./repro";
import { NOT_CERT_JA, NOT_CERT_KO, TOOL_NAME, dateKst, docStatus, draftInputText, scopeGate, scopeInfo, scopeLines, submissionInfo, summary, summaryLine } from "./data";
import { AUTO_LABEL, HUMAN_LABEL, METRIC_TITLE, ROUTE_LABEL, STATE_LABEL, VERIFICATION_LABEL, aiAudit, aiSummaryText, byPriority, causeText, issueRecords, itemRows, metricLine, reportMetrics, reviewFootnote, verificationRows, type AutoResult, type HumanVerdict, type IssueState } from "./model";
import { PLAIN_LABEL, improvementPlan, numbered, plainGuide } from "./plain-guide";
import { REPORT_TEMPLATE_VERSION } from "./version";
import { confidenceLabel, type ToolVerdict } from "../../core/verdict";

const AUTO_FILL: Record<AutoResult, string> = { signal: "FFFCE4E4", review: "FFFDF1D6", clear: "FFEAF5EE", absent: "FFF2F2F2", untested: "FFFFFFFF" };
const HUMAN_FILL: Record<HumanVerdict, string> = { pass: "FFD9F0E1", fail: "FFF9D3D3", na: "FFE9E9E9", undecided: "FFFFFFFF", untested: "FFFFFFFF" };
const STATE_FILL: Record<IssueState, string> = { confirmed_fail: "FFF9D3D3", auto_fail: "FFFCE4E4", review: "FFFDF1D6" };
const THIN = { style: "thin" as const, color: { argb: "FFB8BEC9" } };

const L = {
  ko: {
    sheet1: "자체진단 점검표",
    title: (std: string) => `웹 접근성 자체진단 점검표 (${std})`,
    std: "한국형 웹 콘텐츠 접근성 지침(KWCAG) 2.2",
    info: ["사이트명", "점검 주소", "점검일", "문서 상태", "대상 기관명", "점검 수행 기관·담당팀", "점검 환경", "점검자", "점검 도구"],
    legendTitle: "읽는 법",
    legend: [
      ["자동 결과", "오류 = 자동 규칙이 기준에 어긋난 곳을 찾음 · 오류 없음 = 자동 규칙에서 오류가 나오지 않음 · 오류 의심 = 자동 규칙만으로 결론이 안 나 점검노트가 판정에 반영 · 해당 요소 없음 = 점검한 페이지에 그 요소가 없음 · 미점검 = 실제로 점검하지 못한 범위"],
      ["점검노트 판정", "모든 항목에 점검노트가 내린 적합 · 부적합 · 해당 없음 판정과 근거 · 확신도예요. 자동 규칙으로 결론이 나지 않은 항목은 AI가 캡처와 자동 결과를 보고 판정하고, AI를 쓸 수 없으면 해소되지 않은 오류 의심이 있는 항목을 부적합으로 봐요."],
      ["점검자 판정", "점검자가 점검노트 판정을 검토해 고치거나 승인한 결과예요. \"미검토\"면 점검노트 판정이 최종이에요."],
      ["우선순위", "위치 수가 아니라 사용자 영향으로 정해요. 1순위 = 기능 차단, 2순위 = 이용 불편, 3순위 = 개선 권장, 판정 반영 = 오류 의심. 여러 화면에 반복되는 공통 요소는 \"원인 1곳\"으로 세요."],
      ["색", "색은 보조 표시예요. 모든 결과는 글자로 적혀 있어요 (빨강 계열 = 오류·부적합, 노랑 = 오류 의심, 초록 = 오류 없음·적합, 회색 = 해당 없음)."],
    ],
    cols: ["번호", "기준 코드", "원칙·지침", "검사항목", "적용 여부", "점검 방법", "자동 결과", "점검노트 판정", "점검자 판정", "오류 수\n(유형·위치)", "근거 ID", "비고"],
    widths: [6, 9, 14, 24, 14, 14, 12, 22, 12, 11, 16, 40],
    count: (k: number, n: number) => (k ? `${k}건 · ${n}곳` : ""),
    sheet2: "오류 목록",
    cols2: ["오류 ID", "위치", "우선순위", "원인·영향", "판정 상태", "기준 코드", "오류 요약", "화면명", "전체 URL", "선택자", "실제 결과", "기대 결과", "재현 방법", "수정 방향", "캡처·증거 ID", "담당자", "처리 상태", "수정 완료 조건"],
    widths2: [8, 6, 12, 18, 14, 8, 26, 14, 34, 28, 34, 28, 30, 34, 13, 9, 10, 30],
    statusList: '"미처리,수정 중,수정 완료,재점검 확인,오류 아님"',
    open: "미처리",
    openReview: "확인 대기",
    repro: (how: string) => `1) 전체 URL 의 화면을 연다\n2) 개발자 도구에서 선택자로 요소를 찾는다\n3) ${how}`,
    sheet3: "점검 범위",
    cols3: ["캡처 ID", "화면명", "점검 URL", "선정 이유", "로그인 상태", "점검 시각", "점검 방식 (브라우저·OS)", "비고"],
    widths3: [9, 18, 44, 26, 24, 18, 30, 30],
    login: (ext: boolean) => (ext ? "점검자 브라우저 상태 그대로 (로그인된 상태일 수 있음)" : "로그인하지 않은 상태"),
    loginNote: (reason: string, ext: boolean) =>
      /로그인/.test(reason) && !ext ? "로그인 기능이 있는 화면을 로그인하지 않은 상태로 점검 (로그인 후 화면은 점검하지 않음)" : "",
    how: (ext: boolean) => (ext ? "점검자의 크롬 (크롬 확장, 사용자 기기 OS)" : "서버 Chromium 자동 브라우저 (Linux)"),
    noIssues: "자동 점검에서 오류나 오류 의심 위치가 나오지 않았어요.",
    sheet4: "AI 검수",
    verifyNote: "자동 점검 결과(axe-core·자체 규칙)를 AI가 다시 검수한 기록이에요. 자동 결과와 점검자 판정은 바꾸지 않으며, AI가 반박해도 적합으로 처리하지 않고 사람 확인으로 보내요. 이미지·링크·제목·표의 의미 판단(AI 보조 판단)은 이 시트가 아니라 '오류 목록'에 따로 표시해요.",
    cols4: ["오류 ID", "기준 코드", "규칙 ID", "화면명", "선택자", "1차 자동 결과", "2차 AI 검증", "AI 신뢰도", "AI 관찰 근거", "처리", "3차 점검자 판정", "모델", "프롬프트", "검수 시각", "입력 해시"],
    widths4: [8, 8, 20, 14, 26, 11, 12, 8, 34, 18, 12, 20, 8, 17, 13],
    autoWord: { fail: "오류", review: "오류 의심", pass: "오류 없음" } as Record<string, string>,
    humanWord: { fail: "부적합(확정)", pass: "오류 아님(확정)" } as Record<string, string>,
    undecided: "미검토",
    sheet5: "기준 외 참고",
    refNote: "점검 기준의 어느 검사항목에도 연결되지 않은 자동 점검 결과예요. 판정에 반영하지 않는 참고 결과이며, 항목 상태·오류 수·회차 비교에 넣지 않아요. WCAG 열은 점검 도구(axe-core)가 붙인 표기 그대로이고 KWCAG 항목 연결이 아니에요.",
    cols5: ["규칙 ID", "WCAG(도구 표기)", "도구 결과", "규칙 설명", "요소 수", "화면명", "전체 URL", "선택자", "도구 메시지"],
    widths5: [22, 16, 12, 34, 8, 16, 34, 28, 40],
    refOutcome: { violation: "위반", incomplete: "확인 필요" } as Record<string, string>,
    sheet6: "자동 점검 통과·해당 없음",
    passNote: (n: number) => `점검 도구(axe-core)가 규칙 단위로 "통과" 또는 "해당 요소 없음"으로 낸 결과예요 (원본 보존, 기록된 페이지 ${n}개). 자동 규칙이 문제를 찾지 못했다는 뜻일 뿐 검사항목 적합 판정이 아니며, 점검자 확인을 대신하지 않아요.`,
    cols6: ["규칙 ID", "규칙 설명", "WCAG·태그(도구 표기)", "통과 화면 수", "해당 요소 없음 화면 수"],
    widths6: [26, 44, 30, 12, 14],
    sheet7: "수동·보조기술·사용자 평가",
    evalNote: "점검자가 직접 남긴 수동 점검·보조기술 점검·장애인 사용자 평가 기록이에요. 이 기록은 항목 상태를 자동으로 바꾸지 않으며, 최종 판정은 '자체진단 점검표'의 점검자 판정 열만 봐요. 정정된 기록은 지우지 않고 '이전 판'으로 남겨요. 참여자는 가명 코드와 특성만 적어요.",
    cols7: ["기록 ID", "판", "종류", "기준 코드", "화면명", "과업", "방법", "보조기술·버전", "브라우저·버전", "OS·기기", "참여자 (가명·특성)", "결과", "심각도", "조작 순서", "메모", "점검자", "수행 시각", "고친 기록"],
    widths7: [10, 8, 14, 8, 14, 24, 18, 16, 16, 16, 20, 12, 12, 34, 34, 18, 17, 10],
    latest: "최신",
    old: "이전 판",
    sheet8: "흐름 분기",
    branchNote: "업무 흐름의 기본 경로 외에 꼭 확인할 분기(오류·취소·다른 선택 등)이에요 (WCAG-EM 완전한 과정). 상태는 점검자가 남긴 기록이며 항목 판정을 바꾸지 않아요. 바뀐 기록은 '이전 판'으로 남겨요.",
    cols8: ["흐름", "분기", "갈라지는 단계", "조건", "기대 결과", "상태", "확인한 화면", "메모", "판"],
    widths8: [18, 22, 10, 30, 30, 12, 18, 30, 8],
    notCert: NOT_CERT_KO,
  },
  ja: {
    sheet1: "達成基準チェックリスト",
    title: (std: string) => `${std} 達成基準チェックリスト`,
    std: "JIS X 8341-3:2016",
    info: ["対象", "URL", "試験日", "文書の状態", "顧客・機関名", "試験実施機関・担当チーム", "試験環境", "試験者", "試験ツール"],
    legendTitle: "凡例",
    legend: [
      ["自動チェック結果", "違反の兆候 = 自動チェックで違反の可能性を検出 ・ 問題未検出 = 自動チェックでは問題が見つからない（適合の確定ではない）・ 要確認 = 人の確認が必要 ・ 該当要素なし = 試験したページに該当要素がない ・ 試験不可 = 試験したページがない"],
      ["試験者判定", "適合・不適合・適用なし = 試験者が確定した結果 ・ 未試験 = 試験者がまだ確定していない。最終結果はこの列のみ。"],
      ["色", "色は補助表示です。すべての結果は文字で記載しています。"],
    ],
    cols: ["No.", "達成基準", "原則", "達成基準名", "適合レベル", "適用", "試験方法", "自動チェック結果", "a11ynote判定", "試験者判定", "問題数\n（種類・箇所）", "根拠ID", "注記"],
    widths: [5, 9, 12, 26, 8, 14, 14, 12, 22, 11, 11, 16, 38],
    count: (k: number, n: number) => (k ? `${k}件・${n}箇所` : ""),
    sheet2: "問題一覧",
    cols2: ["問題ID", "箇所", "優先度", "原因・影響", "判定の状態", "達成基準", "問題の要約", "ページ名", "URL", "セレクタ", "実際の結果", "期待される結果", "再現手順", "修正の方向", "キャプチャ・根拠ID", "担当者", "対応状況", "修正完了の条件"],
    widths2: [8, 6, 10, 18, 14, 8, 26, 14, 34, 28, 34, 28, 30, 34, 13, 9, 10, 30],
    statusList: '"未対応,対応中,修正済み,再試験で確認,問題なし"',
    open: "未対応",
    openReview: "確認待ち",
    repro: (how: string) => `1) URLのページを開く\n2) 開発者ツールでセレクタの要素を探す\n3) ${how}`,
    sheet3: "試験対象ページ一覧",
    cols3: ["キャプチャID", "ページタイトル", "URL", "選定理由", "ログイン状態", "試験日時", "試験環境（ブラウザ・OS）", "備考"],
    widths3: [10, 18, 44, 26, 24, 18, 30, 30],
    loginNote: (reason: string, ext: boolean) => (/ログイン|로그인/.test(reason) && !ext ? "ログイン機能のあるページを未ログイン状態で試験（ログイン後のページは未試験）" : ""),
    login: (ext: boolean) => (ext ? "試験者のブラウザの状態のまま（ログイン後の画面を含む場合あり）" : "ログインなし（公開ページ）"),
    how: (ext: boolean) => (ext ? "試験者の Chrome（拡張機能、利用者端末のOS）" : "サーバーの Chromium 自動ブラウザ（Linux）"),
    noIssues: "自動チェックで問題の兆候や確認箇所は検出されませんでした。",
    sheet4: "AI検証",
    verifyNote: "自動チェック（axe-core・独自ルール）の結果をAIが再検査した記録です。自動結果と試験者判定は変更せず、AIが反論しても適合とせず試験者の確認に回します。画像・リンク・タイトル・表の意味判断（AI補助判断）は「問題一覧」に別に表示します。",
    cols4: ["問題ID", "達成基準", "ルールID", "ページ名", "セレクタ", "1次 自動結果", "2次 AI検証", "AI信頼度", "AIの観察根拠", "対応", "3次 試験者判定", "モデル", "プロンプト", "検査日時", "入力ハッシュ"],
    widths4: [8, 8, 20, 14, 26, 11, 12, 8, 34, 18, 12, 20, 8, 17, 13],
    autoWord: { fail: "違反の兆候", review: "要確認", pass: "問題未検出" } as Record<string, string>,
    humanWord: { fail: "不適合（確定）", pass: "問題なし（確定）" } as Record<string, string>,
    undecided: "未確定",
    sheet5: "基準外参考",
    refNote: "試験の基準のどの達成基準にも対応付けられていない自動チェック結果です。判定に反映しない参考結果であり、達成基準の状態・問題数・回次比較には含めません。WCAG列は検査ツール（axe-core）の表記そのままで、JIS の達成基準への対応付けではありません。",
    cols5: ["ルールID", "WCAG（ツール表記）", "ツールの結果", "ルールの説明", "要素数", "ページ名", "URL", "セレクタ", "ツールのメッセージ"],
    widths5: [22, 16, 12, 34, 8, 16, 34, 28, 40],
    refOutcome: { violation: "違反", incomplete: "要確認" } as Record<string, string>,
    sheet6: "自動チェック合格・該当なし",
    passNote: (n: number) => `検査ツール（axe-core）がルール単位で「合格」または「該当要素なし」とした結果です（原本保存、記録ページ ${n}件）。自動ルールで問題が見つからなかったことを示すだけで、達成基準の適合判定ではなく、試験者の確認に代わるものではありません。`,
    cols6: ["ルールID", "ルールの説明", "WCAG・タグ（ツール表記）", "合格ページ数", "該当要素なしページ数"],
    widths6: [26, 44, 30, 12, 14],
    sheet7: "手動・支援技術・利用者評価",
    evalNote: "試験者が記録した手動試験・支援技術による試験・障害のある利用者による評価の記録です。達成基準の状態は自動では変わらず、最終結果は「達成基準チェックリスト」の試験者判定列のみです。訂正された記録は削除せず「旧版」として残します。参加者は仮名コードと特性のみ記載します。",
    cols7: ["記録ID", "版", "種類", "達成基準", "ページ名", "タスク", "方法", "支援技術・バージョン", "ブラウザ・バージョン", "OS・機器", "参加者（仮名・特性）", "結果", "重大度", "操作手順", "メモ", "試験者", "実施日時", "訂正元"],
    widths7: [10, 8, 14, 8, 14, 24, 18, 16, 16, 16, 20, 12, 12, 34, 34, 18, 17, 10],
    latest: "最新",
    old: "旧版",
    sheet8: "フローの分岐",
    branchNote: "業務フローの基本経路以外に確認すべき分岐（エラー・取消・別の選択など）です（WCAG-EM の完全なプロセス）。状態は試験者の記録であり、達成基準の判定は変えません。変更された記録は「旧版」として残します。",
    cols8: ["フロー", "分岐", "分岐する手順", "条件", "期待される結果", "状態", "確認したページ", "メモ", "版"],
    widths8: [18, 22, 10, 30, 30, 12, 18, 30, 8],
    notCert: NOT_CERT_JA,
  },
};

/** 빈 글자("")는 셀을 비운다. 엑셀 파일에 빈 공유 문자열로 저장되면 일부 도구가 그 번호(예: 57)를 값처럼 보여 준다 */
function cells(values: (string | number | null | undefined)[]): (string | number | null)[] {
  return values.map((v) => (v === "" || v === undefined ? null : v));
}

function kst(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

function cellBox(row: ExcelJS.Row, n: number) {
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
    c.alignment = { vertical: "top", wrapText: true };
  }
}

function headerRow(row: ExcelJS.Row, n: number) {
  cellBox(row, n);
  row.font = { bold: true };
  for (let i = 1; i <= n; i++) {
    const c = row.getCell(i);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE4F7" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  row.height = 32;
}

function fill(c: ExcelJS.Cell, argb: string) {
  if (argb !== "FFFFFFFF") c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** 대략적인 줄 수로 행 높이를 잡는다 (엑셀은 자동 높이를 저장하지 않음) */
/** 점검노트 판정 칸: "부적합 · AI · 확신 보통\n근거" */
function verdictCell(x: ToolVerdict | undefined, ja: boolean): string {
  if (!x || !x.verdict) return ja ? "判定中" : "판정 중";
  const label = ja ? { pass: "適合", fail: "不適合", na: "適用なし" }[x.verdict] : { pass: "적합", fail: "부적합", na: "해당 없음" }[x.verdict];
  const src = x.source === "human" ? (ja ? "試験者" : "점검자") : x.source === "ai" ? "AI" : ja ? "自動ルール" : "자동 규칙";
  const conf = x.source === "human" ? "" : ja ? ` · 確信度 ${Math.round(x.confidence * 100)}%` : ` · 확신 ${confidenceLabel(x.confidence)}`;
  return `${label} · ${src}${conf}${x.basis && x.source !== "human" ? `\n${x.basis}` : ""}`;
}

function fitHeight(row: ExcelJS.Row, widths: number[], charWidth = 1.15) {
  let lines = 1;
  widths.forEach((w, i) => {
    const text = String(row.getCell(i + 1).value ?? "");
    const n = text.split("\n").reduce((sum, part) => sum + Math.max(1, Math.ceil((part.length * charWidth) / Math.max(4, w))), 0);
    lines = Math.max(lines, n);
  });
  row.height = Math.min(400, 15 * lines + 3);
}

/** fit=false: 화면용 상세 시트는 A4 한 장 너비로 억지로 줄이지 않는다 (머리글 행만 반복) */
function printSetup(ws: ExcelJS.Worksheet, headerRowNo: number, fit = true) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: fit,
    ...(fit ? { fitToWidth: 1, fitToHeight: 0 } : { scale: 70 }),
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
    printTitlesRow: `${headerRowNo}:${headerRowNo}`,
  };
  ws.headerFooter = { oddFooter: "&L&A&R&P / &N" };
}

export async function buildChecklist(v: ScanView): Promise<Buffer> {
  const ja = v.pack.locale === "ja";
  const t = ja ? L.ja : L.ko;
  const lang = ja ? "ja" : "ko";
  const wb = new ExcelJS.Workbook();
  wb.creator = ja ? "a11ynote" : "접근성 점검노트";
  const s = summary(v);
  const issues = issueRecords(v);
  const rows = itemRows(v, issues);
  const verdictByCode = new Map((v.verdicts ?? []).map((x) => [x.code, x]));
  const metrics = reportMetrics(v, issues);
  const std = ja ? `${t.std}（目標とする適合レベル: AA）` : t.std;
  const sub = submissionInfo(v, ja);
  const inputNotice = draftInputText(sub, ja);
  const foot = reviewFootnote(metrics.reviewDetail, ja);

  // ── 1. 점검표 ──
  const info: [string, string][] = [
    [t.info[0], v.project.name],
    [t.info[1], sub.target],
    [t.info[2], dateKst(v.scan.createdAt)],
    [t.info[3], inputNotice ? `${docStatus(s, ja, scopeGate(v), sub.incomplete)} · ${inputNotice}` : docStatus(s, ja, scopeGate(v), sub.incomplete)],
    [t.info[4], sub.org],
    [t.info[5], sub.auditor],
    [t.info[6], sub.environment],
    [t.info[7], ja ? `a11ynote（自動チェック＋試験者確認） · ${REPORT_TEMPLATE_VERSION}` : `${TOOL_NAME} · ${REPORT_TEMPLATE_VERSION}`],
    ...scopeLines(v, ja),
    [ja ? "結果" : "결과 요약", [summaryLine(s, ja), ...(["confirmed_fail", "auto_fail", "review"] as IssueState[]).map((st) => metricLine(st, metrics, ja)), aiSummaryText(aiAudit(v), ja), foot].join("\n")],
  ];
  const ncol = t.cols.length;
  addSummarySheet(wb, v, ja, metrics, issues, s);
  const ws = wb.addWorksheet(t.sheet1);
  ws.columns = t.widths.map((width) => ({ width }));
  const infoWidth = t.widths.slice(3).reduce((a, b) => a + b, 0);
  ws.mergeCells(1, 1, 1, ncol);
  ws.getCell("A1").value = t.title(std);
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getRow(1).height = 24;
  let r = 2;
  for (const [k, val] of info) {
    const row = ws.getRow(r);
    ws.mergeCells(r, 1, r, 3);
    row.getCell(1).value = k;
    row.getCell(1).font = { bold: true };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F7" } };
    ws.mergeCells(r, 4, r, ncol);
    row.getCell(4).value = val === "" ? null : val;
    if (/초안: |草案: /.test(val)) row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } };
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.height = Math.max(16, Math.ceil((String(val).length * 1.7) / infoWidth) * 15 + 3);
    r++;
  }
  r++;
  ws.getCell(r, 1).value = t.legendTitle;
  ws.getCell(r, 1).font = { bold: true };
  r++;
  for (const [k, val] of t.legend) {
    const row = ws.getRow(r);
    ws.mergeCells(r, 1, r, 3);
    row.getCell(1).value = k;
    row.getCell(1).font = { bold: true };
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(r, 4, r, ncol);
    row.getCell(4).value = val;
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
    row.height = Math.max(16, Math.ceil((val.length * 1.7) / infoWidth) * 15 + 3);
    r++;
  }
  r++;
  const HEAD = r;
  const head = ws.getRow(HEAD);
  head.values = t.cols;
  headerRow(head, ncol);
  rows.forEach((it, i) => {
    const row = ws.getRow(HEAD + 1 + i);
    const kinds = it.evidence.length;
    const base = [it.no, it.code, it.principle, it.title];
    const rest = [it.applicability, it.method, AUTO_LABEL[lang][it.auto], verdictCell(verdictByCode.get(it.code), ja), HUMAN_LABEL[lang][it.human], t.count(kinds, it.spots), it.evidence.join(", "), it.note];
    row.values = cells(ja ? [...base, it.level ?? "", ...rest] : [...base, ...rest]);
    cellBox(row, ncol);
    row.getCell(1).alignment = { vertical: "top", horizontal: "center" };
    const autoCol = ja ? 8 : 7;
    fill(row.getCell(autoCol), AUTO_FILL[it.auto]);
    const vd = verdictByCode.get(it.code)?.verdict;
    if (vd) fill(row.getCell(autoCol + 1), HUMAN_FILL[vd]);
    row.getCell(autoCol + 1).font = { bold: true };
    fill(row.getCell(autoCol + 2), HUMAN_FILL[it.human]);
    row.getCell(autoCol + 2).font = it.human === "pass" || it.human === "fail" || it.human === "na" ? { bold: true } : {};
    fitHeight(row, t.widths);
  });
  const lastItem = HEAD + rows.length;
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: lastItem, column: ncol } };
  ws.views = [{ state: "frozen", ySplit: HEAD, xSplit: 0 }];
  const tail = ws.getRow(lastItem + 2);
  ws.mergeCells(tail.number, 1, tail.number, ncol);
  tail.getCell(1).value = t.notCert;
  tail.getCell(1).font = { bold: true };
  tail.getCell(1).alignment = { wrapText: true };
  tail.height = 30;
  printSetup(ws, HEAD);

  // ── 2. 오류 목록 (위치 한 곳 = 한 줄) ──
  // 재현 절차: 녹화된 흐름 단계·점검 환경이 있으면 그것으로 (없으면 공통 절차)
  const pageById = new Map(v.pages.map((p) => [p.id, p]));
  const flowById = new Map(v.flows.map((f) => [f.id, f]));
  const envByPage = new Map((v.evidence ?? []).map((e) => [e.pageStateId, e.environment]));
  const reproFor = (pageStateId: string, how: string) => {
    const page = pageById.get(pageStateId);
    return reproLines({ page, flow: page?.flowId ? flowById.get(page.flowId) : undefined, environment: envByPage.get(pageStateId) }, how, ja)?.join("\n") ?? null;
  };
  const ws2 = wb.addWorksheet(t.sheet2);
  ws2.columns = t.widths2.map((width) => ({ width }));
  const n2 = t.cols2.length;
  headerRow(Object.assign(ws2.getRow(1), { values: t.cols2 }) as ExcelJS.Row, n2);
  let line = 2;
  const ordered = (["confirmed_fail", "auto_fail", "review"] as IssueState[]).flatMap((st) => byPriority(issues.filter((x) => x.state === st)));
  for (const rec of ordered) {
    const cause = causeText(rec, ja);
    rec.locations.forEach((loc, k) => {
      const row = ws2.getRow(line++);
      row.values = cells([
        rec.id,
        `${k + 1}/${rec.locations.length}`,
        rec.priority,
        cause,
        STATE_LABEL[lang][rec.state],
        rec.itemCode,
        rec.title,
        loc.pageLabel,
        loc.url,
        loc.selector,
        loc.actual + (rec.basis ? `\n(${rec.basis})` : ""),
        rec.expected,
        reproFor(loc.pageStateId, rec.howToCheck) ?? t.repro(rec.howToCheck),
        rec.fix,
        [rec.id, loc.shotId].filter(Boolean).join(" / "),
        "",
        rec.state === "review" ? t.openReview : t.open,
        rec.doneWhen,
      ]);
      cellBox(row, n2);
      fill(row.getCell(5), STATE_FILL[rec.state]);
      row.getCell(17).dataValidation = { type: "list", allowBlank: true, formulae: [t.statusList] };
      fitHeight(row, t.widths2);
    });
  }
  if (line === 2) {
    ws2.mergeCells(2, 1, 2, n2);
    ws2.getCell(2, 1).value = t.noIssues;
  } else {
    ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: line - 1, column: n2 } };
  }
  ws2.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  printSetup(ws2, 1, false);

  // ── 2-1. 쉽게 보기·개선 방향 (한국어): 고치는 순서대로, 오류마다 쉬운 설명·수정 전후 코드·확인 방법 ──
  const plan = improvementPlan(issues, ja);
  if (plan.length) {
    const byId = new Map(issues.map((r) => [r.id, r]));
    const rows: (string | number)[][] = [];
    for (const step of plan) {
      if (!step.ids.length) rows.push([step.stage, "", "", "", "", "", "", step.what, "", ""]);
      for (const id of step.ids) {
        const rec = byId.get(id);
        const pg = rec && plainGuide(rec, ja);
        if (!pg) continue;
        rows.push([
          step.stage,
          id,
          pg.criterion,
          pg.problem,
          pg.who,
          pg.before ? `${pg.before.selector}\n${pg.before.html}` : "",
          pg.after ? `${pg.after.code}${pg.after.note ? `\n(${pg.after.note})` : ""}` : "",
          numbered(pg.steps),
          pg.verify,
          `${pg.why}\n${pg.scope}`,
        ]);
      }
    }
    noteSheet(
      wb,
      PLAIN_LABEL.sheet,
      `고치는 순서대로 문제를 묶었어요. 여러 화면에 반복되는 공통 요소를 먼저 고치면 적은 수정으로 많은 화면이 해결돼요. 위치별 전체 목록은 "오류 목록" 시트에 있어요. ${PLAIN_LABEL.exampleNote}`,
      ["단계", "오류 ID", PLAIN_LABEL.criterion, PLAIN_LABEL.problem, PLAIN_LABEL.who, PLAIN_LABEL.before, "수정 후 (예시)", PLAIN_LABEL.steps, PLAIN_LABEL.verify, PLAIN_LABEL.why],
      [16, 8, 26, 26, 34, 34, 34, 60, 34, 34],
      rows,
    );
  }

  // ── 3. 점검 범위 ──
  const ws3 = wb.addWorksheet(t.sheet3);
  ws3.columns = t.widths3.map((width) => ({ width }));
  const n3 = t.cols3.length;
  headerRow(Object.assign(ws3.getRow(1), { values: t.cols3 }) as ExcelJS.Row, n3);
  const ext = v.scan.source !== "server";
  v.pages.forEach((p, i) => {
    const row = ws3.getRow(i + 2);
    const viaExt = ext || /확장/.test(p.reason ?? "");
    const env = environmentText(envByPage.get(p.id));
    row.values = cells([`S${String(i + 1).padStart(2, "0")}`, p.label, p.url, p.reason ?? "", t.login(viaExt), `${kst(p.createdAt)} KST`, env ? `${t.how(viaExt)}\n${env}` : t.how(viaExt), t.loginNote(p.reason ?? "", viaExt)]);
    cellBox(row, n3);
    fitHeight(row, t.widths3, 1.9); // 한글 위주 짧은 열이 많아 넉넉히
  });
  ws3.views = [{ state: "frozen", ySplit: 1 }];
  if (v.pages.length) ws3.autoFilter = { from: { row: 1, column: 1 }, to: { row: v.pages.length + 1, column: n3 } };
  printSetup(ws3, 1);

  // ── 4. AI 검수 (자동 점검 결과 재검수 기록이 있을 때만) ──
  const vrows = verificationRows(v, issues);
  if (vrows.length) {
    const ws4 = wb.addWorksheet(t.sheet4);
    ws4.columns = t.widths4.map((width) => ({ width }));
    const n4 = t.cols4.length;
    ws4.mergeCells(1, 1, 1, n4);
    ws4.getCell(1, 1).value = t.verifyNote;
    ws4.getCell(1, 1).alignment = { wrapText: true, vertical: "top" };
    ws4.getRow(1).height = 45;
    headerRow(Object.assign(ws4.getRow(2), { values: t.cols4 }) as ExcelJS.Row, n4);
    vrows.forEach((x, i) => {
      const row = ws4.getRow(3 + i);
      row.values = cells([
        x.issueId,
        x.itemCode,
        x.ruleId,
        x.pageLabel,
        x.selector,
        t.autoWord[x.autoResult] ?? x.autoResult,
        VERIFICATION_LABEL[lang][x.ai],
        x.confidence == null ? "" : x.confidence.toFixed(2),
        [x.reason, x.evidence].filter(Boolean).join("\n"),
        ROUTE_LABEL[lang][x.route],
        x.human ? t.humanWord[x.human] : t.undecided,
        x.model,
        x.promptVersion,
        `${kst(x.createdAt)} KST`,
        x.inputHash,
      ]);
      cellBox(row, n4);
      fitHeight(row, t.widths4);
    });
    ws4.views = [{ state: "frozen", ySplit: 2 }];
    ws4.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + vrows.length, column: n4 } };
    printSetup(ws4, 2, false);
  }

  // ── 5. 기준 외 참고 (연결표 밖 자동 결과가 있을 때만) ──
  const refs = referenceRules(v.references ?? [], v.pages);
  if (refs.length) {
    const rows: (string | number)[][] = [];
    for (const r of refs) {
      r.samples.forEach((x, k) => {
        const p = v.pages.find((pg) => pg.id === x.pageStateId);
        rows.push([r.ruleId, r.wcag.join(", "), t.refOutcome[r.outcome] ?? r.outcome, k === 0 ? r.message.split(" — ")[0] : "", k === 0 ? r.count : "", p?.label ?? "", p?.url ?? "", x.selector, x.message]);
      });
    }
    noteSheet(wb, t.sheet5, t.refNote, t.cols5, t.widths5, rows);
  }

  // ── 6. 자동 점검 통과·해당 없음 (0.3.0 코어부터 기록) ──
  const outcomes = ruleOutcomeSummary(v.evidence ?? []);
  if (outcomes.rules.length) {
    noteSheet(wb, t.sheet6, t.passNote(outcomes.pages), t.cols6, t.widths6, outcomes.rules.map((r) => [r.ruleId, r.help, r.tags.filter((g) => /^wcag|^best-practice$|^ACT$/i.test(g)).join(", "), r.passedPages, r.inapplicablePages]));
  }

  // ── 7. 수동·보조기술·사용자 평가 (기록이 있을 때만) ──
  const evals = v.evaluations ?? [];
  if (evals.length) {
    const cur = new Set(currentEvaluations(evals).map((e) => e.id));
    const pageLabel = new Map(v.pages.map((p) => [p.id, p.label]));
    noteSheet(
      wb,
      t.sheet7,
      t.evalNote,
      t.cols7,
      t.widths7,
      evals.map((e) => [
        e.id.slice(0, 8),
        cur.has(e.id) ? t.latest : t.old,
        EVAL_KIND_LABEL[lang][e.kind],
        e.itemCode ?? "",
        e.pageStateId ? (pageLabel.get(e.pageStateId) ?? "") : "",
        e.task ?? "",
        e.method ?? "",
        [e.assistiveTech, e.assistiveTechVersion].filter(Boolean).join(" "),
        [e.browser, e.browserVersion].filter(Boolean).join(" "),
        [e.os, e.device].filter(Boolean).join(" / "),
        e.participantCode ? `${e.participantCode}${e.participantProfile ? ` (${e.participantProfile})` : ""}` : "",
        EVAL_RESULT_LABEL[lang][e.result],
        e.severity ? SEVERITY_LABEL[lang][e.severity] : "",
        (e.steps ?? []).map((x, i) => `${i + 1}) ${x}`).join("\n"),
        e.notes,
        maskAccount(e.evaluator),
        e.performedAt ? `${kst(e.performedAt)} KST` : "",
        e.supersedes ? e.supersedes.slice(0, 8) : "",
      ]),
    );
  }

  // ── 8. 흐름 분기 (기록이 있을 때만) ──
  const branches = v.branches ?? [];
  if (branches.length) {
    const cur = new Set(currentBranches(branches).map((b) => b.id));
    noteSheet(
      wb,
      t.sheet8,
      t.branchNote,
      t.cols8,
      t.widths8,
      branches.map((b) => [flowById.get(b.flowId)?.name ?? b.flowId.slice(0, 8), b.name, b.fromStep ?? "", b.condition, b.expected, BRANCH_STATUS_LABEL[lang][b.status], b.pageStateId ? (pageById.get(b.pageStateId)?.label ?? "") : "", b.note, cur.has(b.id) ? t.latest : t.old]),
    );
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 요약 시트 한계 문장: 무작위 표본·보조기술 점검을 실제 기록대로 적는다 */
function samplingLimit(v: ScanView): string {
  const sc = scopeInfo(v);
  const random = sc.randomPages ? `무작위 표본 ${sc.randomPages}개를 함께 점검했어요.` : "무작위 표본은 추가하지 않았어요.";
  const at = sc.evaluations.assistiveTech ? `보조기술 점검 ${sc.evaluations.assistiveTech}건을 기록했어요 ("수동·보조기술·사용자 평가" 시트, 항목 판정은 바꾸지 않음).` : "보조기술(화면낭독기) 조합 점검은 하지 않았어요.";
  return `${random} ${at}`;
}

/** 안내 한 줄 + 머리글 + 표로 된 참고 시트 */
function noteSheet(wb: ExcelJS.Workbook, name: string, note: string, cols: string[], widths: number[], rows: (string | number)[][]) {
  const ws = wb.addWorksheet(name);
  ws.columns = widths.map((width) => ({ width }));
  const n = cols.length;
  ws.mergeCells(1, 1, 1, n);
  ws.getCell(1, 1).value = note;
  ws.getCell(1, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(1).height = 45;
  headerRow(Object.assign(ws.getRow(2), { values: cols }) as ExcelJS.Row, n);
  rows.forEach((values, i) => {
    const row = ws.getRow(3 + i);
    row.values = cells(values);
    cellBox(row, n);
    fitHeight(row, widths);
  });
  ws.views = [{ state: "frozen", ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + rows.length, column: n } };
  printSetup(ws, 2, false);
}

/** 요약 시트 (맨 앞): 상태별 기준·유형·위치·화면 수, 기준 항목 상태, 우선 처리 문제, 읽는 방법, 한계 */
function addSummarySheet(wb: ExcelJS.Workbook, v: ScanView, ja: boolean, m: ReturnType<typeof reportMetrics>, issues: ReturnType<typeof issueRecords>, s: ReturnType<typeof summary>) {
  const lang = ja ? "ja" : "ko";
  const sub = submissionInfo(v, ja);
  const inputNotice = draftInputText(sub, ja);
  const ready = s.allConfirmed && !sub.incomplete && !scopeGate(v).blocked;
  const ws = wb.addWorksheet(ja ? "要約" : "요약");
  ws.columns = [{ width: 24 }, { width: 46 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }];
  const states: IssueState[] = ["confirmed_fail", "auto_fail", "review"];
  const meaning = ja
    ? { confirmed_fail: "試験者が不適合と確定", auto_fail: "自動チェックが違反の可能性を検出（未確定）", review: "自動で判断できず試験者の確認が必要" }
    : { confirmed_fail: "점검자가 부적합으로 확정", auto_fail: "자동 점검이 위반 가능성을 찾음 (점검자 확정 전)", review: "자동으로 판단할 수 없어 점검자 확인 필요" };
  let r = 1;
  const put = (vals: (string | number | null)[], o: { bold?: boolean; fill?: string; box?: boolean; wrap?: boolean } = {}) => {
    const row = ws.getRow(r++);
    row.values = cells(vals);
    vals.forEach((_, i) => {
      const c = row.getCell(i + 1);
      c.alignment = { vertical: "top", wrapText: true };
      if (o.bold) c.font = { bold: true };
      if (o.box) c.border = { top: THIN, bottom: THIN, left: THIN, right: THIN };
      if (o.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    });
    return row;
  };
  const merged = (text: string, o: { bold?: boolean; size?: number; fill?: string } = {}) => {
    ws.mergeCells(r, 1, r, 6);
    const row = ws.getRow(r++);
    row.getCell(1).value = text;
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).font = { bold: o.bold, size: o.size };
    if (o.fill) row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
    row.height = Math.max(18, Math.ceil(text.length / 70) * 16);
  };
  merged(ja ? "ウェブアクセシビリティ自己試験 — 要約" : "웹 접근성 자체진단 — 요약", { bold: true, size: 14 });
  merged(ja ? "自己試験の資料です。認証や適合表明ではありません。" : `${ready ? "자체진단 결과" : sub.incomplete && s.allConfirmed ? "자체진단 초안 · 제출 정보 입력 필요" : "자체진단 초안 · 항목 판정 진행 중"} — 품질인증서나 적합성 선언이 아니에요.`, { bold: true, fill: ready ? "FFEAF5EE" : "FFFDF1D6" });
  if (inputNotice) merged(inputNotice, { bold: true, fill: "FFFDE2E2" });
  r++;
  for (const [k, val] of [
    [ja ? "対象" : "사이트명", v.project.name],
    [ja ? "URL" : "대상 URL", sub.target],
    [ja ? "試験機関" : "점검 기관", sub.org],
    [ja ? "試験者" : "점검자", sub.auditor],
    [ja ? "試験日" : "점검일", dateKst(v.scan.createdAt)],
    [ja ? "規格" : "점검 기준", v.scan.packVersion ?? v.pack.name],
    [ja ? "試験ページ数" : "점검 화면 수", String(m.pagesChecked)],
    [ja ? "試験者確定" : "점검자 확정", `${m.itemsConfirmed} / ${m.itemsTotal}`],
    [ja ? "文書の状態" : "문서 상태", docStatus(s, ja, scopeGate(v), sub.incomplete)],
  ] as [string, string][]) {
    ws.mergeCells(r, 2, r, 6);
    put([k, val], { box: false });
    ws.getRow(r - 1).getCell(1).font = { bold: true };
    if (/초안: |草案: /.test(val)) ws.getRow(r - 1).getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } };
  }
  r++;
  put(ja ? ["区分（表示）", "意味", "達成基準", "種類", "箇所", "ページ"] : ["구분 (표시)", "뜻", "기준", "유형", "위치", "화면"], { bold: true, box: true, fill: "FFDCE4F7" });
  for (const st of states) {
    const row = put([METRIC_TITLE[lang][st], meaning[st], m[st].criteria, m[st].types, m[st].locations, m[st].pages], { box: true });
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATE_FILL[st] } };
    row.getCell(1).font = { bold: true };
  }
  for (const st of states) merged(metricLine(st, m, ja));
  merged(reviewFootnote(m.reviewDetail, ja));
  r++;
  const top = byPriority(issues.filter((x) => x.state !== "review")).slice(0, 5);
  if (top.length) {
    merged(ja ? "優先して対応する問題（利用者への影響・共通原因の上位5件）" : "우선 처리할 오류 (사용자 영향·기능 차단·공통 원인 기준 상위 5개)", { bold: true });
    ws.mergeCells(r, 4, r, 6);
    put(ja ? ["優先度 / ID", "問題", "達成基準", "原因・影響"] : ["우선순위 / ID", "오류", "기준", "원인·영향"], { bold: true, box: true, fill: "FFDCE4F7" });
    for (const x of top) {
      ws.mergeCells(r, 4, r, 6);
      const row = put([`${x.priority}\n${x.id} ${STATE_LABEL[lang][x.state]}`, x.title, x.itemCode, causeText(x, ja)], { box: true });
      row.height = 34;
    }
    r++;
  }
  merged(ja ? "読み方" : "읽는 방법", { bold: true });
  for (const line of ja
    ? ["管理者: このシートと Word 報告書1章。", "試験者: 「達成基準チェックリスト」シートと Word 報告書2章。", "開発チーム: 「問題一覧」シート（全箇所）と Markdown 修正依頼書。"]
    : ["경영진: 이 시트와 Word 보고서 1장(결론 요약).", "점검자: \"자체진단 점검표\" 시트(기준별 자동 결과·점검자 판정)와 Word 보고서 2장(지적사항).", "개발팀: \"오류 목록\" 시트(전체 위치, 상태·우선순위·기준·화면 필터)와 Markdown \"개발팀 수정 요청서\"."])
    merged(line);
  r++;
  merged(ja ? "制約" : "한계", { bold: true });
  for (const line of ja
    ? ["「問題未検出（自動）」は適合の確定ではありません。", "代表ページのみ試験しています。", "認証や適合表明ではありません。"]
    : [
        "모든 항목은 점검노트가 자동 규칙과 AI로 판정했어요. 확신도가 낮은 판정은 먼저 검토해 주세요. 자동 규칙만으로는 기준의 일부만 확인해요.",
        `같은 틀의 화면은 대표 1개만 점검했어요 (점검 페이지 ${m.pagesChecked}개, 목록은 "점검 범위" 시트). ${samplingLimit(v)}`,
        `점검 기관·점검자${submissionInfo(v, ja).demo ? "·실제 대상 URL" : ""}는 입력되지 않은 초안이에요.${submissionInfo(v, ja).demo ? " 시연용 테스트 사이트 결과를 실제 서비스 평가로 제출하지 마세요." : ""}`,
        "이 파일은 웹 접근성 품질인증서나 적합성 선언이 아니에요.",
      ])
    merged(line);
  ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
}
