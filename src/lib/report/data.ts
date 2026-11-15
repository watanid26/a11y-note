// 서류(점검표·보고서·수정 요청서)가 공통으로 쓰는 자료와 문구.
import { ruleHelp } from "../rule-help";

import { displayStatus, type DisplayStatus } from "../../core/judge";
import { toolVerdicts, verdictRate } from "../../core/verdict";
import { itemByCode } from "../../core/packs";
import type { ScanView } from "../scan-view";
import type { ScopeMode } from "../db/schema";
import { environmentSummary, type EnvironmentSummary } from "../evidence";
import { evaluationSummary, type EvaluationSummary } from "../manual-eval";
import { branchSummary } from "../flow-branch";
import { RANDOM_REASON } from "../sampling";

export const TOOL_NAME = "접근성 점검노트 (자동 규칙 + AI 판정 + 점검자 검토)";

export function dateKst(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export interface ReportSummary {
  /** 화면 표시 상태별 항목 수 (자동 점검 결과 기준) */
  counts: Record<DisplayStatus, number>;
  /** 점검노트 판정별 항목 수 (core/verdict.ts) */
  verdictCounts: { pass: number; fail: number; na: number; pending: number };
  /** 판정이 나온 항목 수 (점검노트 판정 또는 점검자 판정) */
  confirmed: number;
  /** 점검자가 검토(승인·수정)한 항목 수 */
  reviewed: number;
  /** 준수율 = 적합 / (적합 + 부적합), 점검노트 판정 기준(점검자 판정이 있으면 그것). 해당 없음 제외.
   *  WCAG·KWCAG 적합은 평균이 아니라 모든 해당 항목 충족이므로 참고값으로만 표시한다 (판정은 conformance.ts).
   *  판정 중인 항목이 있으면 null */
  confirmedRate: number | null;
  /** 모든 항목 판정이 끝났는지 */
  allConfirmed: boolean;
  /** 참고 수치 = (확정 적합 + 자동 오류 미발견) / (전체 − 해당 없음 − 해당 없음(자동)). 확정 값이 아님 */
  autoRate: number;
  total: number;
  pages: number;
  flows: number;
}

function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

export function summary(v: ScanView): ReportSummary {
  const counts = { pass: 0, fail: 0, na: 0, fail_auto: 0, clear_auto: 0, na_auto: 0, review: 0, untested: 0 } as Record<DisplayStatus, number>;
  for (const i of v.items) counts[displayStatus(i)]++;
  const total = v.items.length;
  // 판정 자료가 없는 옛 호출(테스트용 최소 view)은 점검자 확정만으로 본다
  const verdicts = v.verdicts ?? toolVerdicts(v.items, []);
  const vc = { pass: 0, fail: 0, na: 0, pending: 0 };
  for (const x of verdicts) vc[x.verdict ?? "pending"]++;
  const confirmed = total - vc.pending;
  return {
    counts,
    verdictCounts: vc,
    confirmed,
    reviewed: verdicts.filter((x) => x.reviewed).length,
    confirmedRate: verdictRate(verdicts),
    allConfirmed: total > 0 && confirmed === total,
    autoRate: pct(counts.pass + counts.clear_auto, total - counts.na - counts.na_auto),
    total,
    pages: v.pages.length,
    flows: new Set(v.pages.map((p) => p.flowId).filter(Boolean)).size,
  };
}

/** 결과 요약 한 줄 — 항목 수를 상태별로 나눠 보여 주고, 준수율은 모든 항목이 확정된 뒤에만 쓴다 */
export function summaryLine(s: ReportSummary, ja: boolean): string {
  const c = s.counts;
  if (ja) {
    const vc = s.verdictCounts;
    const conf = `全${s.total}項目・a11ynote判定 ${s.confirmed}（適合 ${vc.pass}・不適合 ${vc.fail}・適用なし ${vc.na}）・試験者確認 ${s.reviewed}`;
    const auto = `未確定: 問題の兆候（自動）${c.fail_auto}・問題未検出（自動）${c.clear_auto}・該当要素なし（自動）${c.na_auto}・要確認 ${c.review}・未試験 ${c.untested}`;
    const rate = s.confirmedRate === null ? `適合率: 全項目の確定後に算出（現在 ${s.confirmed}/${s.total} 確定）` : `適合率 ${s.confirmedRate}%（= 適合 ${vc.pass} ÷ 適合・不適合 ${vc.pass + vc.fail}、適用なしは除外。項目比率の参考値で、適合は該当項目をすべて満たすことで判断）`;
    return `${conf} / ${auto} / ${rate}`;
  }
  const vc = s.verdictCounts;
  const conf = `전체 ${s.total}개 항목 · 점검노트 판정 ${s.confirmed}개 (적합 ${vc.pass} · 부적합 ${vc.fail} · 해당 없음 ${vc.na}${vc.pending ? ` · 판정 중 ${vc.pending}` : ""}) · 점검자 검토 ${s.reviewed}개`;
  const auto = `자동 점검 결과: 오류 의심 ${c.fail_auto} · 자동 점검 오류 없음 ${c.clear_auto} · 해당 요소 없음 ${c.na_auto} · 수동 점검 필요 ${c.review} · 미점검 ${c.untested} · 점검자 확정 ${c.pass + c.fail + c.na}`;
  const rate = s.confirmedRate === null ? `준수율: 모든 항목 판정 후 계산 (현재 ${s.confirmed}/${s.total}개 판정)` : `준수율 ${s.confirmedRate}% (= 적합 ${vc.pass} ÷ 적합·부적합 ${vc.pass + vc.fail}, 해당 없음 제외, 점검노트 판정 기준. 항목 비율 참고값이며, 적합 여부는 모든 해당 항목 충족으로 판단 — 하나라도 부적합이면 미충족)`;
  return `${conf} / ${auto} / ${rate}`;
}

/** 문서 상태: 모든 항목이 확정되기 전에는 초안 */
export function docStatus(s: ReportSummary, ja: boolean, gate?: ScopeGate, submissionIncomplete = false): string {
  // 점검 범위가 대표 페이지가 아니면(인트로·접속 안내·같은 최종 URL만) 점검자 확정과 관계없이 범위 검토 초안으로 고정
  if (gate?.blocked) return ja ? `範囲確認用の草案・提出不可（${s.confirmed}/${s.total} 項目判定）` : `범위 검토 초안 · 제출용 아님 (${s.confirmed}/${s.total}개 항목 판정)`;
  if (submissionIncomplete) return ja ? `草案・提出情報の入力待ち（${s.confirmed}/${s.total} 項目判定）` : `초안 · 제출 정보 입력 필요 (${s.confirmed}/${s.total}개 항목 판정)`;
  if (s.allConfirmed) return ja ? `確定版（試験者確認 ${s.reviewed}/${s.total}）` : `확정본 (점검자 검토 ${s.reviewed}/${s.total}개 항목)`;
  return ja ? `草案・判定中（${s.confirmed}/${s.total} 項目判定）` : `초안 · 판정 진행 중 (${s.confirmed}/${s.total}개 항목 판정)`;
}

// ── 제출 정보 (독립 심사 P1-7): 모르는 값은 지어내지 않고 "초안: … 입력 필요"로 표시 ─────────────
/** 로컬·예시용 주소인지 (실제 제출 대상처럼 표현하지 않기 위해) */
export function isDemoTarget(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || /\.(localhost|test|example|invalid)$/.test(h) || /(^|\.)example\.(com|org|net)$/.test(h) || /(^|\.)example\.go\.kr$/.test(h) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h);
  } catch {
    return false;
  }
}

export interface SubmissionInfo {
  org: string;
  auditor: string;
  target: string;
  environment: string;
  /** 하나라도 비어 있거나 시연용이면 true */
  incomplete: boolean;
  demo: boolean;
}

export const DRAFT_INPUT_KO = "초안: 기관명/점검자/실제 대상 URL 입력 필요";
export const DRAFT_INPUT_JA = "草案: 機関名・試験者・実際の対象 URL の入力が必要";

export function submissionInfo(v: ScanView, ja: boolean): SubmissionInfo {
  // fixture 출처는 실제 도메인처럼 보이는 URL을 사용하더라도 제출용 자료로 취급하지 않는다.
  const demo = isDemoTarget(v.project.baseUrl) || v.scan.source === "fixture";
  const clientRaw = v.project.clientName?.trim() ?? "";
  const auditorRaw = v.project.auditorName?.trim() ?? "";
  const org = clientRaw || (ja ? "草案: 対象機関名の入力が必要" : "초안: 대상 기관명 입력 필요");
  const auditor = auditorRaw || (ja ? "草案: 試験者の入力が必要" : "초안: 점검자 입력 필요");
  const target = demo
    ? ja
      ? `${v.project.baseUrl}（デモ用テストサイト — 草案: 実際の対象 URL の入力が必要）`
      : `${v.project.baseUrl} (시연용 테스트 사이트 — 초안: 실제 대상 URL 입력 필요)`
    : v.project.baseUrl;
  const environment = v.project.targetEnvironment === "staging" ? (ja ? "検証・ステージング" : "스테이징·검수") : v.project.targetEnvironment === "development" ? (ja ? "開発" : "개발") : (ja ? "本番" : "운영");
  return { org, auditor, target, environment, incomplete: !clientRaw || !auditorRaw || demo, demo };
}

/** 표지에서 읽는 사람이 먼저 확인해야 하는 점검 범위의 위험 신호 */
export interface ScopeDiagnostics {
  duplicatePages: number;
  duplicateGroups: number;
  /** 중복 그룹에 포함된 전체 화면 수 (예: 같은 URL 3개면 3) */
  duplicateScreenTotal: number;
  suspectPages: { label: string; url: string; reason: string }[];
  redirectedPages: number;
  diagnosticPages: number;
}

function canonicalPageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

/** 리다이렉트·인트로·접속 차단 화면은 자동으로 제외하지 않고, 표지에서 재검토 대상으로 표시한다. */
export function scopeDiagnostics(v: ScanView): ScopeDiagnostics {
  const groups = new Map<string, number>();
  for (const p of v.pages) {
    const key = canonicalPageUrl(p.url);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const duplicateGroups = [...groups.values()].filter((n) => n > 1).length;
  const duplicatePages = [...groups.values()].reduce((n, count) => n + Math.max(0, count - 1), 0);
  const duplicateScreenTotal = [...groups.values()].reduce((n, count) => n + (count > 1 ? count : 0), 0);
  const suspectPages = v.pages
    .filter((p) => p.screenKind === "intro" || p.screenKind === "diagnostic" || /(^|[/ _-])(intro|landing|redirect|firewall|network|access[- ]?denied)([/ _-]|$)|인트로|리다이렉트|방화벽|네트워크|접속 차단/i.test(`${p.url} ${p.title} ${p.label} ${p.reason ?? ""}`))
    .map((p) => ({ label: p.label || p.title || "이름 없는 화면", url: p.url, reason: p.reason ?? "인트로·접속 안내 화면으로 보임" }));
  const redirectedPages = v.pages.filter((p) => Boolean(p.navigation?.redirected) || Boolean(p.requestedUrl && canonicalPageUrl(p.requestedUrl) !== canonicalPageUrl(p.url))).length;
  const diagnosticPages = v.pages.filter((p) => p.screenKind === "diagnostic").length;
  return { duplicatePages, duplicateGroups, duplicateScreenTotal, suspectPages, redirectedPages, diagnosticPages };
}

export interface ScopeGate {
  /** 제출용 완료본으로 쓸 수 없는 범위 */
  blocked: boolean;
  /** 화면 구성 자체가 대표 범위로 부족함 */
  structuralBlocked: boolean;
  /** 업무 흐름 포함 여부를 선택했지만 실제 흐름 증거가 맞지 않는 상태 */
  coverageBlocked: boolean;
  /** 점검자가 범위를 확인했는지 */
  approval: "pending" | "approved" | "rejected";
  /** 인트로·안내·오류가 아닌 서로 다른 최종 URL 수 */
  representativePages: number;
  uniqueFinalUrls: number;
  scopeMode: ScopeMode | null;
  flowPages: number;
  reasons: string[];
}

/**
 * 제출 가능 범위인지 판정. 대표 페이지(인트로·접속 안내·오류가 아닌 서로 다른 최종 URL)이 하나도 없거나,
 * 여러 화면을 점검했는데 최종 URL 이 하나뿐이면 결과를 제출용 완료본으로 쓰지 못하게 막는다.
 */
export function scopeGate(v: ScanView): ScopeGate {
  const d = scopeDiagnostics(v);
  const suspect = new Set(d.suspectPages.map((p) => canonicalPageUrl(p.url)));
  const unique = new Set(v.pages.map((p) => canonicalPageUrl(p.url)));
  const representative = [...unique].filter((u) => !suspect.has(u)).length;
  const reasons: string[] = [];
  if (v.pages.length && representative === 0) reasons.push("대표 페이지 없음 (점검한 페이지가 모두 인트로·리다이렉트·접속 안내로 보임)");
  if (v.pages.length > 1 && unique.size <= 1) reasons.push("점검한 페이지가 모두 같은 최종 URL");
  const structuralBlocked = reasons.length > 0;
  const approval = v.scan.scopeStatus === "approved" ? "approved" : v.scan.scopeStatus === "rejected" ? "rejected" : "pending";
  const scopeMode = v.scan.scopeMode === "public_pages" || v.scan.scopeMode === "public_and_flows" ? v.scan.scopeMode : null;
  const flowPages = v.pages.filter((p) => Boolean(p.flowId)).length;
  let coverageBlocked = false;
  if (!structuralBlocked && approval !== "approved") reasons.push("점검자가 점검 범위를 아직 확인하지 않음");
  if (approval === "approved" && !scopeMode) {
    coverageBlocked = true;
    reasons.push("이번 회차가 공개 화면만인지 업무 흐름 포함인지 아직 확인하지 않음");
  } else if (approval === "approved" && scopeMode === "public_and_flows" && flowPages === 0) {
    coverageBlocked = true;
    reasons.push("업무 흐름 포함으로 선택했지만 크롬 확장으로 기록한 흐름 화면이 없음");
  }
  return { blocked: structuralBlocked || coverageBlocked || approval !== "approved", structuralBlocked, coverageBlocked, approval, representativePages: representative, uniqueFinalUrls: unique.size, scopeMode, flowPages, reasons };
}

export function draftInputText(sub: SubmissionInfo, ja: boolean): string | null {
  const missing: string[] = [];
  if (sub.org.includes("입력") || sub.org.includes("入力")) missing.push(ja ? "機関名" : "점검 기관");
  if (sub.auditor.includes("입력") || sub.auditor.includes("入力")) missing.push(ja ? "試験者" : "점검자");
  if (sub.demo) missing.push(ja ? "実際の対象 URL" : "실제 대상 URL");
  if (!missing.length) return null;
  return ja ? `提出前に入力が必要: ${missing.join("・")}` : `제출 전 입력 필요: ${missing.join(", ")}`;
}

export const NOT_CERT_KO = "이 보고서는 자체진단 자료예요. 웹 접근성 품질인증을 뜻하지 않아요.";
export const NOT_CERT_JA = "本書は自動チェックと試験者確認のための自己試験資料であり、ウェブアクセシビリティの認証や適合を保証するものではありません。";

/** 고치는 법: 규칙별 설명이 있으면 그것(더 구체적), 없으면 기준 항목 설명 */
export function fixFor(v: ScanView, itemCode: string, ruleId?: string): string {
  const help = ruleId ? ruleHelp(ruleId, v.pack.locale === "ja" ? "ja" : "ko") : null;
  return help?.fix ?? itemByCode(v.pack, itemCode)?.fix ?? "";
}

export const DISCLAIMER_KO =
  "이 결과는 자동 점검과 점검자 확인을 거친 자체진단 결과예요. \"적합·부적합·해당 없음\"은 점검자가 확정한 판정이고, \"자동 신호(확정 아님)\"·\"사람 확인 필요\"·\"미확정\"은 확정되지 않은 값이에요. 자동 점검은 기준의 일부만 확인할 수 있으며, 이 문서는 웹 접근성 인증(품질마크)이나 법적 준수를 보장하지 않아요.";
export const DISCLAIMER_JA =
  "本結果は自動チェックと試験者の確認を経た自己試験の結果です。「適合・不適合・適用なし」は試験者が確定した項目で、「（自動）」の付いた結果と「要確認・未試験」は確定していない値です。自動チェックで確認できるのは基準の一部であり、本書は適合を保証するものではありません。";

function fmt(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " (KST)";
}

function skippedText(sk: { url: string; reason: string }[], ja: boolean): string {
  if (!sk.length) return ja ? "なし" : "없음";
  const by = new Map<string, number>();
  for (const x of sk) by.set(x.reason, (by.get(x.reason) ?? 0) + 1);
  return `${sk.length}${ja ? "ページ" : "개"} (${[...by].map(([r, n]) => `${r} ${n}`).join(", ")})`;
}

/** 보고서 첫 장의 점검 범위·한계 정보 (P0-10) */
export interface ScopeInfo {
  packVersion: string;
  engineVersion: string;
  pages: number;
  serverPages: number;
  extensionPages: number;
  flowPages: number;
  scopeMode: ScopeMode | null;
  /** 같은 틀이라 대표 페이지 하나만 점검하고 건너뛴 페이지 수 */
  groupedSkipped: number;
  untestedItems: string[];
  needsHumanItems: string[];
  aiConfig: string;
  skipped: { url: string; reason: string }[];
  when: string;
  /** WCAG-EM 3.e 무작위 표본으로 고른 화면 수 */
  randomPages: number;
  /** 화면별로 기록된 점검 브라우저·창 크기 (0.3.0 코어부터) */
  environments: EnvironmentSummary;
  /** 수동·보조기술·사용자 평가 기록 (최신 판) */
  evaluations: EvaluationSummary;
  /** 업무 흐름의 주요 분기 경로 (최신 판) */
  branches: ReturnType<typeof branchSummary>;
}

export function scopeInfo(v: ScanView): ScopeInfo {
  const serverPages = v.pages.filter((p) => !/확장/.test(p.reason ?? "")).length;
  const groupedSkipped = v.pages.reduce((sum, p) => sum + Math.max(0, Number(/\((\d+)개 묶음\)/.exec(p.reason ?? "")?.[1] ?? 1) - 1), 0);
  return {
    packVersion: v.scan.packVersion ?? v.pack.version,
    engineVersion: v.scan.engineVersion ?? "unknown (이전 버전에서 점검)",
    pages: v.pages.length,
    serverPages,
    extensionPages: v.pages.length - serverPages,
    flowPages: v.pages.filter((p) => p.flowId).length,
    scopeMode: v.scan.scopeMode === "public_pages" || v.scan.scopeMode === "public_and_flows" ? v.scan.scopeMode : null,
    groupedSkipped,
    untestedItems: v.items.filter((i) => i.status === "untested").map((i) => i.code),
    needsHumanItems: v.items.filter((i) => i.status === "review").map((i) => i.code),
    aiConfig: v.scan.aiConfig ?? "unknown",
    skipped: v.scan.skipped ?? [],
    when: `${fmt(v.scan.startedAt ?? v.scan.createdAt)} ~ ${v.scan.finishedAt ? fmt(v.scan.finishedAt) : "진행 중"}`,
    randomPages: v.pages.filter((p) => (p.reason ?? "") === RANDOM_REASON).length,
    environments: environmentSummary(v.evidence ?? []),
    evaluations: evaluationSummary(v.evaluations ?? []),
    branches: branchSummary(v.branches ?? []),
  };
}

/** 점검 범위·한계 문장 목록 (점검표·보고서 공통) */
export function scopeLines(v: ScanView, ja: boolean): [string, string][] {
  const sc = scopeInfo(v);
  const diag = scopeDiagnostics(v);
  const aiFindings = v.findings.filter((f) => f.method === "ai");
  const aiFallback = aiFindings.filter((f) => f.aiReason?.startsWith("[규칙 판정]")).length;
  const aiResolved = aiFindings.length - aiFallback;
  const aiModel = /\b(?:gemini|claude)\/[^·\s]+/i.exec(sc.aiConfig)?.[0] ?? "모델 설정 확인 필요";
  const aiSetting = aiFindings.length
    ? ja
      ? `AI 処理 ${aiFindings.length}件（AI 解釈 ${aiResolved}件・規則 fallback ${aiFallback}件・未確定）・モデル ${aiModel}`
      : `AI 처리 ${aiFindings.length}건 (실제 AI 해석 ${aiResolved}건 · 규칙 fallback ${aiFallback}건 · 확정 아님) · 모델 ${aiModel}`
    : ja ? "AI 未使用" : "AI 사용 없음";
  const duplicateNote = diag.duplicatePages
    ? ja
      ? `同じ最終 URL のページ ${diag.duplicateScreenTotal}件が ${diag.duplicateGroups}グループで重複しています（追加重複 ${diag.duplicatePages}件）。ページ数と影響範囲は試験者が確認してください。`
      : `같은 최종 URL 페이지 ${diag.duplicateScreenTotal}개가 ${diag.duplicateGroups}묶음으로 반복돼요(추가 중복 ${diag.duplicatePages}개). 화면 수와 영향 범위는 점검자가 확인해야 해요.`
    : ja ? "同じ最終 URL の重複はありません。" : "같은 주소로 겹친 페이지는 없어요.";
  const suspectNote = diag.suspectPages.length
    ? ja
      ? `イントロ・リダイレクト・接続案内と見られる画面 ${diag.suspectPages.length}件があり、代表画面か確認が必要です。`
      : `인트로·리다이렉트·접속 안내로 보이는 페이지 ${diag.suspectPages.length}개가 있어 대표 화면인지 확인이 필요해요.`
    : ja ? "イントロ・リダイレクト・接続案内と見られる画面はありません。" : "인트로·리다이렉트·접속 안내로 보이는 화면은 없어요.";
  const navigationNote = diag.redirectedPages
    ? ja
      ? `実際の到着先が要求 URL と異なるページ ${diag.redirectedPages}件。要求 URL と最終 URL を確認してください。`
      : `요청한 주소와 실제 도착 주소가 다른 페이지 ${diag.redirectedPages}개가 있어요. 요청 URL과 최종 URL을 확인해야 해요.`
    : ja ? "要求 URL と最終 URL の違いは記録されていません。" : "요청한 주소와 최종 도착 주소의 차이는 기록되지 않았어요.";
  const coverageNote = sc.scopeMode === "public_and_flows"
    ? ja ? `公開ページ＋実際の業務フロー（${sc.flowPages}ページ）` : `공개 화면 + 실제 업무 흐름 (${sc.flowPages}개 화면)`
    : sc.scopeMode === "public_pages"
      ? ja ? "公開ページのみ（ログイン後の業務フローは対象外）" : "공개 페이지만 (로그인 후 업무 흐름은 이번 점검에 넣지 않음)"
      : ja ? "未確認（公開ページのみか業務フローを含むか未選択）" : "확인 전 (공개 화면만인지 업무 흐름 포함인지 미선택)";
  if (ja) {
    return [
      ["適用規格", sc.packVersion],
      ["試験エンジン", sc.engineVersion],
      ["意味判断の設定", aiSetting],
      ["試験日時", sc.when],
      ["試験範囲", `${sc.pages}ページ（自動収集 ${sc.serverPages}、拡張機能 ${sc.extensionPages}、一連の業務フロー ${sc.flowPages}）`],
      ["ページ選定", `構造的サンプル ${sc.pages}ページ。業務フロー ${sc.flowPages}ページ。ログイン後の業務フローを自動で選定したとは限りません。${duplicateNote}`],
      ["範囲の注意", suspectNote],
      ["業務フローの範囲", coverageNote],
      ["到着先の注意", navigationNote],
      ["試験していない範囲", `${sc.untestedItems.length ? `未試験の達成基準: ${sc.untestedItems.join(", ")}。` : ""}試験できなかったページ: ${skippedText(sc.skipped, true)}。ログインが必要な画面は拡張機能で記録したもののみ（${sc.extensionPages}ページ）。一覧にないページは試験していません。`],
      ["収集・試験の規則", "URL の収集は robots.txt に従います（拡張機能のリンクで再計画する場合も同じ）。ページが別サイト（外部ログイン等）へ移動した場合は「試験範囲外」として除外します。キーボードは Tab と Shift+Tab の両方向で確認します。本書の URL は氏名・トークン・セッション等のクエリを削除した値です。"],
      ["判定の区分", "「適合・不適合・適用なし」は試験者が確定。「（自動）」「要確認」「未試験」は未確定。本書は認証ではありません。"],
    ];
  }
  return [
    ["점검 기준", sc.packVersion],
    ["점검 엔진", sc.engineVersion],
    ["의미 판단 설정", aiSetting],
    ["점검 시각", sc.when],
    ["점검 범위", `페이지 ${sc.pages}개 (자동 수집 ${sc.serverPages}, 크롬 확장 ${sc.extensionPages}, 업무 흐름 화면 ${sc.flowPages})`],
    ["페이지 고른 방식", `대표 페이지 ${sc.pages}개, 업무 흐름 페이지 ${sc.flowPages}개를 점검했어요. 로그인 후 업무 흐름은 직접 진행한 것만 들어가요. ${duplicateNote}`],
    ["범위 주의", suspectNote],
    ["업무 흐름 범위", coverageNote],
    ["도착 화면 주의", navigationNote],
    ["점검하지 않은 범위", `${sc.untestedItems.length ? `미검사 항목: ${sc.untestedItems.join(", ")}. ` : ""}점검하지 못한 화면: ${skippedText(sc.skipped, false)}. 로그인이 필요한 화면은 크롬 확장으로 기록한 ${sc.extensionPages}개만 포함. 목록에 없는 화면은 점검하지 않았어요.`],
    ["수집·점검 규칙", "주소 수집은 robots.txt 를 따르며(크롬 확장이 보낸 링크로 다시 계획할 때도 동일), 요청 사이에 간격을 둬요. 화면을 열었을 때 다른 사이트(외부 로그인 등)로 넘어가면 \"다른 사이트로 이동됨 (점검 범위 밖)\"으로 건너뛰어요. 키보드는 Tab(정방향)과 Shift+Tab(역방향)으로 초점 이동·초점 표시·키보드 함정을 확인해요. 한 회차에서 받는 데이터 양에는 회차별 상한이 있어요. 보고서의 주소는 이름·토큰·세션 같은 개인정보 쿼리를 지운 값이에요."],
    ["판정 구분", `최종 판정은 "점검자 확정"(적합·부적합·해당 없음)뿐이에요. "자동 신호(확정 아님)"·"자동 오류 미발견(확정 아님)"·"사람 확인 필요"·"미확정"은 확정되지 않은 값이고, "미점검"은 점검하지 못한 범위에만 써요. 기준 상태가 사람 확인 필요인 기준 ${sc.needsHumanItems.length}개. 이 문서는 인증이 아니에요.`],
  ];
}
