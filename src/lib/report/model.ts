// 서류 3종(점검표·보고서·수정 요청서)과 결과 화면이 똑같은 판정을 쓰도록 만든 공통 모델.
//  - 항목 행: "자동 결과"와 "점검자 판정"을 따로 둔다 (자동 결과를 최종 판정처럼 보이지 않게)
//  - 문제 기록: 같은 기준 항목·규칙·판정 상태끼리 묶고, 위치(화면·URL·선택자)는 빠짐없이 모두 담는다
//  - 근거 ID: 문제 = P-001…, 화면 캡처 = S01… (점검표 "점검 범위" 시트 번호와 같음)

import { AI_SUGGESTION_CODES, reportActual, parseAiReason } from "./copy";
import { summarizeItems, type FindingMethod, type FindingResult } from "../../core/judge";
import { itemByCode } from "../../core/packs";
import { ruleHelp } from "../rule-help";
import { ROUTE_LABEL, VERIFICATION_LABEL, VERIFICATION_RESULTS, VERIFY_REASON_CODES, routeVerification, type VerificationResult, type VerificationRoute } from "../ai/verification-shared";
import type { FindingGroup, ScanView } from "../scan-view";

export type IssueState = "confirmed_fail" | "auto_fail" | "review";

export const STATE_LABEL: Record<"ko" | "ja", Record<IssueState, string>> = {
  ko: { confirmed_fail: "부적합 (점검자 판정)", auto_fail: "오류 (자동 규칙)", review: "오류 의심" },
  ja: { confirmed_fail: "不適合（試験者確定）", auto_fail: "問題の兆候（自動・未確認）", review: "要確認" },
};

/** 자동 결과 (사람 판정과 무관) */
export type AutoResult = "signal" | "clear" | "review" | "absent" | "untested";
export const AUTO_LABEL: Record<"ko" | "ja", Record<AutoResult, string>> = {
  ko: { signal: "오류", clear: "오류 없음", review: "오류 의심", absent: "해당 요소 없음", untested: "미점검" },
  ja: { signal: "違反の兆候", clear: "問題未検出", review: "要確認", absent: "該当要素なし", untested: "試験不可" },
};

/** 점검자 판정 */
export type HumanVerdict = "pass" | "fail" | "na" | "undecided" | "untested";
export const HUMAN_LABEL: Record<"ko" | "ja", Record<HumanVerdict, string>> = {
  ko: { pass: "적합", fail: "부적합", na: "해당 없음", undecided: "미검토", untested: "미점검" },
  ja: { pass: "適合（試験者確定）", fail: "不適合（試験者確定）", na: "適用なし（試験者確定）", undecided: "未確定", untested: "未試験" },
};

const METHOD_LABEL: Record<"ko" | "ja", Record<string, string>> = {
  ko: { auto: "자동 점검", ai: "자동 점검 + 사람 확인", manual: "사람 확인" },
  ja: { auto: "自動チェック", ai: "自動チェック＋試験者確認", manual: "試験者確認" },
};


export interface ItemRow {
  no: number;
  code: string;
  principle: string;
  title: string;
  level?: string;
  applicability: string;
  method: string;
  auto: AutoResult;
  human: HumanVerdict;
  /** 오류 위치 수 (문제 신호 + 확인 필요) */
  spots: number;
  evidence: string[];
  note: string;
}

export interface IssueLocation {
  /** 이 위치에서 점검 도구가 실제로 본 것 */
  actual: string;
  pageLabel: string;
  url: string;
  /** 화면 캡처 근거 ID (S01…) */
  shotId: string | null;
  selector: string;
  html: string;
  findingId: string;
  hasBox: boolean;
  pageStateId: string;
}

export interface IssueRecord {
  id: string;
  state: IssueState;
  /** 우선순위 표시 (1순위 기능 차단 / 2순위 이용 불편 / 3순위 개선 권장 / 확인 후 결정) */
  priority: string;
  /** 정렬용: 작을수록 먼저 */
  priorityRank: number;
  itemCode: string;
  itemTitle: string;
  ruleId: string;
  /** 같은 규칙 안에서도 의미가 다른 하위 유형 (예: 스킵 링크 목적지 없음/링크 없음) */
  variant?: "skip_destination" | "skip_missing";
  title: string;
  why: string;
  /** 점검 도구가 실제로 본 것 */
  actual: string;
  expected: string;
  howToCheck: string;
  fix: string;
  example: string | null;
  /** 판단 근거 (규칙·AI) — AI 를 쓰지 않았으면 규칙 판정으로 표시 */
  basis: string | null;
  /** 이 문제 묶음에 포함된 AI 처리 위치별 출처 집계 */
  aiTotal?: number;
  aiResolved?: number;
  aiFallback?: number;
  doneWhen: string;
  locations: IssueLocation[];
  /** 이 문제 묶음에 든 발견 사항 id 전부 (AI 검수 이력 연결용) */
  findingIds: string[];
  /** 대표 위치 (캡처를 넣을 위치) */
  sample: FindingGroup["sample"];
}

/** 이전 버전 저장분의 "[규칙 판정]" 표시를 정리해 근거 출처를 정확히 쓴다 */
export function basisText(aiReason: string | null | undefined, ja = false): string | null {
  // 내부 자료(Excel·Markdown)용 짧은 근거. 보고서 Word 본문에는 쓰지 않는다 (copy.ts 원칙)
  const p = parseAiReason(aiReason);
  if (p.source === "none" || !p.note) return null;
  return p.source === "rule" ? `${ja ? "規則判定" : "규칙 판정"}: ${p.note}` : `${ja ? "AI 補助判断（未確定）" : "AI 판단"}: ${p.note}`;
}

const EXPECTED: Record<string, string> = {
  "image-alt": "이미지가 전하는 내용이 alt 로 제공되고, 꾸밈 이미지는 alt=\"\" 이다.",
  "ai-image": "alt 가 이미지가 전하는 내용(그림 속 글자 포함)과 같은 뜻이다. 파일명·'이미지' 같은 말이 아니다.",
  "ai-link": "링크 문구(또는 주변 문맥)만으로 어디로 가는지 알 수 있다.",
  "ai-title": "페이지 제목이 내용을 설명하고 다른 페이지와 구별된다 (예: '공지사항 | 사이트명').",
  "color-contrast": "글자와 배경의 명암비가 4.5:1 이상(큰 글자 3:1 이상)이다.",
  "link-name": "링크마다 목적지를 알 수 있는 이름이 있다.",
  "button-name": "버튼마다 기능을 알 수 있는 이름이 있다.",
  label: "입력칸마다 화면 낭독기가 읽는 이름표가 연결돼 있다.",
  "aria-hidden-focus": "aria-hidden 영역 안에는 키보드 초점이 들어가지 않는다.",
  "kr-focus-indicator": "Tab 으로 초점이 올 때 눈에 띄는 테두리 등 초점 표시가 보인다.",
  "kr-click-only": "마우스로 누르는 기능을 키보드(Tab·Enter)로도 쓸 수 있다.",
  "kr-keyboard-trap": "Tab·Shift+Tab 으로 그 영역을 빠져나올 수 있다.",
  "kr-skip-link": "첫 Tab 위치에 본문 바로가기 링크가 있고, 누르면 본문으로 이동한다.",
  bypass: "첫 Tab 위치에 본문 바로가기 링크가 있고, 누르면 본문으로 이동한다.",
  "kr-new-window": "새 창으로 열리는 링크에 '새 창' 안내가 있다.",
  "html-has-lang": "<html> 에 lang 속성으로 기본 언어가 지정돼 있다.",
  "document-title": "페이지마다 내용을 설명하는 <title> 이 있다.",
  "target-size": "KWCAG 6.1.3 판정은 컨트롤 대각선 6mm(약 22.7px) 이상인지로 한다. (참고: WCAG 2.5.8 은 24×24px 이상 또는 충분한 간격을 요구하며, 이 신호는 그 기준에서 나온 것이라 KWCAG 위반 확정 근거가 아니다.)",
  "kr-small-target": "누르는 컨트롤의 대각선 길이가 6mm(약 22.7px) 이상이다 (KWCAG 6.1.3).",
};

const HOW: Record<string, string> = {
  "target-size": "개발자 도구에서 요소의 가로·세로 크기를 재어 대각선이 6mm(약 22.7px) 이상인지 계산한다. 6mm 이상이면 KWCAG 6.1.3 문제가 아니다.",
  "kr-small-target": "개발자 도구에서 요소의 가로·세로 크기를 재어 대각선이 6mm(약 22.7px) 미만인지 확인한다.",
  "color-contrast": "명암비 측정 도구(예: 크롬 개발자 도구의 색 선택기)로 글자색과 배경색을 비교한다.",
  "kr-focus-indicator": "페이지를 열고 Tab 키를 눌러 해당 요소까지 이동한 뒤 초점 표시가 보이는지 본다.",
  "kr-click-only": "Tab 키로 해당 요소에 초점이 가는지, Enter 로 실행되는지 본다.",
  "kr-keyboard-trap": "Tab·Shift+Tab 을 눌러 해당 영역에서 빠져나올 수 있는지 본다.",
  "kr-skip-link": "페이지를 열고 Tab 키를 한 번 눌러 첫 초점이 본문 바로가기인지 본다.",
  bypass: "페이지를 열고 Tab 키를 한 번 눌러 첫 초점이 본문 바로가기인지 본다.",
  "aria-hidden-focus": "Tab 키로 이동하며 화면에 보이지 않는 곳(숨긴 슬라이드 등)에 초점이 가는지 본다.",
  "image-alt": "개발자 도구로 이미지의 alt 속성을 보고, 이미지 내용과 같은 뜻인지 확인한다.",
  "ai-image": "이미지를 보고 alt 값이 이미지가 전하는 내용(글자 포함)과 같은 뜻인지 확인한다.",
  "ai-link": "링크 문구와 주변 문맥만으로 목적지를 알 수 있는지 확인한다.",
  "ai-title": "브라우저 탭 제목이 페이지 내용을 설명하고 다른 페이지와 구별되는지 확인한다.",
  "kr-new-window": "링크를 눌러 새 창이 열리는지, 링크에 새 창 안내가 있는지 본다.",
};

function shotIds(v: ScanView): Map<string, string> {
  return new Map(v.pages.map((p, i) => [p.id, `S${String(i + 1).padStart(2, "0")}`]));
}

/** 항목 행: 자동 결과와 점검자 판정을 따로 계산한다 */
export function itemRows(v: ScanView, issues: IssueRecord[]): ItemRow[] {
  const ja = v.pack.locale === "ja";
  const lang = ja ? "ja" : "ko";
  // 사람 판정을 빼고 다시 계산한 "자동 결과"
  const autoOnly = summarizeItems(
    v.pack,
    v.findings.map((f) => ({ itemCode: f.itemCode, method: f.method as FindingMethod, result: f.result as FindingResult, humanResult: null })),
    v.pages.map((p) => p.applicable),
  );
  return v.items.map((it, i) => {
    // 사람이 항목을 확정했으면 그 전의 자동 결과를, 아니면 화면과 같은 결과(위치별 "오류 아님" 확인 반영)를 쓴다
    const a = it.decidedBy === "human" ? autoOnly.find((x) => x.code === it.code)! : it;
    const dismissed = v.findings.filter((f) => f.itemCode === it.code && f.humanResult === "pass" && f.result !== "pass").length;
    const auto: AutoResult =
      a.status === "untested" ? "untested" : a.status === "na" ? "absent" : a.status === "fail" ? "signal" : a.status === "review" ? "review" : "clear";
    const human: HumanVerdict =
      it.status === "untested" ? "untested" : it.decidedBy === "human" ? (it.status === "pass" ? "pass" : it.status === "fail" ? "fail" : it.status === "na" ? "na" : "undecided") : "undecided";
    const ids = issues.filter((x) => x.itemCode === it.code).map((x) => x.id);
    const spots = issues.filter((x) => x.itemCode === it.code).reduce((n, x) => n + x.locations.length, 0);
    const applicability =
      human === "na" ? (ja ? "適用なし（確定）" : "해당 없음 (확정)") : auto === "absent" ? (ja ? "該当要素なし（自動）" : "해당 요소 없음 (자동)") : auto === "untested" ? (ja ? "未試験" : "미점검") : ja ? "適用" : "적용";
    const item = itemByCode(v.pack, it.code);
    return {
      no: i + 1,
      code: it.code,
      principle: it.principle,
      title: it.title,
      level: it.level,
      applicability,
      method: METHOD_LABEL[lang][item?.method ?? "auto"],
      auto,
      human,
      spots,
      evidence: ids,
      note: [
        it.decidedBy === "human" && it.note ? it.note : "",
        auto === "review" && !spots ? (ja ? "試験者の確認が必要な基準" : "사람 확인이 필요한 항목") : "",
        dismissed ? (ja ? `自動の兆候 ${dismissed}件を試験者が「問題なし」と確認` : `자동 신호 ${dismissed}곳은 점검자가 '오류 아님'으로 확인`) : "",
      ].filter(Boolean).join(" / "),
    };
  });
}

/** 문제 기록: 같은 기준 항목·규칙·상태끼리 묶는다. 위치는 생략하지 않는다 */
export function issueRecords(v: ScanView): IssueRecord[] {
  const ja = v.pack.locale === "ja";
  const shots = shotIds(v);
  const pageById = new Map(v.pages.map((p) => [p.id, p]));
  const map = new Map<string, IssueRecord>();
  for (const g of v.groups) {
    const res = g.result;
    if (res === "pass" || res === "pending") continue;
    const state: IssueState = res === "fail" ? (g.humanResult === "fail" ? "confirmed_fail" : "auto_fail") : "review";
    // “본문 목적지 없음”과 “첫 초점이 스킵 링크가 아님”(예: S04 버튼)을
    // 같은 규칙 ID 안에서도 분리한다. 단순히 “없어요”만 보면 버튼까지
    // 목적지 없음으로 잘못 묶인다.
    const skipDestinationMissing = g.ruleId === "kr-skip-link" && /목적지|href|#container|요소를 찾을 수/.test(g.message);
    const skipVariant = g.ruleId === "kr-skip-link" ? (skipDestinationMissing ? "skip_destination" : "skip_missing") : null;
    const groupFindings = v.findings.filter((f) => g.findingIds.includes(f.id));
    const groupAi = groupFindings.filter((f) => f.method === "ai");
    const groupAiFallback = groupAi.filter((f) => aiSource(f) === "rule").length;
    const groupAiResolved = groupAi.filter((f) => aiSource(f) === "ai").length;
    const sampleBasis = basisText(g.sample.aiReason, ja);
    // 구버전 fallback 문구의 “AI 미사용” 꼬리말은 실제 AI 처리 묶음과
    // 충돌하므로, AI 위치가 하나라도 포함된 묶음에서는 제거한다.
    const basis = groupAi.length ? sampleBasis?.replace(/\s*\((?:AI\s*)?(?:미사용|不使用)\)/g, "") ?? null : sampleBasis;
    const key = `${g.itemCode}|${g.ruleId}|${state}|${skipVariant ?? ""}`;
    const item = itemByCode(v.pack, g.itemCode);
    const help = ruleHelp(g.ruleId, "ko");
    const helpLocal = ruleHelp(g.ruleId, ja ? "ja" : "ko");
    let rec = map.get(key);
    if (!rec) {
      const skipLinkTitle = skipDestinationMissing
        ? (ja ? "本文へのスキップリンクの移動先がありません" : "본문 바로가기 링크의 목적지가 없어요")
        : null;
      const skipExpected = skipVariant === "skip_destination"
        ? (ja ? "最初のTabでスキップリンクにフォーカスし、hrefの移動先が本文開始要素として存在する。" : "첫 Tab 위치의 본문 바로가기 링크가 실제 본문 시작 요소로 이동한다. 링크의 href 대상 요소가 페이지에 존재해야 한다.")
        : null;
      const skipHow = skipVariant === "skip_destination"
        ? (ja ? "Tabでスキップリンクにフォーカスし、href（例: #container）のID要素が存在し、リンク操作で本文へ移動するか確認する。" : "Tab으로 본문 바로가기 링크에 초점을 보낸 뒤 href(예: #container)의 ID 요소가 실제로 존재하는지 확인하고, 링크를 실행해 본문으로 이동하는지 확인한다.")
        : null;
      const skipFix = skipVariant === "skip_destination"
        ? (ja ? "本文開始要素にid=\"container\"を付けるか、スキップリンクのhrefを実際の本文開始要素のIDに変更します。" : "본문 시작 요소에 id=\"container\"를 부여하거나, 스킵 링크의 href를 실제 본문 시작 요소의 ID로 바꿔요.")
        : null;
      rec = {
        id: "",
        state,
        ...priorityOf(v.pack.id, state, g.itemCode, g.ruleId, ja),
        itemCode: g.itemCode,
        itemTitle: item?.title ?? g.itemCode,
        ruleId: g.ruleId,
        variant: skipVariant ?? undefined,
        // 서류는 기관 제출용 공문체로 (화면은 쉬운 말 유지)
        title: (skipLinkTitle ?? helpLocal?.title ?? g.message.split(" — ")[0].slice(0, 120)),
        why: (helpLocal?.why ?? ""),
        actual: (ja ? g.message : reportActual(g.ruleId, g.message, helpLocal?.title ?? g.message.split(" — ")[0])),
        expected: skipExpected ?? (ja ? null : EXPECTED[g.ruleId]) ?? (ja ? `${g.itemCode} ${item?.title ?? ""} を満たしている。` : `${g.itemCode} ${item?.title ?? ""} 기준을 충족한다.`),
        howToCheck: skipHow ?? (ja ? null : HOW[g.ruleId]) ?? (ja ? "該当ページを開き、開発者ツールでセレクタの要素を確認する。" : "해당 화면을 열고 개발자 도구에서 선택자로 요소를 찾아 확인한다."),
        fix: (skipFix ?? fixedSuggestion(g.sample.aiSuggestion) ?? helpLocal?.fix ?? (item?.fix || (ja ? `${g.itemCode} ${item?.title ?? ""} の要件を満たすよう、セレクタの要素を修正します。` : `${g.itemCode} ${item?.title ?? ""} 기준의 요구사항을 충족하도록 선택자의 요소를 수정해요. 수정 후 같은 페이지를 다시 점검해요.`))),
        example: helpLocal?.example ?? null,
        basis,
        aiTotal: groupAi.length || undefined,
        aiResolved: groupAi.length ? groupAiResolved : undefined,
        aiFallback: groupAi.length ? groupAiFallback : undefined,
        doneWhen: ja
          ? "同じページを再試験したとき、この箇所で問題が検出されず、試験者が確認したこと。"
          : state === "review"
            ? "점검자가 이 위치를 확인해 '오류 맞음/아님'을 확정하고, 문제면 고친 뒤 다시 점검해 자동 신호가 사라질 것."
            : "같은 페이지를 다시 점검했을 때 이 위치에서 자동 신호가 나오지 않고, 점검자가 실제 화면에서 확인할 것.",
        locations: [],
        findingIds: [],
        sample: g.sample,
      };
      map.set(key, rec);
    } else if (groupAi.length) {
      // 같은 유형에 원인(선택자)이 여러 개면 AI 처리 건수를 모두 더한다 (오류별 합계 = 5장 전체 합계)
      rec.aiTotal = (rec.aiTotal ?? 0) + groupAi.length;
      rec.aiResolved = (rec.aiResolved ?? 0) + groupAiResolved;
      rec.aiFallback = (rec.aiFallback ?? 0) + groupAiFallback;
      if (!rec.basis && basis) rec.basis = basis;
    }
    rec.findingIds.push(...g.findingIds);
    for (const pg of g.pages) {
      const page = pageById.get(pg.pageStateId);
      rec.locations.push({
        actual: (ja ? g.message : reportActual(g.ruleId, g.message, helpLocal?.title ?? g.message.split(" — ")[0])),
        pageLabel: pg.label,
        url: pg.url,
        shotId: page?.screenshotKey ? shots.get(pg.pageStateId) ?? null : null,
        selector: g.selector,
        html: g.sample.html ?? "",
        findingId: g.sample.id,
        hasBox: Boolean(g.sample.box),
        pageStateId: pg.pageStateId,
      });
    }
  }
  const order: Record<IssueState, number> = { confirmed_fail: 0, auto_fail: 1, review: 2 };
  const list = [...map.values()].sort(
    (a, b) => order[a.state] - order[b.state] || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }) || b.locations.length - a.locations.length,
  );
  list.forEach((r, i) => (r.id = `P-${String(i + 1).padStart(3, "0")}`));
  return list;
}

/** AI 수정 제안은 고정 문구(suggestionCode)일 때만 쓴다. 이전 버전의 자유문장은 무시하고 규칙 설명으로 대체 */
function fixedSuggestion(s: string | null | undefined): string | null {
  if (!s) return null;
  return (Object.values(AI_SUGGESTION_CODES) as string[]).includes(s) ? s : null;
}

export function shotIdMap(v: ScanView) {
  return shotIds(v);
}

/** AI 를 실제로 썼는지 (회차 기록 기준) */
export function aiUsed(v: ScanView): boolean {
  return v.findings.some((f) => f.method === "ai") || (/^AI\s/.test(v.scan.aiConfig ?? "") && !/꺼짐/.test(v.scan.aiConfig ?? ""));
}

/** AI 처리 위치 하나의 출처: AI 해석 / 규칙 대체 / 아직 처리 안 됨 */
export function aiSource(f: { result: string; aiReason: string | null }): "ai" | "rule" | "pending" {
  if (f.result === "pending" || !f.aiReason) return "pending";
  return f.aiReason.startsWith("[규칙 판정]") ? "rule" : "ai";
}

export interface AiAudit {
  attempted: boolean;
  /** AI 처리 대상 위치 수 (= 해석 + 규칙 대체 + 대기) */
  aiFindings: number;
  /** AI 응답을 정상 해석한 위치 수 */
  aiResolvedFindings: number;
  /** 응답 실패·해석 실패로 규칙 판정을 쓴 위치 수 */
  fallbackFindings: number;
  /** 아직 처리되지 않은 위치 수 */
  pendingFindings: number;
  configFailure: boolean;
  configOff: boolean;
  inconsistent: boolean;
}

/** 보고서에 AI 호출 성공·부분 실패·규칙 fallback을 서로 섞어 쓰지 않기 위한 요약 */
export function aiAudit(v: ScanView): AiAudit {
  const config = v.scan.aiConfig ?? "";
  const aiFindings = v.findings.filter((f) => f.method === "ai");
  const configOff = /AI\s*꺼짐|AI\s*不使用|\boff\b/i.test(config);
  return {
    attempted: aiFindings.length > 0 || Boolean(config && !configOff),
    aiFindings: aiFindings.length,
    fallbackFindings: aiFindings.filter((f) => aiSource(f) === "rule").length,
    aiResolvedFindings: aiFindings.filter((f) => aiSource(f) === "ai").length,
    pendingFindings: aiFindings.filter((f) => aiSource(f) === "pending").length,
    configFailure: /실패|failure|fallback/i.test(config),
    configOff,
    inconsistent: configOff && aiFindings.length > 0,
  };
}

/** 모든 산출물(Word·Excel·Markdown)에 같은 글자로 넣는 AI 처리 요약 한 줄 */
export function aiSummaryText(a: AiAudit, ja = false): string {
  if (!a.attempted || !a.aiFindings) return ja ? "AI 補助判断: 使用していません。" : "AI 판단: 쓰지 않음.";
  const pend = a.pendingFindings ? (ja ? `・未処理 ${a.pendingFindings}` : ` · 미처리 ${a.pendingFindings}건`) : "";
  return ja
    ? `AI 補助判断: 対象 ${a.aiFindings}・AI 解釈 ${a.aiResolvedFindings}・規則判定で代替 ${a.fallbackFindings}${pend}（すべて未確定）${a.inconsistent ? "・設定の不一致を要確認" : ""}`
    : `AI 판단: 대상 ${a.aiFindings}건 · AI가 판단 ${a.aiResolvedFindings}건 · 규칙으로 대신 판단 ${a.fallbackFindings}건${pend}${a.inconsistent ? " · 설정 불일치 확인 필요" : ""}`;
}

/** 문제 유형 하나의 판단 출처 (보고서용 한 줄) */
export function provenanceText(r: IssueRecord, ja = false): string {
  if (r.state === "confirmed_fail") return ja ? "自動チェック＋試験者確定" : "자동 규칙 + 점검자 판정";
  if (!r.aiTotal) return ja ? "自動チェック（規則）" : "자동 점검 (규칙)";
  return ja
    ? `AI 補助判断 ${r.aiTotal}（AI 解釈 ${r.aiResolved ?? 0}・規則代替 ${r.aiFallback ?? 0}）`
    : `AI 판단 ${r.aiTotal}건 (AI가 판단 ${r.aiResolved ?? 0}건 · 규칙으로 대신 ${r.aiFallback ?? 0}건)`;
}

/** 실제 대상 요소의 HTML 로 고친 예를 만든다. 요소 종류(로고·배너·차트·아이콘 링크 등)에 맞춰 alt·이름을 안내한다.
 *  만들 수 없으면 규칙 설명의 일반 예시를 "형식 참고"로 돌려준다. */
/** 대상 HTML 로 예시를 만들 수 없을 때 쓰는 규칙별 최소 수정 예시 (항목별 실제 선택자는 위치 표에 있음) */
const FIX_SNIPPET: Record<string, { code: string; note: string }> = {
  "ai-image": { code: '<img src="(현재 파일)" alt="이미지가 전하는 내용 (그림 속 글자 포함)">', note: "alt 를 파일명·\"이미지\" 같은 말 대신 이미지가 전하는 내용으로 바꿔요. 꾸밈용이면 alt=\"\" 로 둬요." },
  "kr-autoplay": { code: '<video src="(현재 파일)" controls muted></video>\n<!-- 또는 autoplay 속성을 지우고 사용자가 재생하게 해요 -->', note: "소리가 나는 미디어는 자동 재생하지 않거나, 음소거(muted)로 시작하고 정지·음량 조절 수단을 제공해요." },
  "target-size": { code: "/* KWCAG 6.1.3: 대각선 6mm(약 22.7px) 이상 */\n#gnb > a { display: inline-block; min-height: 24px; padding: 4px 8px; }", note: "점검자가 실제 크기를 재어 대각선 6mm 미만일 때만 적용해요 (WCAG 2.5.8 참고 신호)." },
  "kr-small-target": { code: "/* KWCAG 6.1.3: 대각선 6mm(약 22.7px) 이상, 권장 44×44px */\nbutton.icon { min-width: 24px; min-height: 24px; }", note: "아이콘 버튼의 누르는 영역을 키워요. 보이는 아이콘은 그대로 두고 padding 으로 넓혀도 돼요." },
};

export function fixedExample(ruleId: string, html: string, fallback: string | null, ja = false): { code: string; note: string } | null {
  const tag = html.match(/^<([a-z0-9-]+)\b[^>]*>/i)?.[0] ?? "";
  const lower = html.toLowerCase();
  const withAttr = (t: string, attr: string) => t.replace(/\s*\/?>$/, (end) => ` ${attr}${end.includes("/") ? " />" : ">"}`);
  const imgRules = ["image-alt", "input-image-alt", "role-img-alt", "svg-img-alt", "ai-image"];
  if (imgRules.includes(ruleId) && tag) {
    const kind = /logo|로고|ci\b|symbol/.test(lower)
      ? ja ? ["ロゴ", "サイト名・組織名"] : ["로고", "기관·사이트 이름 (예: 서울특별시)"]
      : /chart|graph|그래프|차트|도표/.test(lower)
        ? ja ? ["グラフ", "グラフの要点（詳細は本文や表で提供）"] : ["차트·그래프", "핵심 수치 요약 (자세한 값은 본문이나 표로 함께 제공)"]
        : /banner|slide|visual|배너|swiper|carousel/.test(lower)
          ? ja ? ["バナー", "バナー内の文字と日付をそのまま"] : ["배너", "배너 속 글자·날짜를 그대로 (예: 2026 행사 10월 23일~29일)"]
          : /icon|ico_|btn|arrow|아이콘/.test(lower)
            ? ja ? ["アイコン", "機能名（例: 検索）。装飾なら alt=\"\""] : ["아이콘", "기능 이름 (예: 검색). 꾸밈용이면 alt=\"\""]
            : ja ? ["画像", "画像が伝える内容。装飾なら alt=\"\""] : ["이미지", "이미지가 전하는 내용. 꾸밈용이면 alt=\"\""];
    const attr = ruleId === "role-img-alt" || ruleId === "svg-img-alt" ? `aria-label="${kind[1]}"` : `alt="${kind[1]}"`;
    const base = /\salt=/.test(tag) ? tag.replace(/\salt=("[^"]*"|'[^']*')/, ` ${attr}`) : withAttr(tag, attr);
    return { code: base, note: ja ? `対象は${kind[0]}と思われます。代替テキストの内容は実際の画像を見て決めてください。` : `대상이 ${kind[0]}(으)로 보여요. alt 내용은 실제 이미지를 보고 정하세요.` };
  }
  if ((ruleId === "link-name" || ruleId === "button-name" || ruleId === "ai-link") && tag) {
    const label = ruleId === "button-name" ? (ja ? "ボタンの機能" : "버튼 기능 (예: 메뉴 열기)") : ja ? "リンク先" : "목적지 (예: 공지사항 전체 보기)";
    return { code: withAttr(tag.replace(/\saria-label=("[^"]*"|'[^']*')/, ""), `aria-label="${label}"`) + (/^<(a|button)\b/i.test(tag) ? "…" : ""), note: ja ? "画面に見える文字があれば aria-label ではなく文字を入れてください。" : "화면에 보이는 글자로 넣을 수 있으면 aria-label 대신 글자를 넣으세요." };
  }
  if (ruleId === "html-has-lang" || ruleId === "html-lang-valid") return { code: ja ? '<html lang="ja">' : '<html lang="ko">', note: "" };
  if (ruleId === "kr-new-window" && tag) return { code: withAttr(tag, ja ? 'title="新しいウィンドウ"' : 'title="새 창"') + (ja ? "…（新しいウィンドウ）</a>" : "… (새 창)</a>"), note: ja ? "リンク文字に「新しいウィンドウ」を含めるのが最も確実です。" : "링크 글자에 \"(새 창)\"을 넣는 것이 가장 확실해요." };
  // 대상 HTML 이 없거나 일반 예시만 있는 규칙: 규칙별 최소 수정 예시
  const snippet = FIX_SNIPPET[ruleId];
  if (snippet) return { code: snippet.code, note: ja ? "一般的な修正例です。実際の要素に合わせてください。" : snippet.note };
  if (!fallback) return null;
  return { code: fallback, note: ja ? "一般的な例です（形式の参考）。" : "일반 예시예요 (형식 참고). 실제 요소에 맞게 바꾸세요." };
}

// ── 화면·서류 공통 수치 (Codex 보고서 리뷰 1) ─────────────────────────
// 단위를 섞지 않는다: 기준(항목) 수 · 유형(같은 기준·규칙·상태 묶음) 수 · 위치(화면별 요소) 수 · 화면 수

export interface StateMetric {
  /** 해당 상태의 문제가 하나라도 있는 기준 항목 수 */
  criteria: number;
  /** 문제 유형 수 (P-001 … 하나가 한 유형) */
  types: number;
  /** 위치 수 (화면별 요소) */
  locations: number;
  /** 문제가 나온 화면 수 */
  pages: number;
}

export interface ReportMetrics {
  confirmed_fail: StateMetric;
  auto_fail: StateMetric;
  review: StateMetric;
  /** 점검한 페이지 수 */
  pagesChecked: number;
  /** 기준 항목 전체 수와 점검자가 확정한 항목 수 */
  itemsTotal: number;
  itemsConfirmed: number;
  /** 사람 확인 필요 기준 수와 기준 상태 사람 확인 필요 수의 관계 */
  reviewDetail: ReviewBreakdown;
}

export function reportMetrics(v: ScanView, issues: IssueRecord[] = issueRecords(v)): ReportMetrics {
  const of = (st: IssueState): StateMetric => {
    const list = issues.filter((x) => x.state === st);
    return {
      criteria: new Set(list.map((x) => x.itemCode)).size,
      types: list.length,
      locations: list.reduce((n, x) => n + x.locations.length, 0),
      pages: new Set(list.flatMap((x) => x.locations.map((l) => l.pageStateId))).size,
    };
  };
  const confirmed = v.items.filter((i) => i.decidedBy === "human" && (i.status === "pass" || i.status === "fail" || i.status === "na")).length;
  return { confirmed_fail: of("confirmed_fail"), auto_fail: of("auto_fail"), review: of("review"), pagesChecked: v.pages.length, itemsTotal: v.items.length, itemsConfirmed: confirmed, reviewDetail: reviewBreakdown(v, issues) };
}

/** 모든 산출물에서 같은 글자로 쓰는 단위 표기. 예: "기준 11개 · 유형 13개 · 위치 178곳" */
export function metricText(m: StateMetric, ja = false): string {
  return ja ? `達成基準 ${m.criteria}・種類 ${m.types}・箇所 ${m.locations}` : `기준 ${m.criteria}개 · 유형 ${m.types}개 · 위치 ${m.locations}곳`;
}

export const METRIC_TITLE: Record<"ko" | "ja", Record<IssueState, string>> = {
  ko: { confirmed_fail: "부적합 (점검자 판정)", auto_fail: "오류 (자동 규칙)", review: "오류 의심" },
  ja: { confirmed_fail: "試験者確定の不適合", auto_fail: "自動チェックの問題の兆候", review: "要確認" },
};

/** 한 줄 요약: "자동 신호(확정 아님): 기준 n개 · 유형 n개 · 위치 n곳" */
export function metricLine(st: IssueState, m: ReportMetrics, ja = false): string {
  return `${METRIC_TITLE[ja ? "ja" : "ko"][st]}: ${metricText(m[st], ja)}`;
}

// ── 우선순위: 위치 수가 아니라 사용자 영향(기능 차단 여부) 기준 (독립 심사 P1-5) ─────────────
// 1순위 = 기능 차단 (키보드·초점·건너뛰기·언어·대체 텍스트 없음·레이블·자동 재생 소리·인증·시간 제한·웹앱 이름)
// 2순위 = 이용 불편 (대비·새 창·표·크기·링크·제목·자막·정지 등) / 3순위 = 개선 권장 / 사람 확인 필요 = 확인 후 결정
const TIER1: Record<string, string[]> = {
  kwcag22: ["6.1.1", "6.1.2", "6.4.1", "7.1.1", "5.1.1", "7.3.2", "5.4.2", "7.3.3", "6.2.1", "8.2.1"],
  jis2016: ["2.1.1", "2.1.2", "2.4.7", "2.4.1", "3.1.1", "1.1.1", "3.3.2", "1.4.2", "2.2.1", "4.1.2"],
};
const TIER2: Record<string, string[]> = {
  kwcag22: ["5.4.3", "7.2.1", "5.3.1", "6.1.3", "6.4.3", "6.4.2", "5.2.1", "6.2.2", "8.1.1", "5.3.2"],
  jis2016: ["1.4.3", "3.2.5", "1.3.1", "2.4.4", "2.4.2", "1.2.2", "2.2.2", "4.1.1", "2.4.3"],
};
/** 같은 기준이라도 "대체 텍스트 내용이 맞는지"(의미 판단)는 기능 차단이 아니라 2순위 */
const TIER_DOWN = new Set(["ai-image", "ai-link", "ai-title", "image-redundant-alt"]);

export function priorityOf(packId: string, state: IssueState, itemCode: string, ruleId: string, ja = false): { priority: string; priorityRank: number } {
  if (state === "review") return { priority: ja ? "要確認" : "판정 반영", priorityRank: 900 };
  const t1 = TIER1[packId] ?? [];
  const t2 = TIER2[packId] ?? [];
  const i1 = t1.indexOf(itemCode);
  if (i1 >= 0 && !TIER_DOWN.has(ruleId)) return { priority: ja ? "1（機能を妨げる）" : "1순위 (기능 차단)", priorityRank: 100 + i1 };
  const i2 = t2.indexOf(itemCode);
  if (i2 >= 0 || i1 >= 0) return { priority: ja ? "2（利用しにくい）" : "2순위 (이용 불편)", priorityRank: 200 + (i2 >= 0 ? i2 : 50) };
  return { priority: ja ? "3（改善推奨）" : "3순위 (개선 권장)", priorityRank: 300 };
}

/** 원인(선택자) 묶음: 여러 화면에 반복되는 공통 요소는 "원인 1곳 / 영향 화면 n개"로 센다 */
export interface CauseGroup {
  selector: string;
  pages: { pageStateId: string; label: string; url: string; shotId: string | null }[];
  html: string;
  /** 2개 이상 화면에 나오는 공통 요소 */
  shared: boolean;
}

export function causeGroups(rec: IssueRecord): CauseGroup[] {
  const map = new Map<string, CauseGroup>();
  for (const l of rec.locations) {
    const g = map.get(l.selector) ?? { selector: l.selector, pages: [], html: l.html, shared: false };
    if (!g.pages.some((p) => p.pageStateId === l.pageStateId)) g.pages.push({ pageStateId: l.pageStateId, label: l.pageLabel, url: l.url, shotId: l.shotId });
    map.set(l.selector, g);
  }
  const list = [...map.values()];
  for (const g of list) g.shared = g.pages.length > 1;
  return list.sort((a, b) => b.pages.length - a.pages.length);
}

/** "원인 n곳 / 영향 화면 m개 (여러 화면 공통 요소 k곳)" */
export function causeText(rec: IssueRecord, ja = false): string {
  const groups = causeGroups(rec);
  const pages = new Set(rec.locations.map((l) => l.pageStateId)).size;
  const shared = groups.filter((g) => g.shared).length;
  if (ja) return `原因 ${groups.length}箇所 / 影響ページ ${pages}${shared ? `（複数ページ共通の要素 ${shared}）` : ""}`;
  return `원인 ${groups.length}곳 / 영향 페이지 ${pages}개${shared ? ` (여러 화면 공통 요소 ${shared}곳)` : ""}`;
}

/** 우선순위 순서 (같은 순위면 영향 화면이 많은 것 먼저) */
export function byPriority(list: IssueRecord[]): IssueRecord[] {
  const pages = (r: IssueRecord) => new Set(r.locations.map((l) => l.pageStateId)).size;
  return [...list].sort((a, b) => a.priorityRank - b.priorityRank || pages(b) - pages(a) || a.id.localeCompare(b.id));
}

// ── "사람 확인 필요 기준 n개"와 "기준 상태 사람 확인 필요 m개"의 관계 (독립 심사 P1-2) ─────────────
export interface ReviewBreakdown {
  /** 사람 확인 위치가 있는 기준 (= 요약표의 사람 확인 필요 기준 수) */
  withLocations: number;
  /** 기준 항목 상태가 사람 확인 필요인 기준 */
  itemsInReview: number;
  /** 둘 다 해당 */
  both: number;
  /** 위치 없이 사람이 직접 판단해야 하는 기준 (기준 상태만 사람 확인 필요) */
  itemOnly: number;
  /** 사람 확인 위치가 있지만 같은 기준에 자동 신호 등이 있어 기준 상태는 다른 것으로 집계된 기준 */
  elsewhere: number;
}

export function reviewBreakdown(v: ScanView, issues: IssueRecord[]): ReviewBreakdown {
  const a = new Set(issues.filter((x) => x.state === "review").map((x) => x.itemCode));
  const b = new Set(v.items.filter((i) => i.status === "review" && i.decidedBy !== "human").map((i) => i.code));
  const both = [...a].filter((c) => b.has(c)).length;
  return { withLocations: a.size, itemsInReview: b.size, both, itemOnly: b.size - both, elsewhere: a.size - both };
}

/** 요약·각 산출물에 붙이는 각주 (숫자는 실제 데이터에서 계산) */
export function reviewFootnote(r: ReviewBreakdown, ja = false): string {
  if (ja) return `※ 要確認の達成基準 ${r.withLocations}件は、確認する箇所がある基準です。状態が要確認の達成基準 ${r.itemsInReview}件とは集計方法が異なります。両方 ${r.both}件・箇所なしで直接判断 ${r.itemOnly}件・自動の兆候と別集計 ${r.elsewhere}件です（${r.both}+${r.itemOnly}=${r.itemsInReview}、${r.both}+${r.elsewhere}=${r.withLocations}）。`;
  return `※ 오류 의심 "기준 ${r.withLocations}개"는 위치가 있는 기준만 센 숫자예요. 위치 없이 페이지 전체를 보고 판정한 기준 ${r.itemOnly}개는 항목별 판정 표에 따로 있어요.`;
}


// ── 자동 점검 결과 AI 검수 (Phase 1) ─────────────────────────────────
// 의미 후보 AI 판단(method=ai, "AI 보조 판단")과 다른 계층이다. 자동 결과·점검자 판정은 바꾸지 않고 옆에 붙여 보여 준다.

/** 발견 사항마다 가장 최근의 AI 검수 한 건 */
export function latestAiVerification(v: ScanView): Map<string, ScanView["verifications"][number]> {
  const out = new Map<string, ScanView["verifications"][number]>();
  for (const x of v.verifications ?? []) {
    if (x.verifier !== "ai" || !x.findingId) continue;
    const prev = out.get(x.findingId);
    if (!prev || +x.createdAt >= +prev.createdAt) out.set(x.findingId, x);
  }
  return out;
}

/** "문제 미발견(pass)" 표본 검수: 화면·항목마다 가장 최근 한 건. 키 = `${pageStateId}|${itemCode}` */
export function latestPassSampleVerification(v: ScanView): Map<string, ScanView["verifications"][number]> {
  const out = new Map<string, ScanView["verifications"][number]>();
  for (const x of v.verifications ?? []) {
    if (x.verifier !== "ai" || x.target !== "auto_pass_sample" || !x.pageStateId || !x.itemCode) continue;
    const key = `${x.pageStateId}|${x.itemCode}`;
    const prev = out.get(key);
    if (!prev || +x.createdAt >= +prev.createdAt) out.set(key, x);
  }
  return out;
}

export interface VerificationSummary {
  counts: Record<VerificationResult, number>;
  /** 검수한 위치 수 / 이 묶음의 전체 위치 수 (상한·예산 때문에 일부만 검수할 수 있다) */
  checked: number;
  total: number;
  /** 사람 확인으로 보낼 위치 수 (반박·보류·낮은 신뢰도) */
  toHuman: number;
  models: string[];
  promptVersions: string[];
}

export function verificationSummary(v: ScanView, findingIds: string[]): VerificationSummary | null {
  const latest = latestAiVerification(v);
  const list = findingIds.map((id) => latest.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!list.length) return null;
  const counts = Object.fromEntries(VERIFICATION_RESULTS.map((r) => [r, 0])) as Record<VerificationResult, number>;
  for (const x of list) counts[x.result]++;
  return {
    counts,
    checked: list.length,
    total: findingIds.length,
    toHuman: list.filter((x) => routeVerification(x.autoResult, x) === "human_review").length,
    models: [...new Set(list.map((x) => `${x.provider ?? ""}/${x.model ?? ""}`))],
    promptVersions: [...new Set(list.map((x) => x.promptVersion ?? "-"))],
  };
}

/** 서류용 고정 문구 한 줄 (AI 자유문장 없음). 검수 이력이 없으면 null */
export function verificationLine(v: ScanView, r: Pick<IssueRecord, "findingIds">, ja = false): string | null {
  const s = verificationSummary(v, r.findingIds ?? []);
  if (!s) return null;
  const L = VERIFICATION_LABEL[ja ? "ja" : "ko"];
  const parts = VERIFICATION_RESULTS.filter((k) => s.counts[k]).map((k) => `${L[k]} ${s.counts[k]}`);
  const human = s.toHuman ? (ja ? ` → 試験者の確認が必要 ${s.toHuman}箇所` : ` → 사람 확인 필요 ${s.toHuman}곳`) : "";
  const cover = ja ? `検査 ${s.checked}/${s.total}箇所` : `검수 ${s.checked}/${s.total}곳`;
  return ja
    ? `AI検証（自動チェック結果の再検査・未確定）: ${cover}・${parts.join("・")}${human}・モデル ${s.models.join(", ")}・プロンプト ${s.promptVersions.join(", ")}`
    : `AI 검증 (자동 점검 결과 재검수·확정 아님): ${cover} · ${parts.join(" · ")}${human} · 모델 ${s.models.join(", ")} · 프롬프트 ${s.promptVersions.join(", ")}`;
}

export interface VerificationRow {
  issueId: string;
  itemCode: string;
  ruleId: string;
  pageLabel: string;
  url: string;
  selector: string;
  /** 1차 자동 결과 (검수 당시 값) */
  autoResult: string;
  ai: VerificationResult;
  confidence: number | null;
  evidence: string;
  reason: string;
  route: VerificationRoute;
  /** 3차 점검자 판정 (없으면 미확정) */
  human: "fail" | "pass" | null;
  model: string;
  promptVersion: string;
  createdAt: Date;
  inputHash: string;
}

/** Excel "AI 검수" 시트용: 검수된 위치마다 한 줄. 자동 결과 · AI 검증 · 점검자 판정을 따로 둔다 */
export function verificationRows(v: ScanView, issues: IssueRecord[]): VerificationRow[] {
  const latest = latestAiVerification(v);
  const pageById = new Map(v.pages.map((p) => [p.id, p]));
  const issueByFinding = new Map<string, IssueRecord>();
  for (const r of issues) for (const id of r.findingIds ?? []) issueByFinding.set(id, r);
  const out: VerificationRow[] = [];
  for (const f of v.findings) {
    const x = latest.get(f.id);
    if (!x) continue;
    const page = pageById.get(f.pageStateId);
    out.push({
      issueId: issueByFinding.get(f.id)?.id ?? "-",
      itemCode: f.itemCode,
      ruleId: f.ruleId,
      pageLabel: page?.label ?? "",
      url: page?.url ?? "",
      selector: f.selector,
      autoResult: x.autoResult,
      ai: x.result,
      confidence: x.confidence,
      evidence: x.evidence,
      reason: VERIFY_REASON_CODES[x.reasonCode as keyof typeof VERIFY_REASON_CODES] ?? "",
      route: routeVerification(x.autoResult, x),
      human: f.humanResult ?? null,
      model: `${x.provider ?? ""}/${x.model ?? ""}`,
      promptVersion: x.promptVersion ?? "",
      createdAt: x.createdAt,
      inputHash: (x.inputHash ?? "").slice(0, 12),
    });
  }
  // "문제 미발견" 표본 검수: 오류 ID 는 없고(-), 점검자 판정은 항목 단위 결정으로 본다
  const decided = new Map(v.items.filter((i) => i.decidedBy === "human").map((i) => [i.code, i.status]));
  for (const x of latestPassSampleVerification(v).values()) {
    const page = pageById.get(x.pageStateId!);
    const d = decided.get(x.itemCode!);
    out.push({
      issueId: "-",
      itemCode: x.itemCode!,
      ruleId: "",
      pageLabel: page?.label ?? "",
      url: page?.url ?? "",
      selector: "",
      autoResult: x.autoResult,
      ai: x.result,
      confidence: x.confidence,
      evidence: x.evidence,
      reason: VERIFY_REASON_CODES[x.reasonCode as keyof typeof VERIFY_REASON_CODES] ?? "",
      route: routeVerification(x.autoResult, x),
      human: d === "fail" ? "fail" : d === "pass" ? "pass" : null,
      model: `${x.provider ?? ""}/${x.model ?? ""}`,
      promptVersion: x.promptVersion ?? "",
      createdAt: x.createdAt,
      inputHash: (x.inputHash ?? "").slice(0, 12),
    });
  }
  return out.sort((a, b) => a.issueId.localeCompare(b.issueId) || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
}

export { ROUTE_LABEL, VERIFICATION_LABEL };
