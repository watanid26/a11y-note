// AI 검수에서 사람이 확인해야 할 것만 모은 검토 큐 (Phase 2).
// 자동 결과·AI 검증·점검자 판정을 따로 담고, 어느 것도 바꾸지 않는다. 사람의 결정은 기존 경로로 남긴다:
//  - 자동 결과(finding) → POST /api/scans/[id]/review (findingIds, humanResult)
//  - "문제 미발견" 표본 → POST /api/scans/[id]/items (항목 단위 결정)
import { itemByCode } from "../core/packs";
import { routeVerification, type VerificationResult, type VerificationRoute } from "./ai/verify";
import { latestAiVerification, latestPassSampleVerification } from "./report/model";
import type { ScanView } from "./scan-view";

export interface QueueEntry {
  kind: "finding" | "auto_pass_sample";
  verificationId: string;
  /** kind=finding: 같은 문제로 묶인 발견 사항 전체 (검토 한 번에 같이 정함) */
  findingIds: string[];
  pageStateId: string;
  pageLabel: string;
  url: string;
  itemCode: string;
  itemTitle: string;
  ruleId: string | null;
  selector: string | null;
  /** 1차 자동 결과 */
  autoResult: string;
  /** 2차 AI 검증 */
  ai: VerificationResult;
  confidence: number | null;
  evidence: string;
  reasonCode: string | null;
  route: VerificationRoute;
  model: string;
  promptVersion: string;
  verifiedAt: Date;
  /** 3차 사람 결정을 남길 곳 */
  decideWith: "review" | "item_decision";
}

const NEEDS_HUMAN = new Set<VerificationResult>(["contradicted", "uncertain", "insufficient_evidence"]);
const ORDER: Record<VerificationResult, number> = { contradicted: 0, uncertain: 1, insufficient_evidence: 2, supported: 3 };

/** 큐에 넣을지: AI 가 반박·보류·근거 부족이거나, 처리 규칙이 사람 확인으로 보낸 경우 (낮은 신뢰도 지지 등) */
export function needsHumanAfterAi(autoResult: string, v: { result: VerificationResult; confidence: number | null }): boolean {
  return NEEDS_HUMAN.has(v.result) || routeVerification(autoResult, v) === "human_review";
}

export function verificationQueue(v: ScanView): QueueEntry[] {
  const pageById = new Map(v.pages.map((p) => [p.id, p]));
  const groupOf = new Map<string, string[]>();
  for (const g of v.groups) for (const id of g.findingIds) groupOf.set(id, g.findingIds);
  const humanItems = new Set(v.items.filter((i) => i.decidedBy === "human").map((i) => i.code));
  const out: QueueEntry[] = [];
  // 같은 묶음은 한 줄만: 검토 한 번에 묶음 전체를 정하므로, 가장 앞선 AI 결과(반박 > 보류 > 근거 부족)를 대표로 둔다
  const byGroup = new Map<string, QueueEntry>();

  for (const f of v.findings) {
    const x = latestAiVerification(v).get(f.id);
    if (!x || f.humanResult || !needsHumanAfterAi(x.autoResult, x)) continue; // 점검자가 이미 정한 것은 큐에서 뺀다
    const ids = groupOf.get(f.id) ?? [f.id];
    const gkey = ids.join(",");
    const prev = byGroup.get(gkey);
    if (prev && ORDER[prev.ai] <= ORDER[x.result]) continue;
    const page = pageById.get(f.pageStateId);
    byGroup.set(gkey, {
      kind: "finding",
      verificationId: x.id,
      findingIds: ids,
      pageStateId: f.pageStateId,
      pageLabel: page?.label ?? "",
      url: page?.url ?? "",
      itemCode: f.itemCode,
      itemTitle: itemByCode(v.pack, f.itemCode)?.title ?? f.itemCode,
      ruleId: f.ruleId,
      selector: f.selector,
      autoResult: x.autoResult,
      ai: x.result,
      confidence: x.confidence,
      evidence: x.evidence,
      reasonCode: x.reasonCode,
      route: routeVerification(x.autoResult, x),
      model: `${x.provider ?? ""}/${x.model ?? ""}`,
      promptVersion: x.promptVersion ?? "",
      verifiedAt: x.createdAt,
      decideWith: "review",
    });
  }
  out.push(...byGroup.values());

  for (const x of latestPassSampleVerification(v).values()) {
    if (humanItems.has(x.itemCode!) || !needsHumanAfterAi(x.autoResult, x)) continue;
    const page = pageById.get(x.pageStateId!);
    out.push({
      kind: "auto_pass_sample",
      verificationId: x.id,
      findingIds: [],
      pageStateId: x.pageStateId!,
      pageLabel: page?.label ?? "",
      url: page?.url ?? "",
      itemCode: x.itemCode!,
      itemTitle: itemByCode(v.pack, x.itemCode!)?.title ?? x.itemCode!,
      ruleId: null,
      selector: null,
      autoResult: x.autoResult,
      ai: x.result,
      confidence: x.confidence,
      evidence: x.evidence,
      reasonCode: x.reasonCode,
      route: routeVerification(x.autoResult, x),
      model: `${x.provider ?? ""}/${x.model ?? ""}`,
      promptVersion: x.promptVersion ?? "",
      verifiedAt: x.createdAt,
      decideWith: "item_decision",
    });
  }

  const autoRank: Record<string, number> = { fail: 0, review: 1, pass: 2 };
  return out.sort((a, b) => ORDER[a.ai] - ORDER[b.ai] || (autoRank[a.autoResult] ?? 9) - (autoRank[b.autoResult] ?? 9) || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
}
