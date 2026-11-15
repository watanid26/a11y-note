// 점검 보고서 (Word). W3C Accessibility Evaluation Report Template·WCAG-EM 구조를 따른다.
// 표지(읽는 방법·구성) → 1 결론 요약 → 2 평가 배경 → 3 점검 범위 → 4 점검자·도구 → 5 점검 방법
// → 6 결과 및 우선순위 → 7 상세 증거 → 8 한계와 유의사항 → 부록(점검한 페이지·판정 용어·참고자료)
// 원칙
//  - 이 문서는 자체진단 자료다. 품질인증서·적합성 선언이 아님을 표지·요약·마지막에 밝힌다
//  - 수치는 화면·Excel·Markdown 과 같은 공통 수치(reportMetrics)와 같은 표기(metricText)를 쓴다
//  - 상태는 색과 함께 글자 라벨로 구분한다
//  - 캡처와 설명은 한 칸(나뉘지 않는 표 행)에 묶어 페이지 경계에서 갈라지지 않게 한다
//  - 전체 위치 목록의 주 산출물은 Excel "오류 목록" 시트다

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import JSZip from "jszip";
import sharp from "sharp";
import { evidenceImages } from "../crop";
import { type ScanView } from "../scan-view";
import { currentEvaluations, EVAL_KIND_LABEL, EVAL_RESULT_LABEL, evaluationSummary } from "../manual-eval";
import { loadShot as loadShotFromStorage } from "../storage";
import { NOT_CERT_JA, NOT_CERT_KO, TOOL_NAME, dateKst, docStatus, draftInputText, scopeDiagnostics, scopeGate, scopeInfo, scopeLines, submissionInfo, summary, summaryLine } from "./data";
import { LIMIT, clip } from "./copy";
import {
  AUTO_LABEL,
  HUMAN_LABEL,
  METRIC_TITLE,
  STATE_LABEL,
  byPriority,
  causeGroups,
  causeText,
  issueRecords,
  itemRows,
  metricText,
  reportMetrics,
  reviewFootnote,
  aiAudit,
  aiSummaryText,
  provenanceText,
  verificationLine,
  type AiAudit,
  type AutoResult,
  type HumanVerdict,
  type IssueRecord,
  type IssueState,
} from "./model";
import { PLAIN_LABEL, numbered, plainGuide, sameElementGroups, termsIn } from "./plain-guide";
import { REPORT_TEMPLATE_VERSION } from "./version";
import { KWCAG22_CRITERIA, VERDICT_RULES_KO } from "./criteria";
import { RANDOM_HOW, SAMPLE_LIMIT, plainReason, sampleRows, sampleSummary, typeCoverage } from "./sample-basis";
import { pageType } from "../sampling";
import { confidenceLabel, type ToolVerdict } from "../../core/verdict";

export { REPORT_TEMPLATE_VERSION } from "./version";

const AUTO_SHADE: Record<AutoResult, string> = { signal: "FCE4E4", review: "FDF1D6", clear: "EAF5EE", absent: "F2F2F2", untested: "FFFFFF" };
const HUMAN_SHADE: Record<HumanVerdict, string> = { pass: "D9F0E1", fail: "F9D3D3", na: "E9E9E9", undecided: "FFFFFF", untested: "FFFFFF" };
const STATE_SHADE: Record<IssueState, string> = { confirmed_fail: "F9D3D3", auto_fail: "FCE4E4", review: "FDF1D6" };
/** 색만으로 구분하지 않도록 상태 앞에 붙이는 글자 표시 */
const STATE_TAG: Record<"ko" | "ja", Record<IssueState, string>> = {
  ko: { confirmed_fail: "[점검자 판정]", auto_fail: "[오류]", review: "[오류 의심]" },
  ja: { confirmed_fail: "[確定]", auto_fail: "[自動の兆候]", review: "[要確認]" },
};
const LINE = { style: BorderStyle.SINGLE, size: 4, color: "B8BEC9" };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const STATES: IssueState[] = ["confirmed_fail", "auto_fail", "review"];
/** 한국어 보고서의 문제 상태 이름 (화면과 같은 실무 용어). 일본어는 model.ts 표기 그대로 */
const STATE_KO: Record<IssueState, string> = METRIC_TITLE.ko;
const stateName = (lang: "ko" | "ja", st: IssueState) => (lang === "ko" ? STATE_KO[st] : METRIC_TITLE.ja[st]);
const VERDICT_KO: Record<"pass" | "fail" | "na", string> = { pass: "적합", fail: "부적합", na: "해당 없음" };
const VERDICT_SHADE: Record<"pass" | "fail" | "na", string> = { pass: "D9F0E1", fail: "F9D3D3", na: "E9E9E9" };
function verdictText(x: ToolVerdict | undefined): string {
  if (!x?.verdict) return "판정 중";
  const how = x.source === "human" ? "점검자" : x.source === "ai" ? "AI" : "자동 규칙";
  return `${VERDICT_KO[x.verdict]} · ${how}${x.source === "human" ? "" : ` · 확신 ${confidenceLabel(x.confidence)}`}`;
}

const REFS = {
  ko: [
    ["한국형 웹 콘텐츠 접근성 지침 2.2 (KWCAG 2.2)", "이 보고서의 기준 항목(33개)과 기준 코드"],
    ["W3C, WCAG Evaluation Methodology (WCAG-EM) 2.0 (Group Note, 2026)", "https://www.w3.org/TR/WCAG-EM/ — 평가 범위·대표 페이지 선정·결과 보고 절차"],
    ["W3C WAI, Accessibility Evaluation Report Template", "https://www.w3.org/WAI/test-evaluate/report-template/ — 보고서 구성"],
    ["W3C, Web Content Accessibility Guidelines (WCAG) 2.2", "https://www.w3.org/TR/WCAG22/ — 자동 점검 규칙의 근거 성공 기준"],
  ],
  ja: [
    ["JIS X 8341-3:2016", "本書の達成基準"],
    ["W3C, WCAG Evaluation Methodology (WCAG-EM) 2.0 (Group Note, 2026)", "https://www.w3.org/TR/WCAG-EM/"],
    ["W3C WAI, Accessibility Evaluation Report Template", "https://www.w3.org/WAI/test-evaluate/report-template/"],
    ["W3C, Web Content Accessibility Guidelines (WCAG) 2.2", "https://www.w3.org/TR/WCAG22/"],
  ],
};


const TXT = {
  ko: {
    title: "웹 접근성 자체진단 결과 보고서",
    banner: (draft: boolean) => (draft ? "자체진단 초안 · 항목 판정 진행 중 (품질인증서나 적합성 선언이 아니에요)" : "자체진단 결과 (품질인증서나 적합성 선언이 아니에요)"),
    meta: ["사이트명", "대상 주소", "점검일", "점검 기준", "점검한 페이지 수", "점검노트 판정", "문서 상태", "보고서 버전·점검 회차", "대상 기관명", "점검 수행 기관·담당팀", "작성 도구", "점검 환경"],
    std: (name: string) => `${name} (33개 검사항목)`,
    howToRead: "읽는 방법",
    readers: [
      ["경영진·담당 부서", "1장 결론 요약(1~2쪽)만 보면 지금 상태와 먼저 할 일을 알 수 있어요."],
      ["점검자", "5장 판정 기준 → 6장 결과 → 7장 상세 근거 순서로 보면 돼요. 판정을 고칠 때는 서비스 화면에서 해요."],
      ["개발팀", "Markdown 수정 요청서와 Excel 오류 목록에 고칠 위치와 완료 조건이 있어요."],
    ],
    toc: "이 문서의 구성",
    sections: ["1. 결과 요약", "2. 지적사항", "3. 항목별 판정", "부록 A. 점검 범위", "부록 B. 점검 방법과 판정 기준", "부록 C. 점검자와 도구", "부록 D. 한계와 유의사항", "부록 E. 판정 용어와 참고 기준"],
    conclusion: (_m: ReturnType<typeof reportMetrics>, _draft: boolean, s: ReturnType<typeof summary>) => {
      const vc = s.verdictCounts;
      if (!s.allConfirmed) return `33개 항목 중 ${s.confirmed}개를 판정했고, 나머지 ${vc.pending}개는 아직 판정 중이에요. 지금까지 부적합은 ${vc.fail}개 항목이에요.`;
      return `${s.total}개 항목을 모두 판정했어요. 적합 ${vc.pass}개, 부적합 ${vc.fail}개, 해당 없음 ${vc.na}개이고, 준수율은 ${s.confirmedRate ?? "-"}%예요. 점검자 검토는 ${s.reviewed}개 항목을 마쳤어요.`;
    },
    statusHead: ["구분", "뜻", "기준", "유형", "위치", "화면"],
    statusMeaning: { confirmed_fail: "점검자가 부적합으로 판정한 오류", auto_fail: "자동 규칙이 찾은 오류", review: "자동 규칙으로 결론이 안 나 점검노트가 판정에 반영한 곳" } as Record<IssueState, string>,
    itemStatus: "기준 항목 상태 (33개)",
    itemHead: ["적합 (점검자 확정)", "부적합 (점검자 확정)", "해당 없음 (점검자 확정)", "자동 신호 (확정 아님)", "자동 오류 미발견 (확정 아님)", "해당 요소 없음 (자동)", "사람 확인 필요", "미점검"],
    top: "우선 처리할 오류",
    topHead: ["우선순위", "ID", "기준", "오류", "원인·영향"],
    topNote: "우선순위는 위치 수가 아니라 기능을 막는지로 정했어요. 여러 페이지에 반복되는 같은 요소는 원인 1곳으로 세요.",
    excelNote: "전체 위치 목록은 Excel \"오류 목록\" 시트에 있어요. 이 보고서 2장에는 오류별 대표 캡처와 원인별 영향 페이지를 실었어요.",
    submission: "제출 정보",
    background: (site: string, url: string) => [
      `대상: ${site} (${url})`,
      "목적: 한국형 웹 콘텐츠 접근성 지침(KWCAG) 2.2 기준으로 대표 페이지를 점검하고, 항목마다 판정과 고칠 곳을 정리했어요.",
      "성격: 자체진단 자료예요. 웹 접근성 품질인증 심사나 적합성 선언을 대신하지 않아요.",
    ],
    wcagEm: (pages: number, flows: number, sc: ReturnType<typeof scopeInfo>) => [
      ["평가 목표 수준", "KWCAG 2.2 전체 33개 검사항목 (WCAG 2.2 수준 AA에 해당하는 항목 포함)"],
      ["평가 대상", `대상 주소와 같은 사이트의 페이지 ${pages}개. 다른 사이트로 넘어가는 페이지는 빼고 점검했어요.`],
      [
        "지원 기준 (브라우저·보조기술)",
        `${sc.environments.pages ? `기록된 점검 브라우저: ${sc.environments.browsers.join(", ") || "알 수 없음"} · 창 크기 ${sc.environments.viewports.join(", ")} (환경을 기록한 페이지 ${sc.environments.pages}개).` : "자동 점검 브라우저: Chromium (데스크톱 화면 1280px)."} ${sc.evaluations.assistiveTech ? `보조기술 점검 ${sc.evaluations.assistiveTech}건 (${sc.evaluations.assistiveTechs.join(", ")}) — 지원 대상 조합 전체를 대표하는지는 점검자가 정해요.` : "화면낭독기 등 보조기술 조합 점검은 하지 않았어요 — 초안: 지원 대상 브라우저·보조기술 조합 입력 필요."}`,
      ],
      [
        "표본 선택 방식",
        `같은 모양끼리 묶어 고른 대표 페이지 ${Math.max(0, pages - sc.randomPages)}개${sc.randomPages ? `와 무작위로 고른 페이지 ${sc.randomPages}개 (WCAG-EM 권고: 대표 페이지의 10%)` : ""}를 점검했어요. 업무 흐름 페이지는 ${flows}개예요.${sc.branches.total ? ` 업무 흐름의 주요 분기 ${sc.branches.total}개 중 확인함 ${sc.branches.tested}개 · 확인 예정 ${sc.branches.planned}개 · 확인 못 함 ${sc.branches.blocked}개예요.` : ""} 실제로 들어간 페이지는 부록 A의 표본 구성 표에 있어요.`,
      ],
    ],
    tools: ["점검 기관", "점검자", "문서 상태", "작성 도구", "점검 엔진", "AI 판정 설정", "점검 시각"],
    method: (audit: AiAudit) => [
      "자동 점검: 규칙 점검(axe-core와 자체 규칙)를 돌리고, 실제로 Tab·Shift+Tab을 눌러 초점 이동, 초점 표시, 키보드 함정을 확인했어요.",
      "판정: 33개 항목 모두 점검노트가 적합·부적합·해당 없음 중 하나로 판정했어요. 어떻게 판정했는지는 바로 아래 \"판정 방식\"과 \"항목별 판정 기준\"에 적었어요.",
      `AI 사용: ${aiSummaryText(audit)}.${audit.inconsistent ? " 설정과 결과가 달라 원자료를 한 번 더 확인해야 해요." : ""}`,
      "기준 차이: KWCAG 6.1.3(조작 가능)은 대각선 6mm 이상인지로 판정해요. WCAG 2.5.8의 24×24px 기준 결과는 참고로만 적고 KWCAG 판정에는 쓰지 않았어요.",
      "페이지 수집: robots.txt를 지키며 주소를 모으고, 같은 모양의 페이지는 대표 1개만 점검했어요. 다른 사이트로 넘어간 페이지는 범위에서 뺐어요.",
      "개인정보: 캡처 전에 입력칸 글자를 가렸고, 보고서의 주소에서는 이름·토큰 같은 값을 지웠어요.",
    ],
    prioHead: ["우선순위", "ID", "상태", "기준", "오류", "원인·영향"],
    prioSub: "6.1 고칠 오류와 우선순위",
    itemSub: "6.2 항목별 판정",
    resultHead: ["기준 코드", "검사항목", "점검노트 판정", "판정 근거", "점검자 검토", "근거 ID"],
    count: (k: number, n: number) => (k ? `${k}건 · ${n}곳` : "-"),
    detailLead: [
      "오류 하나에 카드 한 장이에요. 맨 위 띠에 우선순위, 상태, 고칠 곳 수를 적고, 카드 안에는 기준(번호·제목 원문 그대로), 무엇이 문제인지, 누가 어떻게 불편한지, 수정 전·후 코드, 고치는 방법, 고친 뒤 확인 방법을 차례로 적었어요.",
      "수정 예시는 참고용이에요. alt 문구처럼 실제 내용은 화면을 보고 정해 주세요. 전체 위치 목록은 Excel \"오류 목록\" 시트에 있어요.",
      "캡처의 주황 테두리와 빨간 번호 ①이 오류 요소예요. 화면에 보이지 않는 요소는 캡처 대신 코드 위치로 적었어요.",
    ].join("\n"),
    reviewLead: "자동 규칙만으로는 결론이 안 난 곳이에요. 점검노트가 캡처와 함께 살펴보고 항목 판정(3장)에 반영했어요. 해당 항목이 부적합이면 이 위치부터 고치면 돼요.",
    sub: { confirmed_fail: "2.1 부적합 (점검자 판정)", auto_fail: "2.2 오류 (자동 규칙)", review: "2.3 오류 의심" } as Record<IssueState, string>,
    none: "없어요.",
    f: ["오류", "위치", "영향", "조치", "근거"],
    where: (r: IssueRecord) => `${causeText(r)} · 위치 ${r.locations.length}곳`,
    action: (r: IssueRecord) => (r.state === "review" ? `확인: ${r.howToCheck}` : `${r.fix}\n확인: ${r.howToCheck}`),
    basisLine: (r: IssueRecord, prov: string) => `${r.priority} · 기준 ${r.itemCode} ${r.itemTitle} · 출처 ${prov} · 증거 ${[r.id, ...new Set(r.locations.map((l) => l.shotId).filter(Boolean))].join(", ")}`,
    reviewFix: "해당 항목이 부적합으로 판정되면 고쳐 주세요.",
    basis: (r: IssueRecord, stateLabel: string, method: string) =>
      [`기준 ${r.itemCode} ${r.itemTitle}`, `판정 상태 ${stateLabel}`, `기대 결과: ${r.expected}`, `점검 방법: ${method}`, r.basis ? `판단 근거: ${r.basis}` : "", `증거 ID: ${[r.id, ...new Set(r.locations.map((l) => l.shotId).filter(Boolean))].join(", ")}`]
        .filter(Boolean)
        .join("\n"),
    method2: { auto: "자동 규칙", confirmed: "자동 규칙 + 점검자 판정", ai: "자동 규칙 + AI 판단", fallback: "자동 규칙 (AI 응답이 없어 규칙으로 판단)" },
    causeHead: ["#", "원인 (선택자)", "구분", "영향 화면 (캡처 ID)"],
    shared: (n: number) => `공통 요소 · 페이지 ${n}개`,
    single: "개별 요소",
    morePages: (k: number, n: number) => `… 외 ${k}개 화면 (총 ${n}개)`,
    moreCause: (n: number, k: number) => `… 원인 ${n}곳 중 ${k}곳 표시 (전체는 Excel "오류 목록")`,
    figOverview: (id: string, part: boolean, region: { top: number; height: number; total: number }) =>
      `그림 ${id}-a · ${part ? `화면 일부 (전체 높이 ${region.total}px 중 ${region.top}~${region.top + region.height}px 구간)` : "화면 전체"} — 오류 위치 파악용`,
    figZoom: (id: string) => `그림 ${id}-b · 오류 부위 확대 (주변 여백 포함)`,
    figMeta: (id: string, shot: string, page: string, sel: string) => `오류 ${id} · 화면 ${page} (캡처 ${shot}) · 위치 ${sel}`,
    figLook: (what: string) => `확인할 것: ① 요소 — ${what}`,
    alt: (id: string, kind: "a" | "b", page: string, sel: string, title: string) =>
      `${id} ${kind === "a" ? "화면 축소본" : "오류 부위 확대본"}: ${page} 화면에서 주황 테두리와 빨간 번호 1로 표시한 요소(${sel})가 오류 위치예요. 문제: ${title}`,
    shotGone: "(캡처는 보관 기간이 지났거나 삭제 요청으로 지워졌어요)",
    noShot: "(화면의 한 위치로 짚을 수 없는 문제라 캡처가 없어요)",
    hiddenShot: (sel: string, html: string) => `캡처 없음: 화면에 보이지 않는 요소라 캡처 대신 코드 위치를 적었어요.\n코드 위치: ${sel}${html ? ` · ${html}` : ""}\n위 "고친 뒤 확인" 순서대로 키보드로 재현할 수 있어요.`,
    itemOnly: "특정 위치 없이 판정한 항목",
    itemOnlyHow: "점검한 페이지 전체(부록 A)를 보고 판정했어요.",
    limits: (sc: ReturnType<typeof scopeInfo>, m: ReturnType<typeof reportMetrics>, foot: string, inputNotice: string | null, demo: boolean) => [
      ["판정의 한계", "자동 규칙과 AI로 모든 항목을 판정했지만, 사람이 보조기술로 직접 써 보는 심사를 대신하지는 않아요. 확신도가 \"낮음\"인 판정은 먼저 검토해 주세요."],
      ["오류 의심", `${metricText(m.review)}. 자동 규칙만으로 결론이 안 나서 점검노트가 판정에 반영한 곳이에요.`],
      ["점검하지 않은 범위", `${sc.untestedItems.length ? `점검하지 못한 항목: ${sc.untestedItems.join(", ")}. ` : ""}열지 못한 페이지 ${sc.skipped.length}개. 로그인 후 페이지는 크롬 확장 프로그램으로 기록한 ${sc.extensionPages}개만 들어 있어요. 부록 A에 없는 페이지는 점검하지 않았어요.`],
      ["대표 페이지", `같은 모양의 페이지는 대표 1개만 점검했어요 (그래서 뺀 페이지 ${sc.groupedSkipped}개). 뺀 페이지에만 있는 문제는 이 보고서에 없을 수 있어요. ${sc.randomPages ? `무작위로 고른 페이지 ${sc.randomPages}개도 함께 점검했어요.` : "무작위로 고른 페이지는 넣지 않았어요."}`],
      [
        "보조기술 점검",
        sc.evaluations.assistiveTech || sc.evaluations.userTesting
          ? `보조기술 점검 ${sc.evaluations.assistiveTech}건${sc.evaluations.assistiveTechs.length ? ` (${sc.evaluations.assistiveTechs.join(", ")})` : ""}, 장애인 사용자 평가 ${sc.evaluations.userTesting}건을 기록했어요 (부록 B). 이 기록은 항목 판정을 자동으로 바꾸지 않아요.`
          : "화면 낭독기 같은 보조기술로 직접 써 보는 점검은 하지 않았어요. 외부에 낼 때는 지원할 보조기술 조합을 정해서 따로 확인하는 게 좋아요.",
      ],
      ["제출 정보", inputNotice ? `${inputNotice}${demo ? ". 대상 주소가 시연용 사이트라 실제 서비스 결과가 아니에요." : ""}` : "점검 기관, 점검자, 대상 주소를 모두 입력했어요."],
      ["인증서가 아님", "이 문서는 웹 접근성 품질인증서나 적합성 선언이 아니에요. 공식 인증은 인증기관 심사를 받아야 해요."],
      ["캡처와 개인정보", "캡처 전에 입력칸 글자를 가렸고 주소의 개인정보 값은 지웠어요. 화면에 원래 보이는 다른 개인정보는 자동으로 가리지 못하니, 밖으로 보내기 전에 한 번 확인해 주세요."],
      ["문서 자체의 접근성", "문서 언어를 한국어로 지정했고, 캡처마다 대체 텍스트를 넣었고, 제목 단계로 PDF 책갈피가 만들어져요. PDF로 바꾼 뒤 표 머리글과 읽는 순서는 PDF 접근성 점검 도구로 한 번 확인해 주세요."],
    ],
    pageHead: ["캡처 ID", "페이지 이름", "주소 (개인정보 제거)", "고른 이유"],
    terms: [
      ["적합 · 부적합 · 해당 없음", "항목마다 내린 판정이에요. 해당 없음은 점검한 페이지에 그 항목과 관련된 콘텐츠가 없다는 뜻이에요."],
      ["점검노트 판정", "점검노트가 자동 규칙이나 AI로 내린 판정이에요. 판정 근거와 확신도(높음·보통·낮음)를 함께 적어요."],
      ["점검자 검토", "점검자가 점검노트 판정을 승인하거나 고친 것이에요. 검토한 판정이 최종이에요."],
      ["오류 (자동 규칙)", "자동 규칙이 기준에 어긋난다고 찾은 곳이에요. 이런 곳이 있는 항목은 부적합으로 판정해요."],
      ["오류 의심", "자동 규칙만으로는 결론이 안 난 곳이에요. 점검노트가 캡처와 함께 보고 항목 판정에 반영해요."],
      ["판정 중", "점검이 끝난 뒤 아직 판정을 내리는 중인 항목이에요. 보통 1~2분 안에 채워져요."],
      ["기준 · 유형 · 위치 · 원인", "기준 = KWCAG 검사항목, 유형 = 같은 기준·같은 규칙에서 나온 문제 묶음(P-001 …), 위치 = 페이지별 해당 요소, 원인 = 같은 요소(여러 페이지 공통 요소는 1곳)"],
      ["우선순위", "1순위 = 기능을 막음(키보드·초점·건너뛰기·언어·대체 텍스트 없음·레이블 등), 2순위 = 쓰기 불편함, 3순위 = 고치면 좋음"],
    ],
    header: (name: string) => `${name} · 웹 접근성 자체진단 결과 보고서`,
    notCert: NOT_CERT_KO,
    tool: TOOL_NAME,
  },
  ja: {
    title: "ウェブアクセシビリティ自己試験結果報告書",
    banner: (draft: boolean) => (draft ? "自己試験の草案・確認中 — 認証や適合表明ではありません" : "自己試験の結果 — 認証や適合表明ではありません"),
    meta: ["対象", "URL", "試験日", "適用規格", "試験ページ数", "試験者確定", "文書の状態", "報告書バージョン・試験回次", "顧客・機関名", "試験実施機関・担当チーム", "作成ツール", "試験環境"],
    std: (name: string) => `${name}（目標とする適合レベル: AA）`,
    howToRead: "読み方",
    readers: [
      ["管理者", "1章の結論の要約だけで状態と優先度がわかります。"],
      ["試験者", "6章 結果と優先度 → 7章 詳細な根拠 → 8章 制約と注意。"],
      ["開発チーム", "Markdown の修正依頼書と Excel の「問題一覧」シート（全箇所の基準資料）を使ってください。"],
    ],
    toc: "この文書の構成",
    sections: ["1. 結果の要約", "2. 指摘事項", "3. 達成基準ごとの結果", "付録A 試験範囲", "付録B 試験方法", "付録C 試験者とツール", "付録D 制約と注意", "付録E 判定の用語と参考資料"],
    conclusion: (m: ReturnType<typeof reportMetrics>, draft: boolean, _s?: ReturnType<typeof summary>) =>
      `自動チェックで ${m.auto_fail.criteria} の達成基準に問題の兆候があり、${m.review.criteria} の達成基準は試験者の確認が必要です。試験者確定は ${m.itemsConfirmed}/${m.itemsTotal} で、${draft ? "本書は確認中の草案です" : "全項目が確定しています"}。`,
    statusHead: ["区分（表示）", "意味", "達成基準", "種類", "箇所", "ページ"],
    statusMeaning: { confirmed_fail: "試験者が不適合と確定", auto_fail: "自動チェックが違反の可能性を検出（未確定）", review: "自動で判断できず試験者の確認が必要" } as Record<IssueState, string>,
    itemStatus: "達成基準の状態",
    itemHead: ["適合（試験者確定）", "不適合（試験者確定）", "適用なし（試験者確定）", "自動の兆候（未確定）", "自動で問題未検出（未確定）", "該当要素なし（自動）", "要確認", "未試験"],
    top: "優先して対応する問題（利用者への影響・共通原因の上位5件）",
    topHead: ["優先度", "ID", "達成基準", "問題", "原因・影響"],
    topNote: "優先度は箇所数ではなく、利用者への影響と共通原因で決めています。",
    submission: "提出情報",
    excelNote: "全箇所の一覧は Excel「問題一覧」シートが基準資料です。",
    background: (site: string, url: string) => [`対象: ${site}（${url}）`, "目的: 代表ページを自己試験し、修正箇所と確認箇所を整理します。", "性格: 自己試験の資料であり、認証や適合表明に代わるものではありません。"],
    wcagEm: (pages: number, _flows: number, sc: ReturnType<typeof scopeInfo>) => [
      ["目標とする適合レベル", "JIS X 8341-3:2016 AA"],
      ["評価対象", `同じサイトのページ ${pages}`],
      [
        "ブラウザ・支援技術",
        `${sc.environments.pages ? `記録された試験ブラウザ: ${sc.environments.browsers.join(", ") || "不明"}・ウィンドウ ${sc.environments.viewports.join(", ")}。` : "Chromium（1280px）。"}${sc.evaluations.assistiveTech ? `支援技術による試験 ${sc.evaluations.assistiveTech}件（${sc.evaluations.assistiveTechs.join(", ")}）` : "支援技術の組み合わせは未試験 — 草案: 入力が必要"}`,
      ],
      ["サンプルの選び方", sc.randomPages ? `構造的サンプル ${Math.max(0, pages - sc.randomPages)} + 無作為サンプル ${sc.randomPages}（構造的サンプルの10%）` : "構造的サンプルのみ（無作為サンプルなし）"],
    ],
    tools: ["試験機関", "試験者", "試験者確定の状態", "作成ツール", "試験エンジン", "意味判断の設定", "試験日時"],
    method: (audit: AiAudit) => [
      "自動チェック: 規則（axe-core 等）と実際のキーボード操作（Tab・Shift+Tab の両方向）で行いました。",
      "判定: 規則で確認できる問題は「不適合（自動）」、問題が出なかった項目は「問題未検出（自動）」とし、適合とは確定していません。",
      audit.attempted ? `意味判断: AI の意見 ${audit.aiFindings}件は確定ではありません。${audit.fallbackFindings ? ` ${audit.fallbackFindings}件は規則判定 fallback です。` : ""}${audit.configFailure ? " 回次設定にも失敗/fallback の記録があります。" : ""}${audit.inconsistent ? " ただし設定は AI 不使用なのに AI の記録があり、原資料の確認が必要です。" : ""}` : "意味判断: AI は使っていません。",
      "収集・範囲: robots.txt に従い、同じテンプレートは代表1ページのみ試験しました。別サイトへ移動したページは範囲外として除外します。",
      "個人情報: 入力欄の文字は隠し、URL は origin・パスと許可した値のみ残しています。",
    ],
    prioHead: ["優先度", "ID", "状態", "達成基準", "問題", "原因・影響"],
    prioSub: "6.1 問題の種類ごとの優先度",
    itemSub: "6.2 達成基準ごとの結果",
    resultHead: ["達成基準", "達成基準名", "自動チェック結果", "試験者判定", "問題数", "根拠ID"],
    count: (k: number, n: number) => (k ? `${k}件・${n}箇所` : "-"),
    detailLead: "各問題は 問題・箇所・影響・対応・根拠 の5行で記載しています。全箇所の一覧は Excel「問題一覧」が基準資料です。キャプチャのオレンジの枠と赤い番号①が該当要素です。キャプチャが画面の一部の場合は、図の説明に元画面の範囲を示します。表示されない要素はキャプチャの代わりに DOM の根拠とキーボード確認手順を記載しています。",
    reviewLead: "この節の項目は自動で判断できず、試験者の確認が必要な箇所です。確認前は修正指示ではありません。",
    sub: { confirmed_fail: "2.1 試験者確定の不適合", auto_fail: "2.2 自動チェックの問題の兆候", review: "2.3 要確認" } as Record<IssueState, string>,
    none: "なし。",
    f: ["問題", "箇所", "影響", "対応", "根拠"],
    where: (r: IssueRecord) => `${causeText(r, true)}・${r.locations.length}箇所`,
    action: (r: IssueRecord) => (r.state === "review" ? `確認: ${r.howToCheck}` : `${r.fix}\n確認: ${r.howToCheck}`),
    basisLine: (r: IssueRecord, prov: string) => `${r.priority}・達成基準 ${r.itemCode} ${r.itemTitle}・出所 ${prov}・根拠ID ${[r.id, ...new Set(r.locations.map((l) => l.shotId).filter(Boolean))].join(", ")}`,
    reviewFix: "試験者が確認して問題と判断した場合に修正します。",
    basis: (r: IssueRecord, stateLabel: string, method: string) =>
      [`達成基準 ${r.itemCode} ${r.itemTitle}`, `判定の状態 ${stateLabel}`, `期待される結果: ${r.expected}`, `試験方法: ${method}`, r.basis ? `判断の根拠: ${r.basis}` : "", `根拠ID: ${[r.id, ...new Set(r.locations.map((l) => l.shotId).filter(Boolean))].join(", ")}`]
        .filter(Boolean)
        .join("\n"),
    method2: { auto: "自動チェック（規則）", confirmed: "自動チェック＋試験者確定", ai: "自動チェック＋AI の意見（未確定）", fallback: "自動チェック＋AI 応答の解釈失敗 → 規則 fallback（未確定）" },
    causeHead: ["#", "原因（セレクタ）", "区分", "影響ページ（キャプチャID）"],
    shared: (n: number) => `共通要素・${n}ページ`,
    single: "個別の要素",
    morePages: (k: number, n: number) => `… ほか ${k}ページ（計 ${n}）`,
    moreCause: (n: number, k: number) => `… 原因 ${n}箇所中 ${k}箇所を表示（全件は Excel「問題一覧」）`,
    figOverview: (id: string, part: boolean, region: { top: number; height: number; total: number }) => `図 ${id}-a・${part ? `ページの一部（全体 ${region.total}px 中 ${region.top}〜${region.top + region.height}px）` : "ページ全体"}の縮小版`,
    figZoom: (id: string) => `図 ${id}-b・該当部分の拡大（ページの一部）`,
    figMeta: (id: string, shot: string, page: string, sel: string) => `問題 ${id}・ページ ${page}（キャプチャ ${shot}）・箇所 ${sel}`,
    figLook: (what: string) => `確認すること: ① の要素 — ${what}`,
    alt: (id: string, kind: "a" | "b", page: string, sel: string, title: string) => `${id} ${kind === "a" ? "ページの縮小版" : "該当部分の拡大"}: ${page} でオレンジの枠と赤い番号1の要素（${sel}）が該当箇所です。問題: ${title}`,
    shotGone: "（スクリーンショットは保存期間の経過または削除により破棄されました）",
    noShot: "（箇所を特定できないためキャプチャはありません）",
    hiddenShot: (sel: string, html: string) => `キャプチャなし — 画面に表示されない要素のため、キャプチャを根拠にしません。\nDOM の根拠: ${sel}${html ? `・${html}` : ""}\nキーボードの根拠: 上の「対応」の確認手順で再現します。`,
    itemOnly: "箇所が特定されていない要確認の達成基準",
    itemOnlyHow: "試験対象ページ（付録A）でこの達成基準を直接確認します。",
    limits: (sc: ReturnType<typeof scopeInfo>, m: ReturnType<typeof reportMetrics>, foot: string, inputNotice: string | null, demo: boolean) => [
      ["自動結果は確定ではない", "自動の兆候は違反の確定ではなく、問題未検出は適合の確定ではありません。"],
      ["要確認", `${metricText(m.review, true)}。\n${foot}`],
      ["試験していない範囲", `試験できなかったページ ${sc.skipped.length}。付録Aにないページは試験していません。`],
      ["代表ページのサンプリング", `同じテンプレートのページは代表1ページのみ（除外 ${sc.groupedSkipped}ページ）。`],
      ["提出情報", inputNotice ? `${inputNotice}${demo ? "。対象 URL がデモ用の場合、実サービスの評価結果ではありません。" : ""}` : "試験機関・試験者・対象 URL が入力されています。ただし草案の場合は試験者確定前です。"],
      ["認証ではない", "本書は認証や適合表明ではありません。"],
      ["キャプチャと個人情報", "入力欄の文字は隠しています。その他の表示内容は外部共有の前に確認してください。"],
    ],
    pageHead: ["キャプチャID", "ページ名", "URL", "選定理由"],
    terms: [
      ["適合・不適合・適用なし", "試験者が確定した結果"],
      ["自動の兆候（未確定）", "自動チェックが検出、試験者は未確定"],
      ["問題未検出（自動）", "自動チェックでは問題が見つからない。適合の確定ではない"],
      ["要確認", "試験者の確認が必要"],
      ["未試験", "試験したページがない、または未確認"],
      ["達成基準・種類・箇所", "種類 = 同じ達成基準・規則・状態の問題のまとまり（P-001 …）、箇所 = ページごとの該当要素"],
    ],
    header: (name: string) => `${name}・ウェブアクセシビリティ自己試験結果報告書`,
    notCert: NOT_CERT_JA,
    tool: "a11ynote（自動チェック＋試験者確認）",
  },
};

const SIZE = 19; // 9.5pt

/**
 * 페이지 안전영역 (twip, 1/20pt). 꼬리말의 "N / 전체" 가 본문에 밀리지 않도록 아래 여백을 넉넉히 둔다.
 * 캡처 최대 크기(px, 96dpi)는 한 쪽에 축소본 + 설명이 함께 들어가고 꼬리말 위 여백이 남도록 보수적으로 잡는다.
 */
export const PAGE_LAYOUT = {
  width: 11906,
  height: 16838,
  margin: { top: 1300, bottom: 1500, left: 1100, right: 1100, header: 600, footer: 640 },
  /** 그림 칸 위·아래 안쪽 여백 (twip) — 그림이 페이지 위쪽에 붙지 않게 */
  figurePad: { top: 200, bottom: 120 },
  overview: { maxW: 600, maxH: 300 },
  zoom: { maxW: 520, maxH: 200 },
  /** 캡처 둘레 회색 틀(px) — 번호·테두리가 그림 가장자리에 닿지 않게 */
  frame: 8,
} as const;
/** 문제 하나에 보여 줄 원인(선택자) 수. 넘으면 "원인 n곳 중 k곳 표시"를 적고 나머지는 Excel 로 안내 */
const CAUSE_SHOWN = 8;

function run(text: string, o: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text, bold: o.bold, size: o.size ?? SIZE, color: o.color });
}

function para(text: string, o: { bold?: boolean; size?: number; color?: string; keepNext?: boolean; after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: o.align,
    children: text.split("\n").flatMap((t, i) => (i ? [new TextRun({ break: 1 }), run(t, o)] : [run(t, o)])),
    spacing: { after: o.after ?? 100, before: o.before },
    keepNext: o.keepNext,
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], pageBreak = false) {
  return new Paragraph({ heading: level, children: [new TextRun(text)], keepNext: true, keepLines: true, pageBreakBefore: pageBreak });
}

function cell(text: string, o: { bold?: boolean; shade?: string; width?: number; size?: number; keepNext?: boolean; mono?: boolean } = {}) {
  return new TableCell({
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.shade && o.shade !== "FFFFFF" ? { type: ShadingType.CLEAR, color: "auto", fill: o.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    // 빈 칸이 생기지 않게 값이 없으면 "-"
    children: (text?.trim() ? text : "-").split("\n").map((t) => new Paragraph({ keepLines: true, keepNext: o.keepNext, children: [o.mono ? new TextRun({ text: t, size: 16, font: { ascii: "Consolas", hAnsi: "Consolas" } }) : run(t, { bold: o.bold, size: o.size ?? 17 })] })),
  });
}

type CellSpec = { text: string; shade?: string; bold?: boolean; mono?: boolean };
/**
 * keep: 페이지 끝 고아 방지.
 *  - "all": 표 전체를 한 쪽에 (짧은 오류 카드)
 *  - "head": 머리글 행 + 첫 행을 함께 (긴 표가 머리글만 남기고 넘어가지 않게)
 */
function table(widths: number[], head: string[] | null, body: CellSpec[][], keep: "all" | "head" | "none" = "head") {
  const borders = { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE };
  const rows: TableRow[] = [];
  // 머리글 행은 페이지를 넘어가면 다음 쪽에 다시 나온다 (tableHeader)
  if (head) rows.push(new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => cell(h, { bold: true, shade: "DCE4F7", width: widths[i], keepNext: keep !== "none" && body.length > 0 })) }));
  body.forEach((r, k) => {
    const keepNext = k < body.length - 1 && (keep === "all" || (keep === "head" && k === 0 && !head));
    rows.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c.text, { shade: c.shade, bold: c.bold, mono: c.mono, width: widths[i], keepNext })) }));
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows });
}

/** 한눈에 보기: 상태별 큰 숫자 칸 (숫자 · 이름 · 작은 설명) */
function tiles(items: { big: string; label: string; sub: string; shade: string; color: string }[]) {
  const white = { style: BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: white },
    rows: [
      new TableRow({
        cantSplit: true,
        children: items.map(
          (t) =>
            new TableCell({
              width: { size: Math.floor(100 / items.length), type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: "auto", fill: t.shade },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [
                new Paragraph({ children: [new TextRun({ text: t.big, bold: true, size: 44, color: t.color })] }),
                new Paragraph({ children: [run(t.label, { bold: true, size: 18, color: t.color })] }),
                new Paragraph({ children: [run(t.sub, { size: 15, color: "444444" })] }),
              ],
            }),
        ),
      }),
    ],
  });
}

/** 이미지와 설명을 한 칸에 넣은 나뉘지 않는 묶음. 한 쪽에 안 들어가면 통째로 다음 쪽으로 넘어간다 */
function figure(img: Buffer, w: number, h: number, captions: string[], alt: { name: string; description: string }) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            margins: { top: PAGE_LAYOUT.figurePad.top, bottom: PAGE_LAYOUT.figurePad.bottom, left: 0, right: 0 },
            children: [
              new Paragraph({ keepNext: true, keepLines: true, spacing: { before: 60 }, children: [new ImageRun({ type: "png", data: img, transformation: { width: w, height: h }, altText: { name: alt.name, title: alt.name, description: alt.description } })] }),
              ...captions.map((c, i) => new Paragraph({ keepLines: true, keepNext: i < captions.length - 1, spacing: { before: i ? 0 : 40 }, children: [run(c, { size: 15, color: "444444" })] })),
            ],
          }),
        ],
      }),
    ],
  });
}

const gap = (after = 80) => new Paragraph({ children: [], spacing: { after } });

/** 보고서 본문 폭(약 16.6cm)에 맞춘 크기. 최대 높이를 넘으면 비율을 지켜 줄인다 */
/** 캡처 둘레에 옅은 회색 틀을 둘러 번호·주황 테두리가 그림 가장자리(=페이지 여백)에 닿지 않게 한다 */
async function framed(img: Buffer): Promise<Buffer> {
  const f = PAGE_LAYOUT.frame;
  return sharp(img).extend({ top: f, bottom: f, left: f, right: f, background: "#E6E9EF" }).png().toBuffer();
}

async function fit(img: Buffer, maxW: number, maxH: number) {
  const meta = await sharp(img).metadata();
  const w0 = meta.width ?? maxW;
  const h0 = meta.height ?? maxH;
  const k = Math.min(1, maxW / w0, maxH / h0);
  return { w: Math.round(w0 * k), h: Math.round(h0 * k) };
}

export interface ReportOptions {
  /** 캡처 불러오기 (테스트에서 바꿔 끼움) */
  loadShot?: (key: string) => Promise<Buffer | null>;
  /** 직전 회차와 비교한 결과 (있으면 결론 요약에 "해결 · 남음 · 새로 생김"을 싣는다) */
  rescan?: RescanSummary | null;
}

/** 재점검 요약: 위치(발견 사항) 기준 개수 */
export interface RescanSummary {
  baseDate: string;
  resolved: number;
  persisting: number;
  added: number;
  /** 비교 조건이 달라 그대로 비교하기 어려운 이유 (엔진·기준 버전 차이 등) */
  warnings: string[];
}

export async function buildReport(v: ScanView, opts: ReportOptions = {}): Promise<Buffer> {
  const ja = v.pack.locale === "ja";
  const T = ja ? TXT.ja : TXT.ko;
  const lang = ja ? "ja" : "ko";
  const loadShot = opts.loadShot ?? loadShotFromStorage;
  const s = summary(v);
  const issues = issueRecords(v);
  const rows = itemRows(v, issues);
  const m = reportMetrics(v, issues);
  const sc = scopeInfo(v);
  const audit = aiAudit(v);
  const gate = scopeGate(v);
  const sub = submissionInfo(v, ja);
  const draft = !s.allConfirmed || gate.blocked || sub.incomplete;
  const status = docStatus(s, ja, gate, sub.incomplete);
  const bannerText = gate.blocked
    ? (ja ? "範囲確認用の草案 — 提出不可・認証や適合表明ではありません" : "범위 검토 초안 — 제출용 아님 · 품질인증서나 적합성 선언이 아니에요")
    : sub.incomplete && s.allConfirmed
      ? (ja ? "自己試験の草案 · 提出情報の入力待ち — 認証や適合表明ではありません" : "자체진단 초안 · 제출 정보 입력 필요 — 품질인증서나 적합성 선언이 아니에요")
      : T.banner(draft);
  const inputNotice = draftInputText(sub, ja);
  const scopeDiag = scopeDiagnostics(v);
  const foot = reviewFootnote(m.reviewDetail, ja);
  const ranked = byPriority(issues.filter((x) => x.state !== "review"));
  const elementGroups = ja ? [] : sameElementGroups(byPriority(issues));
  const groupOf = new Map<string, string[]>(elementGroups.flatMap((g) => g.ids.map((id) => [id, g.ids.filter((x) => x !== id)] as [string, string[]])));
  // 부분마다 따로 모은 뒤 맨 끝에서 순서대로 붙인다: 표지 → 요약 → 지적사항 → 항목별 판정 → 부록
  let out: (Paragraph | Table)[] = [];
  const cover = out;
  const kv = (pairs: [string, string, string?][], widths = [26, 74], keep: "all" | "head" = "head") => table(widths, null, pairs.map(([a, b, sh]) => [{ text: a, bold: true, shade: "F1F3F7" }, { text: b, shade: sh }]), keep);

  // ── 표지 (한 장에 상태·읽는 방법·구성까지) ──
  out.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 400, after: 120 }, children: [new TextRun({ text: T.title, bold: true, size: 40 })] }));
  out.push(
    new Paragraph({
      spacing: { after: 240 },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: gate.blocked ? "FCE4E4" : draft ? "FDF1D6" : "EAF5EE" },
      children: [new TextRun({ text: ` ${bannerText} `, bold: true, size: 20, color: gate.blocked ? "8A1C1C" : draft ? "7A4A00" : "1D5E34" })],
    }),
  );
  if (inputNotice) {
    out.push(
      new Paragraph({
        spacing: { after: 160 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "FDE2E2" },
        children: [new TextRun({ text: ` ${inputNotice} `, bold: true, size: 19, color: "8A1C1C" })],
      }),
    );
  }
  out.push(
    kv([
      [T.meta[0], v.project.name],
      [T.meta[1], sub.target, sub.demo ? "FDE2E2" : undefined],
      [T.meta[2], dateKst(v.scan.createdAt)],
      [T.meta[3], T.std(v.scan.packVersion ?? v.pack.name)],
      [T.meta[4], `${m.pagesChecked}`],
      [T.meta[5], ja ? `${m.itemsConfirmed} / ${m.itemsTotal}` : `${s.confirmed} / ${s.total}개 항목 (점검자 검토 ${s.reviewed}개)`],
      [T.meta[6], status, gate.blocked ? "FCE4E4" : draft ? "FDF1D6" : undefined],
      [T.meta[7], `${REPORT_TEMPLATE_VERSION} · ${dateKst(v.scan.finishedAt ?? v.scan.createdAt)} · ${ja ? "試験" : "점검"} ${v.scan.id.slice(0, 8)}`],
      [T.meta[8], sub.org, "FDE2E2"],
      [T.meta[9], sub.auditor, v.project.auditorName?.trim() ? undefined : "FDE2E2"],
      [T.meta[10], T.tool],
      [T.meta[11], sub.environment],
    ]),
  );
  if (gate.blocked || scopeDiag.duplicatePages || scopeDiag.suspectPages.length || scopeDiag.redirectedPages) {
    const details = [
      scopeDiag.duplicatePages ? `같은 최종 URL 페이지 ${scopeDiag.duplicateScreenTotal}개가 ${scopeDiag.duplicateGroups}묶음으로 반복(추가 중복 ${scopeDiag.duplicatePages}개)` : "",
      scopeDiag.suspectPages.length ? `인트로·리다이렉트·접속 안내 의심 페이지 ${scopeDiag.suspectPages.length}개` : "",
      scopeDiag.redirectedPages ? `요청 주소와 실제 도착 주소가 다른 페이지 ${scopeDiag.redirectedPages}개` : "",
    ].filter(Boolean).join(" · ");
    out.push(
      new Paragraph({
        spacing: { before: 140, after: 160 },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "FCE4E4" },
        children: [
          new TextRun({
            text: gate.blocked
              ? ` 범위 검토 초안 (제출용 아님): ${gate.reasons.join(", ")}. (${details}) 메인·주요 업무 페이지 주소로 다시 점검해야 제출할 수 있어요. `
              : ` 범위를 확인해 주세요: ${details}. 대표 페이지가 맞는지 확인한 다음 제출해 주세요. `,
            bold: true,
            size: 17,
            color: "8A1C1C",
          }),
        ],
      }),
    );
  }

  // ── 1. 결과 요약: 결론 한 문장 → 상태별 수치 → 우선 처리할 오류 ──
  const summaryPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[0], HeadingLevel.HEADING_1, true));
  if (gate.blocked) out.push(para(ja ? "※ 検査範囲が未確定のため、以下の数値は範囲確認用の参考値です。" : "※ 점검 범위가 아직 확정되지 않아 아래 숫자는 참고값이에요. 제출 전에 낼 결과로 쓰지 말아 주세요.", { bold: true, color: "8A1C1C" }));
  out.push(para(T.conclusion(m, draft, s), { bold: true }));
  if (!ja) {
    const TONE: Record<IssueState, string> = { confirmed_fail: "8A1C1C", auto_fail: "A23B3B", review: "7A4A00" };
    void TONE;
    const vc = s.verdictCounts;
    out.push(
      tiles([
        { big: s.confirmedRate === null ? "판정 중" : `${s.confirmedRate}%`, label: "준수율", sub: "적합 ÷ (적합 + 부적합), 해당 없음 제외", shade: "F1F3F7", color: "222222" },
        { big: `${vc.fail}개 항목`, label: "부적합", sub: `오류 유형 ${m.confirmed_fail.types + m.auto_fail.types}개 · 위치 ${m.confirmed_fail.locations + m.auto_fail.locations}곳`, shade: "F9D3D3", color: "8A1C1C" },
        { big: `${vc.pass}개 항목`, label: "적합", sub: `해당 없음 ${vc.na}개${vc.pending ? ` · 판정 중 ${vc.pending}개` : ""} · 점검자 검토 ${s.reviewed}개`, shade: "D9F0E1", color: "1D5E34" },
      ]),
    );
    out.push(para(PLAIN_LABEL.readOrder, { size: 17, color: "333333", before: 80, after: 120 }));
    // 경영진·담당자용 세 문장 (같은 데이터에서 뽑은 고정 문구)
    const fixList = issues.filter((x) => x.state !== "review");
    const urgent = fixList.filter((x) => x.priorityRank < 200).length;
    const sharedAll = fixList.flatMap((x) => causeGroups(x).filter((g) => g.shared));
    const sharedPages = new Set(sharedAll.flatMap((g) => g.pages.map((p) => p.pageStateId))).size;
    const exec = [
      urgent ? `먼저 고칠 문제(1순위, 기능을 막음)는 ${urgent}가지예요. 고치기 전에는 해당 사용자가 그 기능을 끝까지 쓸 수 없어요.` : "기능을 막는 1순위 문제는 없어요.",
      sharedAll.length ? `여러 페이지에 반복되는 공통 요소 ${sharedAll.length}곳만 고쳐도 페이지 ${sharedPages}개의 문제가 같이 해결돼요.` : "",
      m.review.types ? `자동 규칙으로 결론이 안 난 오류 의심 ${m.review.types}가지는 점검노트가 캡처를 보고 항목 판정에 반영했어요.` : "",
      opts.rescan ? `지난 점검(${opts.rescan.baseDate})과 비교하면 해결 ${opts.rescan.resolved}곳, 남음 ${opts.rescan.persisting}곳, 새로 생김 ${opts.rescan.added}곳이에요 (서비스의 재점검 비교 화면과 같은 기준).${opts.rescan.warnings.length ? ` 비교 조건 차이: ${opts.rescan.warnings.join(", ")}.` : ""}` : "",
    ].filter(Boolean);
    out.push(para("한 줄로 보면", { bold: true, size: 18, keepNext: true, after: 40 }));
    out.push(para(exec.map((x) => `• ${x}`).join("\n"), { size: 18, after: 120 }));
    out.push(gap(80));
  }
  out.push(
    table(
      [30, 14, 14, 14, 14, 14],
      [T.statusHead[0], ...T.statusHead.slice(2)],
      STATES.map((st) => [
        { text: stateName(lang, st), shade: STATE_SHADE[st], bold: true },
        { text: String(m[st].criteria) },
        { text: String(m[st].types) },
        { text: String(m[st].locations) },
        { text: String(m[st].pages) },
      ]),
      "all",
    ),
  );
  // 같은 수치의 문장형 (Excel·Markdown 과 같은 글자). 표를 읽지 않는 화면낭독기 사용자도 같은 정보를 얻는다
  out.push(para(STATES.map((st) => `${stateName(lang, st)}: ${metricText(m[st], ja)}`).join("\n"), { size: 16, color: "555555", before: 60 }));
  const top = ranked.slice(0, 5);
  if (top.length) {
    out.push(para(T.top, { bold: true, before: 200, after: 60, keepNext: true }));
    out.push(
      table(
        [16, 13, 8, 36, 27],
        T.topHead,
        top.map((x) => [{ text: x.priority, bold: x.priorityRank < 200 }, { text: `${x.id}\n${STATE_TAG[lang][x.state]}`, shade: STATE_SHADE[x.state] }, { text: x.itemCode }, { text: x.title }, { text: causeText(x, ja) }]),
        "all",
      ),
    );
    out.push(para(T.topNote, { size: 16, color: "555555", before: 60 }));
  }

  // ── 부록 A. 점검 범위 ──
  const scopePart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[3], HeadingLevel.HEADING_1, true));
  const lines = scopeLines(v, ja);
  out.push(kv([...(T.wcagEm(m.pagesChecked, sc.flowPages, sc) as [string, string][]), ...(lines.filter(([k]) => /범위|선정|점검하지|수집|注意|範囲|選定|試験していない|収集/.test(k)) as [string, string][])]));
  if (!ja) {
    const ss = sampleSummary(v);
    out.push(heading("표본 선정 근거", HeadingLevel.HEADING_2));
    out.push(para(`점검할 페이지 수는 기준에 정해져 있지 않아요. 그래서 개수 대신 페이지 유형과 핵심 흐름을 빠짐없이 덮는 것을 기준으로 골랐어요. 찾은 페이지 ${ss.found}개${ss.templates !== null ? `(서로 다른 모양 ${ss.templates}가지)` : ""} 중 ${ss.checked}개를 점검했어요.${ss.missed ? ` 한 번에 점검할 수 있는 수(${ss.perScan ?? "-"}개) 때문에 유형별 대표 ${ss.missed}개는 이번에 못 봤고, 아래 표에 밝혔어요.` : ""}`, { size: 18 }));
    out.push(para("표본 구성", { bold: true, size: 18, before: 120, after: 40, keepNext: true }));
    out.push(table([6, 16, 30, 12, 12, 24], ["번호", "페이지", "주소", "유형", "선정 방식", "선정 이유"], sampleRows(v).map((r) => [{ text: String(r.no) }, { text: r.label }, { text: r.url, mono: true }, { text: r.type }, { text: r.method }, { text: r.reason }])));
    out.push(para("유형별 커버리지", { bold: true, size: 18, before: 160, after: 40, keepNext: true }));
    out.push(table([22, 12, 14, 52], ["유형", "점검", "한도로 제외", "설명"], typeCoverage(v).map((c) => [{ text: c.type, bold: true }, { text: String(c.checked) }, { text: c.missed ? String(c.missed) : "-", shade: c.missed ? "FDF1D6" : undefined }, { text: c.note }]), "all"));
    const missedList = v.scan.plan?.sampling?.uncovered ?? [];
    if (missedList.length) {
      out.push(para("한도 때문에 이번에 못 본 대표 페이지", { bold: true, size: 18, before: 160, after: 40, keepNext: true }));
      out.push(table([46, 14, 40], ["주소", "유형", "고른 이유"], missedList.slice(0, 30).map((u) => [{ text: u.url, mono: true }, { text: pageType(u.url, u.reason) }, { text: plainReason(u.reason) }])));
      if (missedList.length > 30) out.push(para(`… 외 ${missedList.length - 30}개`, { size: 16, color: "555555" }));
      out.push(para("이 페이지들은 다음 점검에서 먼저 보면 유형을 모두 덮을 수 있어요.", { size: 16, color: "555555", before: 40 }));
    }
    out.push(para("무작위 표본 기록", { bold: true, size: 18, before: 160, after: 40, keepNext: true }));
    out.push(kv([["뽑은 수", `${ss.random}개 (대상 ${ss.randomPool}개 중)`], ["뽑는 방법", RANDOM_HOW]], [22, 78]));
    out.push(para(SAMPLE_LIMIT, { size: 16, color: "555555", before: 80 }));
  }

  // ── 부록 C. 점검자와 도구 ──
  const toolsPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[5], HeadingLevel.HEADING_1));
  out.push(
    kv([
      [T.tools[0], sub.org, "FDE2E2"],
      [T.tools[1], sub.auditor, v.project.auditorName?.trim() ? undefined : "FDE2E2"],
      [T.tools[2], status],
      [T.tools[3], T.tool],
      [T.tools[4], sc.engineVersion],
      [T.tools[5], sc.aiConfig],
      [T.tools[6], sc.when],
    ]),
  );

  // ── 부록 B. 점검 방법과 판정 기준 ──
  const methodPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[4], HeadingLevel.HEADING_1));
  for (const line of T.method(audit)) out.push(para(`• ${line}`));
  if (!ja) {
    out.push(heading("판정 방식", HeadingLevel.HEADING_2));
    out.push(kv(VERDICT_RULES_KO, [22, 78], "all"));
    out.push(heading("항목별 판정 기준", HeadingLevel.HEADING_2));
    out.push(para("항목마다 무엇을 어떻게 점검했고, 어떤 경우에 적합·부적합으로 보는지 적었어요. 항목 번호와 이름은 KWCAG 2.2 원문 그대로예요.", { size: 17, color: "444444" }));
    out.push(
      table(
        [11, 20, 27, 21, 21],
        ["기준 코드", "검사항목", "이렇게 점검했어요", "이러면 적합", "이러면 부적합"],
        v.pack.items.map((it) => {
          const c = KWCAG22_CRITERIA[it.code];
          return [{ text: it.code }, { text: it.title, bold: true }, { text: c?.check ?? it.how }, { text: c?.pass ?? "-" }, { text: c?.fail ?? "-" }];
        }),
      ),
    );
  }
  // 수동·보조기술·사용자 평가: 기록이 없으면 없다고 적는다 (자동 결과로 대신하지 않음)
  {
    const es = evaluationSummary(v.evaluations ?? []);
    const none = ja ? "記録なし" : "기록 없음";
    out.push(heading(ja ? "手動試験・支援技術・利用者評価" : "수동 점검 · 보조기술 점검 · 장애인 사용자 평가", HeadingLevel.HEADING_2));
    out.push(
      kv(
        [
          [EVAL_KIND_LABEL[lang].manual, es.manual ? `${es.manual}${ja ? "件" : "건"}` : none],
          [EVAL_KIND_LABEL[lang].assistive_tech, es.assistiveTech ? `${es.assistiveTech}${ja ? "件" : "건"} (${es.assistiveTechs.join(", ")})` : none],
          [EVAL_KIND_LABEL[lang].user_testing, es.userTesting ? `${es.userTesting}${ja ? "件" : "건"} · ${ja ? "参加者" : "참여자"} ${es.participants}${ja ? "名（仮名）" : "명 (가명)"}` : none],
          [ja ? "扱い" : "판정과의 관계", ja ? "これらの記録は達成基準の状態を自動では変えません。試験者が達成基準の判定を別に記録します。訂正は新しい記録で行い、以前の記録は履歴として残ります。" : "이 기록은 항목 상태를 자동으로 바꾸지 않아요. 점검자가 항목 판정을 따로 남겨요. 정정은 새 기록으로 하고, 이전 기록은 이력으로 남아요."],
        ] as [string, string][],
        [35, 65],
      ),
    );
    const cur = currentEvaluations(v.evaluations ?? []);
    if (cur.length) {
      out.push(
        table(
          [14, 10, 22, 14, 40],
          ja ? ["種類", "達成基準", "方法・支援技術・環境", "結果", "タスク・メモ"] : ["종류", "기준 코드", "방법·보조기술·환경", "결과", "과업·메모"],
          cur.map((e) => [
            { text: EVAL_KIND_LABEL[lang][e.kind] },
            { text: e.itemCode ?? "-" },
            { text: [e.method, [e.assistiveTech, e.assistiveTechVersion].filter(Boolean).join(" "), [e.browser, e.browserVersion].filter(Boolean).join(" "), e.os].filter(Boolean).join(" / ") || "-" },
            { text: EVAL_RESULT_LABEL[lang][e.result] },
            { text: [e.participantCode ? `${e.participantCode}${e.participantProfile ? ` (${e.participantProfile})` : ""}` : "", e.task, e.notes].filter(Boolean).join("\n") || "-" },
          ]),
        ),
      );
    }
  }

  // ── 3. 항목별 판정 ──
  const itemsPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[2], HeadingLevel.HEADING_1, true));
  const c = s.counts;
  if (!ja) {
    const vByCode = new Map((v.verdicts ?? []).map((x) => [x.code, x]));
    out.push(para(summaryLine(s, ja).split(" / ").pop() ?? "", { size: 16, color: "555555", before: 60, after: 120 }));
    out.push(
      table(
        [9, 22, 19, 30, 10, 10],
        T.resultHead,
        rows.map((r) => {
          const x = vByCode.get(r.code);
          return [
            { text: r.code },
            { text: r.title },
            { text: verdictText(x), shade: x?.verdict ? VERDICT_SHADE[x.verdict] : undefined, bold: Boolean(x?.verdict) },
            { text: x?.verdict && x.source !== "human" ? x.basis || "-" : x?.reviewed ? x.basis || "점검자 판정" : "-" },
            { text: x?.reviewed ? "완료" : "-" },
            { text: r.evidence.join(", ") || "-" },
          ];
        }),
      ),
    );
  } else {
  out.push(
    table(
      [12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5],
      T.itemHead,
      [[c.pass, c.fail, c.na, c.fail_auto, c.clear_auto, c.na_auto, c.review, c.untested].map((n) => ({ text: String(n) }))],
      "all",
    ),
  );
  out.push(para(summaryLine(s, ja).split(" / ").pop() ?? "", { size: 16, color: "555555", before: 60, after: 160 }));
  out.push(
    table(
      [9, 37, 15, 13, 12, 14],
      T.resultHead,
      rows.map((r) => [
        { text: r.code },
        { text: ja && r.level ? `${r.title}（${r.level}）` : r.title },
        { text: AUTO_LABEL[lang][r.auto], shade: AUTO_SHADE[r.auto] },
        { text: HUMAN_LABEL[lang][r.human], shade: HUMAN_SHADE[r.human], bold: r.human === "pass" || r.human === "fail" || r.human === "na" },
        { text: T.count(r.evidence.length, r.spots) },
        { text: r.evidence.join(", ") || "-" },
      ]),
    ),
  );
  }

  // ── 2. 지적사항: 오류 하나에 카드 한 장 (설명 + 캡처 + 고치는 방법) ──
  // 결과표가 다음 페이지로 넘어간 경우, 표의 마지막 행만 남은 빈 페이지를 만들지 않고
  // 상세 근거를 이어 붙여 제출용 문서의 흐름을 유지한다.
  const findingsPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[1], HeadingLevel.HEADING_1, true));
  out.push(para(T.detailLead, { color: "444444", size: 17 }));
  const shotCache = new Map<string, Buffer | null>();
  let figNo = 0;
  // 화면에 보이지 않는 요소(스킵 링크 목적지 문제, 크기가 거의 0인 요소)는 캡처를 증거로 쓰지 않는다
  const hiddenEvidence = (rec: IssueRecord): boolean => {
    if (rec.variant === "skip_destination") return true;
    const b = rec.sample.box;
    return Boolean(b && (b.w <= 2 || b.h <= 2));
  };
  const evidence = async (rec: IssueRecord) => {
    const muted = { size: 16, color: "555555" } as const;
    if (hiddenEvidence(rec)) {
      const loc = rec.locations[0];
      return out.push(para(T.hiddenShot(loc?.selector ?? rec.sample.selector ?? "-", clip(loc?.html ?? rec.sample.html ?? "", 120)), muted));
    }
    const loc = rec.locations.find((l) => l.hasBox && l.shotId) ?? null;
    if (!loc) return out.push(para(T.noShot, muted));
    const page = v.pages.find((x) => x.id === loc.pageStateId);
    if (!page?.screenshotKey) return out.push(para(page?.screenshotDeletedAt ? T.shotGone : T.noShot, muted));
    if (!shotCache.has(page.screenshotKey)) shotCache.set(page.screenshotKey, await loadShot(page.screenshotKey).catch(() => null));
    const shot = shotCache.get(page.screenshotKey);
    const f = v.findings.find((x) => x.id === loc.findingId) ?? rec.sample;
    if (!shot || !f.box) return out.push(para(T.noShot, muted));
    const ev = await evidenceImages(shot, f.box, { scale: page.screenshotScale, origin: page.screenshotOrigin, label: "1", window: 680, cropWidth: 1120, pad: 120 }).catch(() => null);
    if (!ev) return out.push(para(T.noShot, muted));
    figNo++;
    // 설명은 문제당 한 번: 축소본에는 그림 번호만, 확대본(없으면 축소본)에 위치·확인할 것을 붙인다
    const meta = T.figMeta(rec.id, loc.shotId ?? "-", loc.pageLabel, loc.selector);
    const look = T.figLook(rec.title);
    // 한국어: 확대본이 있으면 확대 한 장만 싣는다 (위치는 그림 설명의 화면·선택자로 안내). 일본어는 축소본+확대본 그대로
    if (!ja && ev.zoom) {
      const zImg = await framed(ev.zoom);
      const z = await fit(zImg, PAGE_LAYOUT.overview.maxW, PAGE_LAYOUT.overview.maxH);
      out.push(gap(60));
      out.push(figure(zImg, z.w, z.h, [`그림 ${rec.id}-a · 오류 부위 확대 (화면 일부, 주변 여백 포함)`, meta, look], { name: `${rec.id}-a`, description: T.alt(rec.id, "a", loc.pageLabel, loc.selector, rec.title) }));
      return;
    }
    const ovImg = await framed(ev.overview);
    const o = await fit(ovImg, PAGE_LAYOUT.overview.maxW, PAGE_LAYOUT.overview.maxH);
    out.push(gap(60)); // 표끼리 붙으면 일부 프로그램이 한 표로 합친다
    out.push(figure(ovImg, o.w, o.h, ev.zoom ? [T.figOverview(rec.id, ev.overviewPart, ev.region)] : [T.figOverview(rec.id, ev.overviewPart, ev.region), meta, look], { name: `${rec.id}-a`, description: T.alt(rec.id, "a", loc.pageLabel, loc.selector, rec.title) }));
    if (ev.zoom) {
      const zImg = await framed(ev.zoom);
      const z = await fit(zImg, PAGE_LAYOUT.zoom.maxW, PAGE_LAYOUT.zoom.maxH);
      out.push(gap(40));
      out.push(figure(zImg, z.w, z.h, [T.figZoom(rec.id), meta, look], { name: `${rec.id}-b`, description: T.alt(rec.id, "b", loc.pageLabel, loc.selector, rec.title) }));
    }
  };
  for (const st of STATES) {
    const list = byPriority(issues.filter((x) => x.state === st));
    out.push(heading(`${T.sub[st]} — ${metricText(m[st], ja)}`, HeadingLevel.HEADING_2));
    if (st === "review" && list.length) out.push(para(T.reviewLead, { size: 17, color: "444444" }));
    if (!list.length) out.push(para(T.none));
    for (const rec of list) {
      out.push(heading(`${rec.id} ${STATE_TAG[lang][rec.state]} [${rec.itemCode}] ${rec.title}`, HeadingLevel.HEADING_3));
      const first = rec.locations[0];
      const where = `${T.where(rec)}${first ? `\n${first.pageLabel} · ${first.selector}` : ""}`;
      const basis = [T.basisLine(rec, provenanceText(rec, ja)), verificationLine(v, rec, ja)].filter(Boolean).join("\n");
      // 한국어: 문제 하나를 카드 한 장으로 (요약 띠 → 기준 원문·쉬운 설명·누가 불편 → 수정 전·후 → 개선 방향 → 확인 → 근거).
      // 쉬운 설명이 문제·영향·조치를 대신하므로 같은 말을 두 번 싣지 않는다. 일본어는 기존 5줄 카드 그대로
      const pg = plainGuide(rec, ja);
      if (pg) {
        const review = rec.state === "review";
        const L = (text: string): CellSpec => ({ text, bold: true, shade: "F1F3F7" });
        out.push(
          new Paragraph({
            keepNext: true,
            spacing: { after: 60 },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: STATE_SHADE[rec.state] },
            children: [new TextRun({ text: ` ${review ? "판정 반영" : rec.priority} · ${STATE_KO[rec.state]} · ${pg.scope}${groupOf.get(rec.id)?.length ? ` · 같은 요소: ${groupOf.get(rec.id)!.join(", ")}` : ""} `, bold: true, size: 17 })],
          }),
        );
        const rowsCard: CellSpec[][] = [
          [L(PLAIN_LABEL.criterion), { text: pg.criterion, shade: STATE_SHADE[rec.state] }],
          [L(PLAIN_LABEL.problem), { text: pg.problem, bold: true }],
          [L(PLAIN_LABEL.who), { text: pg.who }],
          [L(PLAIN_LABEL.where), { text: where }],
        ];
        if (pg.before) rowsCard.push([L(PLAIN_LABEL.before), { text: `${pg.before.selector}\n${pg.before.html}`, mono: true }]);
        if (pg.after) rowsCard.push([L(pg.after.based ? PLAIN_LABEL.afterBased : PLAIN_LABEL.afterGeneric), { text: pg.after.code, mono: true, shade: "EAF5EE" }]);
        if (pg.after?.note) rowsCard.push([L(PLAIN_LABEL.exampleHow), { text: pg.after.note }]);
        rowsCard.push(
          [L(review ? PLAIN_LABEL.reviewSteps : PLAIN_LABEL.steps), { text: numbered(pg.core) }],
          [L(PLAIN_LABEL.verify), { text: pg.verify }],
        );
        const terms = termsIn([pg.criterion, pg.problem, pg.who, ...pg.core, pg.verify].join(" "));
        if (terms.length) rowsCard.push([L("용어 풀이"), { text: terms.join("\n") }]);
        rowsCard.push([L(T.f[4]), { text: basis }]);
        out.push(table([20, 80], null, rowsCard, "head"));
      } else {
        // 오류 카드: 문제 · 위치 · 영향 · 조치 · 근거 (고정 문구만, AI 문장 없음). 카드는 한 쪽에 묶는다
        out.push(
          kv(
            [
              [T.f[0], rec.actual],
              [T.f[1], where],
              [T.f[2], rec.why || "-"],
              [T.f[3], T.action(rec)],
              // 자동 점검 결과 AI 검수가 있으면 고정 문구 한 줄을 덧붙인다 (의미 후보 AI 판단은 "출처"에 따로 표시)
              [T.f[4], basis, STATE_SHADE[rec.state]],
            ],
            [16, 84],
            "all",
          ),
        );
      }
      const groups = causeGroups(rec);
      if (groups.length > 1 || groups[0]?.pages.length > 1) {
        const shown = groups.slice(0, CAUSE_SHOWN);
        const pageLine = (p: (typeof groups)[number]["pages"][number]) => `${p.label}${p.shotId ? ` (${p.shotId})` : ""}`;
        const body = shown.map((g, i) => [
          { text: String(i + 1) },
          { text: g.selector },
          { text: g.shared ? T.shared(g.pages.length) : T.single },
          { text: ja ? (g.pages.length > 6 ? `${g.pages.slice(0, 5).map(pageLine).join("\n")}\n${T.morePages(g.pages.length - 5, g.pages.length)}` : g.pages.map(pageLine).join("\n")) : g.pages.length > 3 ? `${g.pages.slice(0, 2).map(pageLine).join(", ")} ${T.morePages(g.pages.length - 2, g.pages.length)}` : g.pages.map(pageLine).join(", ") },
        ]);
        if (groups.length > CAUSE_SHOWN) body.push([{ text: "…" }, { text: T.moreCause(groups.length, CAUSE_SHOWN) }, { text: "-" }, { text: "-" }]);
        out.push(gap(40));
        out.push(table([5, 45, 18, 32], T.causeHead, body, "head"));
      }
      await evidence(rec);
      out.push(gap(120));
    }
  }
  const itemOnly = rows.filter((r) => r.auto === "review" && r.human !== "pass" && r.human !== "fail" && r.human !== "na" && !r.evidence.length);
  if (itemOnly.length) {
    out.push(heading(T.itemOnly, HeadingLevel.HEADING_3));
    if (ja) out.push(table([12, 40, 48], [T.resultHead[0], T.resultHead[1], T.f[2]], itemOnly.map((r) => [{ text: r.code }, { text: r.title }, { text: T.itemOnlyHow }])));
    else {
      const vByCode = new Map((v.verdicts ?? []).map((x) => [x.code, x]));
      out.push(para(T.itemOnlyHow, { size: 17, color: "444444" }));
      out.push(table([10, 26, 22, 42], ["기준 코드", "검사항목", "점검노트 판정", "판정 근거"], itemOnly.map((r) => {
        const x = vByCode.get(r.code);
        return [{ text: r.code }, { text: r.title }, { text: verdictText(x), shade: x?.verdict ? VERDICT_SHADE[x.verdict] : undefined }, { text: x?.basis || "-" }];
      })));
    }
  }

  // ── 부록 D. 한계와 유의사항 ──
  const limitsPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[6], HeadingLevel.HEADING_1, true));
  out.push(kv(T.limits(sc, m, foot, inputNotice, sub.demo) as [string, string][], [28, 72]));
  // 일본어는 표본 구성 표가 없으므로 점검한 페이지 목록을 부록 A 에 붙인다
  if (ja) {
    scopePart.push(heading("試験したページ", HeadingLevel.HEADING_2));
    scopePart.push(table([11, 22, 42, 25], T.pageHead, v.pages.map((p, i) => [{ text: `S${String(i + 1).padStart(2, "0")}` }, { text: p.label }, { text: p.url }, { text: p.reason ?? "-" }])));
  }
  // ── 부록 E. 판정 용어 ── (기준 외 참고·자동 통과 원본은 Excel 에만 둔다)
  const termsPart: (Paragraph | Table)[] = (out = []);
  out.push(heading(T.sections[7], HeadingLevel.HEADING_1));
  out.push(kv(T.terms as [string, string][], [35, 65]));
  out.push(heading(ja ? "参考資料" : "참고 기준", HeadingLevel.HEADING_2));
  out.push(kv(REFS[lang] as [string, string][], [45, 55]));
  out.push(new Paragraph({ spacing: { before: 300 }, children: [run(T.notCert, { bold: true })] }));

  // 실행 환경에 맞는 CJK 글꼴을 기본으로 선택한다. 기관 표준 글꼴은
  // REPORT_KO_FONT로 명시적으로 덮어쓸 수 있다.
  const koFont = process.env.REPORT_KO_FONT ?? (process.platform === "win32" ? "Malgun Gothic" : process.platform === "darwin" ? "Apple SD Gothic Neo" : "Noto Sans CJK KR");
  const font = ja ? { ascii: "Meiryo", hAnsi: "Meiryo", eastAsia: "Meiryo", cs: "Meiryo" } : { ascii: koFont, hAnsi: koFont, eastAsia: koFont, cs: koFont };
  const doc = new Document({
    creator: ja ? "a11ynote" : "접근성 점검노트",
    subject: ja ? "ウェブアクセシビリティ自己試験" : "웹 접근성 자체진단 (KWCAG 2.2) — 자동 신호는 확정 아님",
    description: ja ? NOT_CERT_JA : NOT_CERT_KO,
    keywords: ja ? "アクセシビリティ, JIS X 8341-3" : "웹 접근성, KWCAG 2.2, 자체진단, 초안",
    title: `${T.title}${draft ? (ja ? "（確認中）" : " (확인 진행 중)") : ""}`,
    styles: {
      default: { document: { run: { font, size: SIZE, language: ja ? { value: "ja-JP", eastAsia: "ja-JP" } : { value: "ko-KR", eastAsia: "ko-KR" } }, paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font, size: 28, bold: true, color: "1E44C8" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font, size: 23, bold: true }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 1 } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font, size: 20, bold: true }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: PAGE_LAYOUT.width, height: PAGE_LAYOUT.height }, margin: PAGE_LAYOUT.margin }, titlePage: true },
        headers: {
          default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${T.header(v.project.name)} · ${status}`, { size: 15, color: "777777" })] })] }),
          first: new Header({ children: [] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16, color: "777777" })] })] }),
          first: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 16, color: "777777" })] })] }),
        },
        children: [...cover, ...summaryPart, ...findingsPart, ...itemsPart, ...scopePart, ...methodPart, ...toolsPart, ...limitsPart, ...termsPart],
      },
    ],
  });
  return noAsianNumberGap(await Packer.toBuffer(doc));
}

/**
 * 숫자·영문과 한글 사이 자동 간격(autoSpaceDE/DN)을 끈다.
 * 맑은 고딕이 없는 환경(LibreOffice + Noto Sans CJK 대체)에서 "33 개"처럼 숫자와 단위가 벌어지는 현상을 줄인다.
 */
async function noAsianNumberGap(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const f = zip.file("word/styles.xml");
  if (!f) return buf;
  const xml = await f.async("string");
  const off = '<w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/>';
  const next = xml.includes("<w:pPrDefault><w:pPr>")
    ? xml.replace("<w:pPrDefault><w:pPr>", `<w:pPrDefault><w:pPr>${off}`)
    : xml.replace("<w:rPrDefault>", `<w:pPrDefault><w:pPr>${off}</w:pPr></w:pPrDefault><w:rPrDefault>`);
  zip.file("word/styles.xml", next);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
