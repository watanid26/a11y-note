// 점검 화면(클라이언트)에 보내는 JSON. 실시간 갱신(폴링)에도 같은 형태를 쓴다.
import { displayStatus } from "../core/judge";
import { referenceRules, ruleOutcomeSummary, type ScanView } from "./scan-view";
import { issueRecords, reportMetrics, verificationRows } from "./report/model";
import { verificationQueue } from "./verification-queue";
import { conformanceSummary } from "./conformance";
import { evaluationSummary } from "./manual-eval";
import { environmentSummary, environmentText } from "./evidence";
import { branchSummary } from "./flow-branch";
import { RANDOM_REASON } from "./sampling";
import { scopeDiagnostics, scopeGate } from "./report/data";
import { sampleSummary, typeCoverage } from "./report/sample-basis";

export function viewJson(v: ScanView) {
  const gate = scopeGate(v);
  const diagnostics = scopeDiagnostics(v);
  return {
    scan: { id: v.scan.id, aiConfig: v.scan.aiConfig, source: v.scan.source, status: v.scan.status, progress: v.scan.progress, label: v.scan.label, createdAt: v.scan.createdAt, error: v.scan.error },
    project: { id: v.project.id, clientName: v.project.clientName, name: v.project.name, baseUrl: v.project.baseUrl, targetEnvironment: v.project.targetEnvironment, pack: v.project.pack, aiEnabled: v.project.aiEnabled },
    packName: v.pack.name,
    locale: v.pack.locale,
    pending: v.pending,
    toReview: v.toReview,
    /** 화면·서류 공통 수치 (기준·유형·위치·화면) */
    metrics: reportMetrics(v),
    /** 항목 단위 적합 요약 (평균 점수 아님, 점검자 확정 기준) */
    conformance: conformanceSummary(v.items),
    scope: {
      blocked: gate.blocked,
      structuralBlocked: gate.structuralBlocked,
      coverageBlocked: gate.coverageBlocked,
      approval: gate.approval,
      scopeMode: gate.scopeMode,
      flowPages: gate.flowPages,
      reviewedAt: v.scan.scopeReviewedAt,
      representativePages: gate.representativePages,
      uniqueFinalUrls: gate.uniqueFinalUrls,
      reasons: gate.reasons,
      duplicatePages: diagnostics.duplicatePages,
      duplicateGroups: diagnostics.duplicateGroups,
      redirectedPages: diagnostics.redirectedPages,
      diagnosticPages: diagnostics.diagnosticPages,
      suspectPages: diagnostics.suspectPages,
    },
    pageCount: v.pages.length,
    pages: (() => {
      const env = new Map((v.evidence ?? []).map((e) => [e.pageStateId, e.environment]));
      return v.pages.map((p) => ({ id: p.id, label: p.label, url: p.url, requestedUrl: p.requestedUrl, screenKind: p.screenKind, reason: p.reason, flowId: p.flowId, hasShot: Boolean(p.screenshotKey), shotDeleted: Boolean(p.screenshotDeletedAt), random: p.reason === RANDOM_REASON, environment: environmentText(env.get(p.id)) }));
    })(),
    /** 표본 선정 근거: 찾은 페이지·모양 수, 점검 수, 한도로 못 본 유형별 대표, 유형별 커버리지 */
    sampleBasis: { ...sampleSummary(v), coverage: typeCoverage(v).filter((c) => c.checked || c.missed) },
    /** WCAG-EM 표본·환경 요약: 무작위 표본 수, 기록된 브라우저·창 크기, 업무 흐름 분기 */
    sample: { randomPages: v.pages.filter((p) => p.reason === RANDOM_REASON).length, environments: environmentSummary(v.evidence ?? []), branches: branchSummary(v.branches ?? []) },
    items: v.items.map((i, n) => ({ ...i, display: displayStatus(i), verdict: v.verdicts[n] })),
    /** 점검노트 판정 기준 준수율 (판정 중인 항목이 있으면 null) */
    verdictRate: v.verdictRate,
    groups: v.groups.map((g) => ({
      key: g.key,
      itemCode: g.itemCode,
      ruleId: g.ruleId,
      method: g.method,
      result: g.result,
      message: g.message,
      selector: g.selector,
      html: g.sample.html,
      pages: g.pages,
      findingIds: g.findingIds,
      sampleId: g.sample.id,
      hasBox: Boolean(g.sample.box),
      confidence: g.sample.confidence,
      aiReason: g.sample.aiReason,
      aiSuggestion: g.sample.aiSuggestion,
      humanResult: g.sample.humanResult,
    })),
    flows: v.flows.map((f) => ({ id: f.id, name: f.name, status: f.status })),
    /** 자동 점검 결과 AI 2차 검수 (자동 결과·점검자 판정과 따로). 이력이 없으면 빈 목록 */
    aiVerifications: (v.verifications ?? []).length
      ? verificationRows(v, issueRecords(v)).map((x) => ({ issueId: x.issueId, itemCode: x.itemCode, ruleId: x.ruleId, selector: x.selector, autoResult: x.autoResult, ai: x.ai, confidence: x.confidence, route: x.route, human: x.human, model: x.model, promptVersion: x.promptVersion }))
      : [],
    /** 기준 외 참고: 검사항목에 연결되지 않은 자동 결과 (판정·문제 수에 넣지 않음). 0022 전이면 빈 목록 */
    references: (() => {
      const rules = referenceRules(v.references ?? [], v.pages);
      return { total: (v.references ?? []).length, rules: rules.map((r) => ({ ruleId: r.ruleId, engine: r.engine, outcome: r.outcome, wcag: r.wcag, message: r.message.split(" — ")[0], count: r.count, pages: r.pages.length })) };
    })(),
    /** axe 통과·해당 없음 원본 보존 요약 (적합 판정 아님). 옛 코어로 점검한 페이지는 세지 않는다 */
    ruleOutcomes: (() => {
      const o = ruleOutcomeSummary(v.evidence ?? []);
      return { pages: o.pages, rules: o.rules.length, passedRules: o.rules.filter((r) => r.passedPages > 0).length, inapplicableRules: o.rules.filter((r) => r.inapplicablePages > 0).length };
    })(),
    /** 수동·보조기술·사용자 평가 기록 요약 (최신 판 기준, 목록은 GET /api/scans/[id]/evaluations) */
    evaluations: evaluationSummary(v.evaluations ?? []),
    /** AI 검수 후 사람 확인 대기 수 (목록은 GET /api/scans/[id]/verification-queue) */
    aiVerificationQueue: (v.verifications ?? []).length ? verificationQueue(v).length : 0,
  };
}
export type ViewJson = ReturnType<typeof viewJson>;
