// 프로젝트 통합 점검 묶음 (inspection dossier): 서버 자동 점검과 크롬 확장 점검 결과를 한 사이트 단위로 합쳐 본다.
// 원칙
//  - 읽기만 한다. finding·scan·item_decision·finding_verification 은 바꾸지 않고, 새 표도 만들지 않는다.
//  - 같은 페이지(주소+흐름 단계)·항목·규칙·요소는 출처가 달라도 한 줄로 합치고, 어디서 나왔는지(출처)를 모두 남긴다.
//  - 판정 이력은 층으로 나눈다: v1 자동(서버·확장 규칙) → v2 AI(의미 후보 판단·자동 결과 재검수) → v3 점검자.
//    위 층이 아래 층을 덮어쓰지 않는다. "통합 참고" 값은 표시용 요약이며 확정 판정이 아니다.
//  - 출처끼리 결과가 다르면 고르지 않고 "충돌 → 사람 확인"으로 표시한다.
//  - 화면 크기(viewport)는 지금 DB 에 저장하지 않으므로 "기록 없음"으로 둔다 (추정하지 않음).

import { displayStatus, type DisplayStatus } from "../core/judge";
import { normalizeUrl, pageKey } from "./compare";
import type { ManualEvaluation, Scan } from "./db";
import { currentEvaluations, maskAccount } from "./manual-eval";
import { routeVerification, type VerificationResult, type VerificationRoute } from "./ai/verification-shared";
import { conformanceFromStatuses, type ConformanceSummary } from "./conformance";
import { latestAiVerification } from "./report/model";
import { ruleReference, type RuleReference } from "./standards-refs";
import { effective, referenceRules, type ScanView } from "./scan-view";
import { environmentText } from "./evidence";
import { branchSummary } from "./flow-branch";
import { reproLines } from "./report/repro";
import { RANDOM_REASON } from "./sampling";

export const BUNDLE_VERSION = "bundle-v2";

/** 법적·인증 경계 고지. 「디지털포용법」 제21조: 접근성 품질인증은 지정 인증기관만 하며, 거짓 인증 표시는 금지된다 */
export const LEGAL_NOTE_KO =
  "이 묶음은 자동 점검·AI 보조·점검자 확인 기록을 모은 자체진단 자료입니다. 웹 접근성 품질인증은 지정된 인증기관이 서면·기술 심사(전문가·장애인 사용자 평가 포함)를 거쳐 부여하며, 이 자료는 인증·적합 보증이 아니고 인증 표시로 쓸 수 없습니다.";

/** 지금 저장하지 않아 기록할 수 없는 평가 정보 (WCAG-EM 보고 권장 항목). 추정하지 않고 "기록 없음"으로 둔다 */
export const NOT_RECORDED = [
  "접근성 지원 기준 (지원 대상 브라우저·보조기술 조합의 합의 기록)",
] as const;

/**
 * 저장은 하지만 이 묶음의 회차에 기록이 없을 수 있는 정보. 비어 있으면 "기록 없음"으로 밝힌다 (추정하지 않음).
 *  - 브라우저 버전·화면 크기: 0.3.0 코어 이후 점검한 페이지만 (0022)
 *  - 보조기술 점검·장애인 사용자 평가: 점검자가 기록한 것만 (0023)
 *  - 재현 절차: 녹화한 흐름 단계·점검 환경이 있을 때만, 없으면 공통 절차
 *  - 무작위 표본: 서버·확장 자동 수집 회차만 (파일 업로드·직접 기록 화면은 없음)
 *  - 흐름의 주요 분기 경로: 점검자가 기록한 것만 (0024)
 */
export function missingRecords(b: Pick<ProjectBundle, "pages" | "methods" | "metadata" | "issues">): string[] {
  const out: string[] = [...NOT_RECORDED];
  if (!b.pages.some((p) => p.environments.length)) out.push("브라우저 버전", "화면 크기 (viewport)");
  if (!b.methods.assistiveTech) out.push("보조기술(화면 낭독기·음성 제어·확대) 점검");
  if (!b.methods.userTesting) out.push("장애인 사용자 평가");
  if (b.issues.length && !b.issues.some((i) => i.repro)) out.push("재현 절차 (오류별 조작 순서)");
  if (!b.metadata.sample.random) out.push("무작위 표본 (WCAG-EM: 구조적 표본의 10%)");
  if (!b.metadata.sample.branches.total) out.push("흐름의 주요 분기 경로 (기본 경로 외)");
  return out;
}

export type BundleSource = "server" | "extension" | "file";
export const SOURCE_LABEL: Record<BundleSource, string> = { server: "서버 자동 점검", extension: "크롬 확장 점검", file: "파일 업로드" };

/** scan.source → 묶음 출처. browser(확장 자동 점검)와 extension(확장 업로드)은 둘 다 크롬 확장이다 */
export function bundleSource(source: string): BundleSource | null {
  if (source === "server") return "server";
  if (source === "extension" || source === "browser") return "extension";
  if (source === "file") return "file";
  return null; // fixture 등 시험용 회차는 묶음에 넣지 않는다
}

/** 기본 묶음 대상: 출처마다 가장 최근에 끝난 회차 하나씩 */
export function pickBundleScans(scans: Pick<Scan, "id" | "source" | "status" | "createdAt">[]): string[] {
  const latest = new Map<BundleSource, { id: string; at: number }>();
  for (const s of scans) {
    const src = bundleSource(s.source);
    if (!src || s.status !== "done") continue;
    const prev = latest.get(src);
    if (!prev || +s.createdAt > prev.at) latest.set(src, { id: s.id, at: +s.createdAt });
  }
  return (["server", "extension", "file"] as BundleSource[]).flatMap((k) => (latest.has(k) ? [latest.get(k)!.id] : []));
}

export type EvidenceKind = "auto" | "ai_semantic" | "ai_verification" | "human";
export const REVISION: Record<EvidenceKind, "v1" | "v2" | "v3"> = { auto: "v1", ai_semantic: "v2", ai_verification: "v2", human: "v3" };
export const EVIDENCE_LABEL: Record<EvidenceKind, string> = { auto: "자동 규칙", ai_semantic: "AI 보조 판단 (의미 후보)", ai_verification: "AI 검증 (자동 결과 재검수)", human: "점검자 판정" };

export interface EvidenceLayer {
  rev: "v1" | "v2" | "v3";
  kind: EvidenceKind;
  /** 이 근거가 나온 점검 출처 (점검자·AI 층도 어느 회차의 결과에 붙었는지 남긴다) */
  source: BundleSource;
  scanId: string;
  findingId: string;
  result: string;
  confidence: number | null;
  route?: VerificationRoute;
  by: string | null;
  at: string | null;
  promptVersion?: string | null;
}

export interface BundleOccurrence {
  source: BundleSource;
  scanId: string;
  findingId: string;
  pageStateId: string;
  method: string;
  autoResult: string;
  humanResult: "fail" | "pass" | null;
  effective: string;
}

export type BundleConflict = "source_disagree" | "human_disagree" | "ai_contradicts";
export const CONFLICT_LABEL: Record<BundleConflict, string> = {
  source_disagree: "출처끼리 결과가 다름 (한쪽만 문제 발견)",
  human_disagree: "점검자 판정이 회차마다 다름",
  ai_contradicts: "AI 검증이 자동 결과를 반박",
};

export interface BundleIssue {
  key: string;
  pageKey: string;
  url: string;
  label: string;
  /** viewport: 그 화면을 처음 기록한 출처의 창 크기 (0.3.0 코어부터, 없으면 null) */
  state: { flowId: string | null; flowStep: number | null; screenKind: string | null; viewport: { w: number; h: number } | null };
  /** 재현 절차 (녹화 흐름 단계·점검 환경이 있을 때만, 없으면 null) */
  repro: string[] | null;
  itemCode: string;
  itemTitle: string;
  ruleId: string;
  selector: string;
  message: string;
  sources: BundleSource[];
  /** 규칙의 WCAG 성공기준·ACT 규칙 참고 대응 (axe 메타데이터, KWCAG 연결과 별개) */
  refs: RuleReference;
  occurrences: BundleOccurrence[];
  /** v1 → v2 → v3 순서, 같은 층 안에서는 시각 순서 */
  layers: EvidenceLayer[];
  /** 통합 참고값 (확정 아님): 점검자 판정이 하나로 모이면 그것, 아니면 출처 중 가장 나쁜 결과. 충돌이면 review */
  combined: string;
  conflicts: BundleConflict[];
}

export interface BundlePage {
  pageKey: string;
  url: string;
  label: string;
  flowId: string | null;
  flowStep: number | null;
  screenKind: string | null;
  viewport: { w: number; h: number } | null;
  /** 점검 환경 한 줄 (브라우저·OS·창 크기, 출처마다 다를 수 있어 모두 남긴다) */
  environments: string[];
  sources: BundleSource[];
}

export interface BundleItem {
  code: string;
  title: string;
  bySource: Partial<Record<BundleSource, DisplayStatus>>;
  combined: DisplayStatus;
  conflict: boolean;
}

export interface BundleMetadata {
  evaluator: string | null;
  commissioner: string | null;
  generatedAt: string;
  standard: string;
  /** 판정 대상: KWCAG 는 수준 구분 없이 전체 항목, JIS 는 항목별 A/AA */
  target: string;
  environment: string;
  engines: string[];
  aiConfigs: string[];
  /** random: WCAG-EM 무작위 표본 화면 수 · branches: 업무 흐름 주요 분기 (최신 판) */
  sample: { pages: number; required: number; templates: number; flows: number; flowSteps: number; random: number; branches: { total: number; tested: number; planned: number; blocked: number; na: number } };
  /** 이 묶음에 기록이 없는 WCAG-EM 보고 권장 정보 (missingRecords) */
  notRecorded: string[];
}

/** 점검 방법별 기록 수: 자동 · 자동 확인 필요(incomplete) · AI · 점검자 · 보조기술 · 사용자 */
export interface MethodCoverage {
  automatedFindings: number;
  automatedNeedsReview: number;
  aiSemantic: number;
  aiVerification: number;
  humanFindingDecisions: number;
  humanItemDecisions: number;
  /** axe 통과·해당 없음 원본을 보존한 화면 수 (적합 판정 아님, 0.3.0 코어부터) */
  ruleOutcomePages: number;
  /** 수동·보조기술·사용자 평가 기록 수 (최신 판만, 0023). 0 이면 서류에 "기록 없음" */
  manualChecks: number;
  assistiveTech: number;
  userTesting: number;
}

export interface BundleEvaluation {
  id: string;
  source: BundleSource;
  scanId: string;
  kind: ManualEvaluation["kind"];
  itemCode: string | null;
  pageKey: string | null;
  findingId: string | null;
  flowId: string | null;
  method: string | null;
  assistiveTech: string | null;
  browser: string | null;
  os: string | null;
  participantCode: string | null;
  participantProfile: string | null;
  task: string | null;
  result: ManualEvaluation["result"];
  severity: ManualEvaluation["severity"];
  notes: string;
  steps: string[];
  supersedes: string | null;
  /** 최신 판인지 (다른 기록이 이 기록을 고쳤으면 false) */
  current: boolean;
  evaluator: string;
  performedAt: string | null;
  createdAt: string;
}

export interface ProjectBundle {
  version: string;
  legalNote: string;
  project: { id: string; name: string; baseUrl: string; pack: string };
  metadata: BundleMetadata;
  methods: MethodCoverage;
  /** 통합 참고 항목 상태로 계산한 항목 단위 적합 요약 (평균 점수 아님) */
  conformance: ConformanceSummary;
  scans: { id: string; source: BundleSource; rawSource: string; label: string | null; createdAt: string; finishedAt: string | null; packVersion: string | null; engineVersion: string | null; aiConfig: string | null; scopeStatus: string }[];
  warnings: string[];
  pages: BundlePage[];
  issues: BundleIssue[];
  items: BundleItem[];
  counts: { issues: number; multiSource: number; conflicts: number; humanDecided: number; aiVerified: number };
  /** 기준 외 참고: 검사항목에 연결되지 않은 자동 결과. 판정·문제 수·충돌에 넣지 않는다 */
  references: { total: number; rules: BundleReferenceRule[] };
  /** 수동·보조기술·사용자 평가 기록 (이력 전체). 항목 상태·충돌 계산에 넣지 않는다 */
  evaluations: BundleEvaluation[];
}

export interface BundleReferenceRule {
  ruleId: string;
  outcome: "violation" | "incomplete";
  /** 도구 표기 그대로 (KWCAG 연결 아님) */
  wcag: string[];
  message: string;
  count: number;
  pages: number;
  sources: BundleSource[];
}

const RANK: Record<string, number> = { fail: 0, review: 1, pending: 2, pass: 3 };
const worst = (rs: string[]) => rs.reduce((a, b) => ((RANK[b] ?? 9) < (RANK[a] ?? 9) ? b : a), "pass");
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

// 항목 상태 합치기: 점검자 확정이 있으면 그것(서로 다르면 충돌), 없으면 가장 나쁜 자동 상태
const ITEM_RANK: Record<DisplayStatus, number> = { fail: 0, fail_auto: 1, review: 2, untested: 3, clear_auto: 4, na_auto: 5, pass: 6, na: 7 };
const HUMAN_ITEM = new Set<DisplayStatus>(["pass", "fail", "na"]);

export function buildProjectBundle(views: ScanView[]): ProjectBundle {
  if (!views.length) throw new Error("묶을 회차가 없습니다.");
  const project = views[0].project;
  const warnings: string[] = [];
  const sided = views.flatMap((v) => {
    const source = bundleSource(v.scan.source);
    return source ? [{ v, source }] : [];
  });
  if (sided.some((x) => x.v.project.id !== project.id)) throw new Error("다른 사이트의 회차는 묶을 수 없습니다.");
  const bySrc = new Map<BundleSource, number>();
  for (const { source } of sided) bySrc.set(source, (bySrc.get(source) ?? 0) + 1);
  for (const [s, n] of bySrc) if (n > 1) warnings.push(`${SOURCE_LABEL[s]} 회차가 ${n}개 들어 있습니다. 같은 출처의 여러 회차는 시점이 달라 결과가 섞일 수 있습니다.`);
  const pv = new Set(sided.map((x) => x.v.scan.packVersion ?? "unknown"));
  if (pv.size > 1) warnings.push(`회차마다 점검 기준 버전이 다릅니다 (${[...pv].join(" / ")}). 차이가 기준 변화 때문일 수 있습니다.`);
  const ev = new Set(sided.map((x) => x.v.scan.engineVersion ?? "unknown"));
  if (ev.size > 1) warnings.push(`회차마다 점검 엔진 버전이 다릅니다 (${[...ev].join(" / ")}).`);
  for (const { v, source } of sided) if (v.scan.scopeStatus !== "approved") warnings.push(`${SOURCE_LABEL[source]} 회차(${v.scan.id.slice(0, 8)})의 점검 범위를 점검자가 아직 확인하지 않았습니다.`);

  // 1) 화면: 출처별로 어느 화면을 실제로 봤는지 (충돌 판단에 쓴다)
  const pages = new Map<string, BundlePage>();
  const covered = new Map<string, Set<BundleSource>>();
  for (const { v, source } of sided) {
    const envByPage = new Map((v.evidence ?? []).map((e) => [e.pageStateId, e.environment]));
    for (const p of v.pages) {
      const k = pageKey(p);
      const prev = pages.get(k);
      const env = envByPage.get(p.id);
      const envText = environmentText(env);
      if (prev) {
        if (!prev.sources.includes(source)) prev.sources.push(source);
        if (!prev.viewport && env) prev.viewport = env.viewport;
        if (envText && !prev.environments.includes(envText)) prev.environments.push(envText);
      } else {
        pages.set(k, { pageKey: k, url: normalizeUrl(p.url), label: p.label, flowId: p.flowId, flowStep: p.flowStep, screenKind: p.screenKind ?? null, viewport: env?.viewport ?? null, environments: envText ? [envText] : [], sources: [source] });
      }
      covered.set(k, (covered.get(k) ?? new Set()).add(source));
    }
  }

  // 2) 발견 사항 합치기
  const issues = new Map<string, BundleIssue>();
  for (const { v, source } of sided) {
    const pageById = new Map(v.pages.map((p) => [p.id, p]));
    const flowById = new Map(v.flows.map((f) => [f.id, f]));
    const envByPage = new Map((v.evidence ?? []).map((e) => [e.pageStateId, e.environment]));
    const verif = latestAiVerification(v);
    for (const f of v.findings) {
      const page = pageById.get(f.pageStateId);
      if (!page) continue;
      const pk = pageKey(page);
      const key = `${pk}§${f.itemCode}|${f.ruleId}|${f.selector.trim()}`;
      let it = issues.get(key);
      if (!it) {
        it = {
          key,
          pageKey: pk,
          url: normalizeUrl(page.url),
          label: page.label,
          state: { flowId: page.flowId, flowStep: page.flowStep, screenKind: page.screenKind ?? null, viewport: envByPage.get(page.id)?.viewport ?? null },
          repro: reproLines({ page, flow: page.flowId ? flowById.get(page.flowId) : undefined, environment: envByPage.get(page.id) }, "선택자 요소에서 문제를 확인한다"),
          itemCode: f.itemCode,
          itemTitle: v.pack.items.find((i) => i.code === f.itemCode)?.title ?? f.itemCode,
          ruleId: f.ruleId,
          selector: f.selector,
          message: f.message,
          sources: [],
          refs: ruleReference(f.ruleId),
          occurrences: [],
          layers: [],
          combined: "pass",
          conflicts: [],
        };
        issues.set(key, it);
      }
      if (!it.sources.includes(source)) it.sources.push(source);
      const eff = effective(f);
      it.occurrences.push({ source, scanId: v.scan.id, findingId: f.id, pageStateId: f.pageStateId, method: f.method, autoResult: f.result, humanResult: f.humanResult ?? null, effective: eff });
      const base = { source, scanId: v.scan.id, findingId: f.id };
      const kind: EvidenceKind = f.method === "ai" ? "ai_semantic" : f.method === "manual" ? "human" : "auto"; // manual = 점검자가 직접 기록한 발견 사항
      it.layers.push({ ...base, rev: REVISION[kind], kind, result: f.result, confidence: kind === "ai_semantic" ? f.confidence : null, by: null, at: iso(f.createdAt) });
      const x = verif.get(f.id);
      if (x) it.layers.push({ ...base, rev: "v2", kind: "ai_verification", result: x.result as VerificationResult, confidence: x.confidence, route: routeVerification(x.autoResult, x), by: `${x.provider ?? ""}/${x.model ?? ""}`, at: iso(x.createdAt), promptVersion: x.promptVersion });
      if (f.humanResult) it.layers.push({ ...base, rev: "v3", kind: "human", result: f.humanResult, confidence: null, by: f.reviewedBy ? "점검자" : null, at: iso(f.reviewedAt) });
    }
  }

  for (const it of issues.values()) {
    it.layers.sort((a, b) => a.rev.localeCompare(b.rev) || (a.at ?? "").localeCompare(b.at ?? ""));
    const humans = new Set(it.occurrences.flatMap((o) => (o.humanResult ? [o.humanResult] : [])));
    if (humans.size > 1) it.conflicts.push("human_disagree");
    // 이 화면을 본 다른 출처가 같은 문제를 내지 않았으면 출처 충돌 (그 출처가 화면을 보지 않았으면 충돌 아님)
    const problemSources = new Set(it.occurrences.filter((o) => o.effective !== "pass").map((o) => o.source));
    const saw = covered.get(it.pageKey) ?? new Set();
    if (problemSources.size && [...saw].some((s) => !problemSources.has(s))) it.conflicts.push("source_disagree");
    if (it.layers.some((l) => l.kind === "ai_verification" && l.result === "contradicted")) it.conflicts.push("ai_contradicts");
    if (humans.size === 1 && !it.conflicts.includes("source_disagree")) it.combined = [...humans][0];
    else if (it.conflicts.includes("human_disagree") || it.conflicts.includes("source_disagree")) it.combined = "review";
    else it.combined = worst(it.occurrences.map((o) => o.effective));
  }

  // 3) 항목: 출처별 상태를 나란히 두고, 통합 참고값을 따로 계산한다
  const items: BundleItem[] = [];
  const pack = views[0].pack;
  for (const item of pack.items) {
    const bySource: Partial<Record<BundleSource, DisplayStatus>> = {};
    const all: DisplayStatus[] = [];
    for (const { v, source } of sided) {
      const s = v.items.find((i) => i.code === item.code);
      if (!s) continue;
      const d = displayStatus(s);
      all.push(d);
      const prev = bySource[source];
      bySource[source] = prev && ITEM_RANK[prev] < ITEM_RANK[d] ? prev : d;
    }
    if (!all.length) continue;
    const human = new Set(all.filter((d) => HUMAN_ITEM.has(d)));
    const autoBad = all.some((d) => d === "fail_auto");
    let combined: DisplayStatus;
    let conflict = false;
    if (human.size > 1) {
      combined = "review";
      conflict = true;
    } else if (human.size === 1) {
      combined = [...human][0];
      // 점검자가 적합·해당 없음으로 정했는데 다른 출처의 자동 신호가 남아 있으면 사람에게 다시 알린다
      conflict = combined !== "fail" && autoBad;
      if (conflict) combined = "review";
    } else {
      combined = all.reduce((a, b) => (ITEM_RANK[b] < ITEM_RANK[a] ? b : a));
      conflict = new Set(all.map((d) => (d === "fail_auto" ? "bad" : d === "clear_auto" ? "good" : "other"))).size > 1 && all.includes("fail_auto") && all.includes("clear_auto");
    }
    items.push({ code: item.code, title: item.title, bySource, combined, conflict });
  }

  const list = [...issues.values()].sort(
    (a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }) || (RANK[a.combined] ?? 9) - (RANK[b.combined] ?? 9) || a.pageKey.localeCompare(b.pageKey) || a.selector.localeCompare(b.selector),
  );
  // 자동으로 pass 만 남은 줄(문제 없음)은 묶음에서 뺀다. 점검자가 pass 로 정한 줄은 이력으로 남긴다
  const shown = list.filter((i) => i.occurrences.some((o) => o.effective !== "pass" || o.humanResult));
  const allPages = sided.flatMap(({ v }) => v.pages);
  const allFindings = sided.flatMap(({ v }) => v.findings);
  const flowKeys = new Set(allPages.filter((p) => p.flowId).map((p) => p.flowId));
  const metadata: BundleMetadata = {
    evaluator: project.auditorName?.trim() || null,
    commissioner: project.clientName?.trim() || null,
    generatedAt: new Date().toISOString(),
    standard: `${pack.name} · ${pack.version}`,
    target: pack.items.some((i) => i.level) ? "항목별 적합 수준(A·AA) 표기" : "KWCAG 2.2 전체 항목 (수준 구분 없음)",
    environment: project.targetEnvironment ?? "production",
    engines: [...new Set(sided.map(({ v }) => v.scan.engineVersion ?? "unknown"))],
    aiConfigs: [...new Set(sided.map(({ v }) => v.scan.aiConfig ?? "unknown"))],
    sample: {
      pages: pages.size,
      required: new Set(allPages.filter((p) => (p.reason ?? "").startsWith("필수")).map((p) => pageKey(p))).size,
      templates: new Set(allPages.map((p) => p.templateKey).filter(Boolean)).size,
      flows: flowKeys.size,
      flowSteps: allPages.filter((p) => p.flowId).length,
      random: new Set(allPages.filter((p) => p.reason === RANDOM_REASON).map((p) => pageKey(p))).size,
      // 분기는 프로젝트 단위라 회차마다 같은 목록이다: 첫 회차 것을 쓴다
      branches: branchSummary(sided[0]?.v.branches ?? []),
    },
    notRecorded: [],
  };
  const methods: MethodCoverage = {
    automatedFindings: allFindings.filter((f) => f.method === "auto").length,
    automatedNeedsReview: allFindings.filter((f) => f.method === "auto" && f.result === "review").length,
    aiSemantic: allFindings.filter((f) => f.method === "ai").length,
    aiVerification: sided.reduce((n, { v }) => n + latestAiVerification(v).size, 0),
    humanFindingDecisions: allFindings.filter((f) => f.humanResult || f.method === "manual").length,
    humanItemDecisions: sided.reduce((n, { v }) => n + v.items.filter((i) => i.decidedBy === "human").length, 0),
    ruleOutcomePages: sided.reduce((n, { v }) => n + (v.evidence ?? []).filter((e) => e.ruleOutcomes).length, 0),
    ...(() => {
      const cur = sided.flatMap(({ v }) => currentEvaluations(v.evaluations ?? []));
      return { manualChecks: cur.filter((e) => e.kind === "manual").length, assistiveTech: cur.filter((e) => e.kind === "assistive_tech").length, userTesting: cur.filter((e) => e.kind === "user_testing").length };
    })(),
  };
  const bundle: ProjectBundle = {
    version: BUNDLE_VERSION,
    legalNote: LEGAL_NOTE_KO,
    project: { id: project.id, name: project.name, baseUrl: project.baseUrl, pack: project.pack },
    metadata,
    methods,
    conformance: conformanceFromStatuses(items.map((i) => ({ code: i.code, status: i.combined }))),
    scans: sided.map(({ v, source }) => ({
      id: v.scan.id,
      source,
      rawSource: v.scan.source,
      label: v.scan.label,
      createdAt: iso(v.scan.createdAt)!,
      finishedAt: iso(v.scan.finishedAt),
      packVersion: v.scan.packVersion,
      engineVersion: v.scan.engineVersion,
      aiConfig: v.scan.aiConfig,
      scopeStatus: v.scan.scopeStatus,
    })),
    warnings,
    pages: [...pages.values()].sort((a, b) => a.pageKey.localeCompare(b.pageKey)),
    issues: shown,
    items,
    counts: {
      issues: shown.length,
      multiSource: shown.filter((i) => i.sources.length > 1).length,
      conflicts: shown.filter((i) => i.conflicts.length).length + items.filter((i) => i.conflict).length,
      humanDecided: shown.filter((i) => i.layers.some((l) => l.kind === "human")).length,
      aiVerified: shown.filter((i) => i.layers.some((l) => l.kind === "ai_verification")).length,
    },
    references: bundleReferences(sided),
    evaluations: bundleEvaluations(sided),
  };
  bundle.metadata.notRecorded = missingRecords(bundle);
  return bundle;
}

function bundleEvaluations(sided: { v: ScanView; source: BundleSource }[]): BundleEvaluation[] {
  return sided.flatMap(({ v, source }) => {
    const cur = new Set(currentEvaluations(v.evaluations ?? []).map((e) => e.id));
    const pageById = new Map(v.pages.map((p) => [p.id, p]));
    return (v.evaluations ?? []).map((e) => {
      const page = e.pageStateId ? pageById.get(e.pageStateId) : undefined;
      return {
        id: e.id,
        source,
        scanId: e.scanId,
        kind: e.kind,
        itemCode: e.itemCode,
        pageKey: page ? pageKey(page) : null,
        findingId: e.findingId,
        flowId: e.flowId,
        method: e.method,
        assistiveTech: [e.assistiveTech, e.assistiveTechVersion].filter(Boolean).join(" ") || null,
        browser: [e.browser, e.browserVersion].filter(Boolean).join(" ") || null,
        os: [e.os, e.device].filter(Boolean).join(" / ") || null,
        participantCode: e.participantCode,
        participantProfile: e.participantProfile,
        task: e.task,
        result: e.result,
        severity: e.severity,
        notes: e.notes,
        steps: e.steps ?? [],
        supersedes: e.supersedes,
        current: cur.has(e.id),
        evaluator: maskAccount(e.evaluator),
        performedAt: iso(e.performedAt),
        createdAt: iso(e.createdAt)!,
      };
    });
  });
}

function bundleReferences(sided: { v: ScanView; source: BundleSource }[]): ProjectBundle["references"] {
  const map = new Map<string, BundleReferenceRule & { pageKeys: Set<string> }>();
  let total = 0;
  for (const { v, source } of sided) {
    const pageById = new Map(v.pages.map((p) => [p.id, p]));
    for (const r of referenceRules(v.references ?? [], v.pages)) {
      total += r.count;
      const k = `${r.ruleId}|${r.outcome}`;
      let g = map.get(k);
      if (!g) {
        g = { ruleId: r.ruleId, outcome: r.outcome, wcag: r.wcag, message: r.message.split(" — ")[0], count: 0, pages: 0, sources: [], pageKeys: new Set() };
        map.set(k, g);
      }
      g.count += r.count;
      for (const pg of r.pages) {
        const page = pageById.get(pg.pageStateId);
        if (page) g.pageKeys.add(pageKey(page));
      }
      if (!g.sources.includes(source)) g.sources.push(source);
    }
  }
  const rules = [...map.values()].map(({ pageKeys, ...r }) => ({ ...r, pages: pageKeys.size })).sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.outcome.localeCompare(b.outcome));
  return { total, rules };
}
