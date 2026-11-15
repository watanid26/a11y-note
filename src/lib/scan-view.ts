// 한 점검의 화면용·서류용 자료를 모은다.

import { and, asc, eq, inArray } from "drizzle-orm";
import { redactText, redactUrl } from "./security/url";
import { getPack, type Pack } from "../core/packs";
import { effectiveResult, isWcagOnlyTargetRule, summarizeItems, type FindingMethod, type FindingResult, type ItemSummary } from "../core/judge";
import { toolVerdicts, verdictRate, type ToolVerdict } from "../core/verdict";
import { db, finding, findingVerification, flow, flowBranch, itemDecision, itemVerdict, manualEvaluation, pageEvidence, pageState, scan, unmappedReference, type Finding, type FlowBranch, type ItemVerdict, type ManualEvaluation, type FindingVerification, type Flow, type PageEvidence, type PageState, type Project, type Scan, type UnmappedReferenceRow } from "./db";
import { cleanEnvironment, cleanRuleOutcomes } from "./evidence";
import { redactEvaluation } from "./manual-eval";
import { redactBranch } from "./flow-branch";

export interface FindingGroup {
  key: string;
  itemCode: string;
  ruleId: string;
  method: string;
  /** 사람 판정을 반영한 실제 결과 (fail | review | pending | pass) */
  result: string;
  /** 저장된 자동 결과 그대로 */
  autoResult: string;
  /** 점검자 판정 (없으면 null) — 자동 결과와 구분해 보존한다 */
  humanResult: "fail" | "pass" | null;
  message: string;
  selector: string;
  /** 같은 오류가 나온 화면 수 (머리글·바닥글 요소는 여러 화면에 반복된다) */
  pages: { pageStateId: string; label: string; url: string }[];
  /** 이 묶음에 든 발견 사항 id 전부 (사람 확인을 한 번에 적용할 때 씀) */
  findingIds: string[];
  sample: Finding;
}

export interface ScanView {
  scan: Scan;
  project: Project;
  pack: Pack;
  pages: PageState[];
  findings: Finding[];
  /** 자동 점검 결과에 대한 2차 검수 이력 (finding 은 바꾸지 않음). 새 표가 없거나 비어 있으면 [] */
  verifications: FindingVerification[];
  items: ItemSummary[];
  /** 점검노트 판정: items 와 같은 순서로 모든 항목의 적합·부적합·해당 없음 (core/verdict.ts) */
  verdicts: ToolVerdict[];
  /** 점검노트 판정 기준 준수율. 판정 중인 항목이 있으면 null */
  verdictRate: number | null;
  groups: FindingGroup[];
  flows: Flow[];
  pending: number;
  /** 사람이 볼 차례인 발견 사항 수 */
  toReview: number;
  /** 화면별 자동 점검 원본 증거 (axe 통과·해당 없음, 브라우저 환경). 판정에 쓰지 않음. 0022 미적용·옛 코어면 [] */
  evidence: PageEvidence[];
  /** 기준 외 참고: 검사항목에 연결되지 않은 자동 결과. 항목 상태·오류 수·비교에 넣지 않음. 0022 미적용이면 [] */
  references: UnmappedReferenceRow[];
  /** 수동·보조기술·사용자 평가 기록 (이력 전체, 시각 순). 항목 상태 계산에 넣지 않음. 0023 미적용이면 [] */
  evaluations: ManualEvaluation[];
  /** 이 프로젝트 업무 흐름의 주요 분기 경로 기록 (이력 전체). 0024 미적용이면 [] */
  branches: FlowBranch[];
}

/** buildScanView 에 더하는 선택 자료 (새 표는 마이그레이션 전 DB 에서 비어 있을 수 있다) */
export interface ScanExtras {
  evidence?: PageEvidence[];
  references?: UnmappedReferenceRow[];
  evaluations?: ManualEvaluation[];
  branches?: FlowBranch[];
  /** 점검노트 항목 판정 (0025). 미적용이면 [] */
  itemVerdicts?: ItemVerdict[];
}

export interface ReferenceRule {
  ruleId: string;
  engine: string;
  outcome: "violation" | "incomplete";
  wcag: string[];
  message: string;
  /** 걸린 요소 수 */
  count: number;
  pages: { pageStateId: string; label: string; url: string }[];
  samples: { pageStateId: string; selector: string; message: string }[];
}

/** 기준 외 참고 결과를 규칙·결과별로 묶는다 (보고서·JSON 공용) */
export function referenceRules(refs: UnmappedReferenceRow[], pages: Pick<PageState, "id" | "label" | "url">[]): ReferenceRule[] {
  const pageMap = new Map(pages.map((p) => [p.id, p]));
  const map = new Map<string, ReferenceRule>();
  for (const r of refs) {
    const key = `${r.ruleId}|${r.outcome}`;
    let g = map.get(key);
    if (!g) {
      g = { ruleId: r.ruleId, engine: r.engine, outcome: r.outcome, wcag: r.wcag ?? [], message: r.message, count: 0, pages: [], samples: [] };
      map.set(key, g);
    }
    g.count++;
    const p = pageMap.get(r.pageStateId);
    if (!g.pages.some((x) => x.pageStateId === r.pageStateId)) g.pages.push({ pageStateId: r.pageStateId, label: p?.label ?? "", url: p?.url ?? "" });
    if (g.samples.length < 20) g.samples.push({ pageStateId: r.pageStateId, selector: r.selector, message: r.message });
  }
  return [...map.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.outcome.localeCompare(b.outcome));
}

export interface RuleOutcomeSummaryRow {
  ruleId: string;
  help: string;
  tags: string[];
  /** 이 규칙이 통과한 화면 수 / 해당 요소가 없던 화면 수 (화면 단위, 요소 수 아님) */
  passedPages: number;
  inapplicablePages: number;
}

/** axe 통과·해당 없음 결과를 규칙별로 센다. 참고용이며 항목 적합 판정이 아니다 */
export function ruleOutcomeSummary(evidence: Pick<PageEvidence, "ruleOutcomes">[]): { pages: number; rules: RuleOutcomeSummaryRow[] } {
  const map = new Map<string, RuleOutcomeSummaryRow>();
  let pages = 0;
  for (const e of evidence) {
    if (!e.ruleOutcomes) continue;
    pages++;
    const add = (list: typeof e.ruleOutcomes.passed, field: "passedPages" | "inapplicablePages") => {
      for (const x of list ?? []) {
        let r = map.get(x.ruleId);
        if (!r) {
          r = { ruleId: x.ruleId, help: x.help, tags: x.tags, passedPages: 0, inapplicablePages: 0 };
          map.set(x.ruleId, r);
        }
        r[field]++;
      }
    };
    add(e.ruleOutcomes.passed, "passedPages");
    add(e.ruleOutcomes.inapplicable, "inapplicablePages");
  }
  return { pages, rules: [...map.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId)) };
}

export function effective(f: Pick<Finding, "humanResult" | "result" | "method">): string {
  return effectiveResult({ method: f.method as FindingMethod, result: f.result as FindingResult, humanResult: f.humanResult });
}

/** 같은 항목·규칙·요소의 문제는 화면이 달라도 하나로 묶는다 */
export function groupFindings(findings: Finding[], pages: PageState[]): FindingGroup[] {
  const pageMap = new Map(pages.map((p) => [p.id, p]));
  const map = new Map<string, FindingGroup>();
  for (const f of findings) {
    const res = effective(f);
    if (res === "pass" && !f.humanResult) continue;
    const key = `${f.itemCode}|${f.ruleId}|${f.selector}|${res}|${f.humanResult ? "h" : "a"}`;
    const page = pageMap.get(f.pageStateId);
    const g = map.get(key);
    const ref = { pageStateId: f.pageStateId, label: page?.label ?? "", url: page?.url ?? "" };
    if (g) {
      g.findingIds.push(f.id);
      if (!g.pages.some((p) => p.pageStateId === ref.pageStateId)) g.pages.push(ref);
    } else {
      map.set(key, { key, itemCode: f.itemCode, ruleId: f.ruleId, method: f.method, result: res, autoResult: f.result, humanResult: f.humanResult ?? null, message: f.message, selector: f.selector, pages: [ref], findingIds: [f.id], sample: f });
    }
  }
  const rank: Record<string, number> = { fail: 0, review: 1, pending: 2 };
  return [...map.values()].sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }) || (rank[a.result] ?? 9) - (rank[b.result] ?? 9));
}

export async function loadScanView(s: Scan, project: Project): Promise<ScanView> {
  const [pages, findings, decisions, flows, verifications] = await Promise.all([
    db.select().from(pageState).where(eq(pageState.scanId, s.id)).orderBy(asc(pageState.createdAt)),
    db.select().from(finding).where(eq(finding.scanId, s.id)),
    db.select().from(itemDecision).where(eq(itemDecision.scanId, s.id)),
    db.select().from(flow).where(eq(flow.projectId, project.id)).orderBy(asc(flow.createdAt)),
    // migration 0020 적용 전 DB 에서도 화면·서류가 열리도록 실패하면 빈 목록으로 본다
    db.select().from(findingVerification).where(eq(findingVerification.scanId, s.id)).orderBy(asc(findingVerification.createdAt)).catch(() => [] as FindingVerification[]),
  ]);
  // 0022 (원본 보존) · 0023 (수동·보조기술·사용자 평가) 표도 같은 방식으로 없으면 빈 목록
  const [evidence, references, evaluations, branches, itemVerdicts] = await Promise.all([
    db.select().from(pageEvidence).where(eq(pageEvidence.scanId, s.id)).catch(() => [] as PageEvidence[]),
    db.select().from(unmappedReference).where(eq(unmappedReference.scanId, s.id)).orderBy(asc(unmappedReference.createdAt)).catch(() => [] as UnmappedReferenceRow[]),
    db.select().from(manualEvaluation).where(eq(manualEvaluation.scanId, s.id)).orderBy(asc(manualEvaluation.createdAt)).catch(() => [] as ManualEvaluation[]),
    db.select().from(flowBranch).where(eq(flowBranch.projectId, project.id)).orderBy(asc(flowBranch.createdAt)).catch(() => [] as FlowBranch[]),
    db.select().from(itemVerdict).where(eq(itemVerdict.scanId, s.id)).catch(() => [] as ItemVerdict[]),
  ]);
  return buildScanView(s, project, pages, findings, decisions, flows, verifications, { evidence, references, evaluations, branches, itemVerdicts });
}

/** DB 행으로 화면·서류 자료를 만든다 (DB 없이 테스트할 수 있게 분리) */
export function buildScanView(
  s: Scan,
  project: Project,
  pages: PageState[],
  findings: Finding[],
  decisions: { itemCode: string; status: string; note: string | null }[],
  flows: Flow[],
  verifications: FindingVerification[] = [],
  extras: ScanExtras = {},
): ScanView {
  // 예전에 원문 주소로 저장된 화면도 화면·서류로 내보낼 때는 개인정보를 뺀다 (Codex 리뷰 2)
  pages = pages.map((p) => ({ ...p, url: redactUrl(p.url), label: redactText(p.label), title: redactText(p.title) }));
  const legacyTarget = (f: Finding) => project.pack === "kwcag22" && isWcagOnlyTargetRule(f.ruleId) && f.result === "fail" && !f.humanResult;
  findings = findings.map((f) => ({
    ...f,
    result: legacyTarget(f) ? "review" : f.result,
    message: redactText(f.message),
    html: redactText(f.html),
    aiReason: f.aiReason ? redactText(f.aiReason) : f.aiReason,
    aiSuggestion: f.aiSuggestion ? redactText(f.aiSuggestion) : f.aiSuggestion,
    reviewNote: f.reviewNote ? redactText(f.reviewNote) : f.reviewNote,
  }));
  s = { ...s, skipped: (s.skipped ?? []).map((x) => ({ ...x, url: redactUrl(x.url) })), plan: s.plan ? { ...s.plan, skipped: s.plan.skipped.map((x) => ({ ...x, url: redactUrl(x.url) })) } : s.plan };
  const pack = getPack(project.pack);
  const items = summarizeItems(
    pack,
    findings.map((f) => ({ itemCode: f.itemCode, method: f.method as FindingMethod, result: f.result as FindingResult, humanResult: f.humanResult ?? null })),
    pages.map((p) => p.applicable),
    decisions.map((d) => ({ itemCode: d.itemCode, status: d.status as "pass", note: d.note })),
  );
  const verdicts = toolVerdicts(items, extras.itemVerdicts ?? []);
  return {
    scan: s,
    project,
    pack,
    pages,
    findings,
    verifications: verifications.map((x) => ({ ...x, evidence: redactText(x.evidence) })),
    items,
    verdicts,
    verdictRate: verdictRate(verdicts),
    groups: groupFindings(findings, pages),
    flows,
    pending: findings.filter((f) => !f.humanResult && f.result === "pending").length, // 사람이 정한 것은 판정 대기가 아님 (Codex 리뷰 6)
    toReview: findings.filter((f) => !f.humanResult && effective(f) === "review").length,
    evidence: (extras.evidence ?? []).map((e) => ({ ...e, ruleOutcomes: cleanRuleOutcomes(e.ruleOutcomes), environment: cleanEnvironment(e.environment) })),
    references: (extras.references ?? []).map((r) => ({ ...r, message: redactText(r.message), html: redactText(r.html) })),
    evaluations: (extras.evaluations ?? []).map(redactEvaluation),
    branches: (extras.branches ?? []).map(redactBranch),
  };
}

/** 여러 점검(서버 자동 + 확장 녹화)를 합친 프로젝트 전체 보기 */
export async function latestScans(projectId: string): Promise<Scan[]> {
  return db.select().from(scan).where(eq(scan.projectId, projectId)).orderBy(asc(scan.createdAt));
}

export async function findingsByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(finding).where(and(inArray(finding.id, ids)));
}
