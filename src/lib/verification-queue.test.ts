// Phase 2: AI 검수 후 사람 확인 큐 — 반박·보류·근거 부족만 모으고, 원본·점검자 판정을 바꾸지 않음
import { describe, expect, it } from "vitest";
import type { FindingVerification } from "./db";
import { PAGES, findings, project, scanRow } from "./report/test-fixture";
import { buildScanView } from "./scan-view";
import { needsHumanAfterAi, verificationQueue } from "./verification-queue";
import { viewJson } from "./view-json";

const T = new Date("2026-10-01T02:00:00Z");
function ver(findingId: string, result: FindingVerification["result"], confidence: number, autoResult = "fail", at = T): FindingVerification {
  return { id: `v-${findingId}-${+at}`, scanId: "s1", target: "finding", findingId, pageStateId: null, itemCode: null, verifier: "ai", result, confidence, evidence: "관찰", reasonCode: "issue_not_observed", autoResult, provider: "anthropic", model: "m", promptVersion: "v1", inputHash: "a".repeat(64), createdAt: at };
}
function sample(pageStateId: string, itemCode: string, result: FindingVerification["result"], confidence = 0.8): FindingVerification {
  return { id: `ps-${pageStateId}-${itemCode}`, scanId: "s1", target: "auto_pass_sample", findingId: null, pageStateId, itemCode, verifier: "ai", result, confidence, evidence: "링크 문구 '더보기' 반복", reasonCode: "issue_observed", autoResult: "pass", provider: "anthropic", model: "m", promptVersion: "v1", inputHash: "b".repeat(64), createdAt: T };
}
// test-fixture: f1 5.1.1 자동 fail + 점검자 fail · f2,f3 7.1.1 자동 fail(한 묶음) · f5 8.2.1 자동 review
const view = (vs: FindingVerification[], decisions: { itemCode: string; status: string; note: string | null }[] = []) =>
  buildScanView(scanRow(), project(), PAGES, findings(), decisions, [], vs);

describe("큐에 넣는 기준", () => {
  it("반박·보류·근거 부족은 넣고, 높은 신뢰도 지지(fail)는 넣지 않음, 낮은 신뢰도 지지는 넣음", () => {
    expect(needsHumanAfterAi("fail", { result: "contradicted", confidence: 0.9 })).toBe(true);
    expect(needsHumanAfterAi("fail", { result: "uncertain", confidence: 0.9 })).toBe(true);
    expect(needsHumanAfterAi("fail", { result: "insufficient_evidence", confidence: null })).toBe(true);
    expect(needsHumanAfterAi("fail", { result: "supported", confidence: 0.95 })).toBe(false);
    expect(needsHumanAfterAi("fail", { result: "supported", confidence: 0.3 })).toBe(true);
    expect(needsHumanAfterAi("pass", { result: "supported", confidence: 0.95 })).toBe(false);
    expect(needsHumanAfterAi("pass", { result: "contradicted", confidence: 0.6 })).toBe(true);
  });
});

describe("검토 큐", () => {
  it("같은 묶음은 한 줄, 묶음의 발견 사항 ID 를 모두 담음", () => {
    const q = verificationQueue(view([ver("f2", "contradicted", 0.9), ver("f3", "contradicted", 0.8)]));
    expect(q.length).toBe(1);
    expect(q[0]).toMatchObject({ kind: "finding", itemCode: "7.1.1", autoResult: "fail", ai: "contradicted", route: "human_review", decideWith: "review" });
    expect(q[0].findingIds.sort()).toEqual(["f2", "f3"]);
  });
  it("점검자가 이미 판정한 발견 사항은 뺌 (f1 은 점검자 fail)", () => {
    const q = verificationQueue(view([ver("f1", "contradicted", 0.9)]));
    expect(q).toEqual([]);
  });
  it("높은 신뢰도 지지만 있으면 큐가 비어 있음", () => {
    expect(verificationQueue(view([ver("f2", "supported", 0.95)]))).toEqual([]);
  });
  it("최신 검수만 봄", () => {
    const later = new Date(+T + 60_000);
    expect(verificationQueue(view([ver("f2", "contradicted", 0.9), ver("f2", "supported", 0.95, "fail", later)]))).toEqual([]);
  });
  it("'문제 미발견' 표본 반박은 항목 결정으로 남기도록 표시, 사람이 항목을 정하면 빠짐", () => {
    const q = verificationQueue(view([sample("pg1", "6.4.3", "contradicted")]));
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ kind: "auto_pass_sample", autoResult: "pass", ai: "contradicted", route: "human_review", decideWith: "item_decision", findingIds: [], ruleId: null });
    expect(verificationQueue(view([sample("pg1", "6.4.3", "supported", 0.95)]))).toEqual([]);
    expect(verificationQueue(view([sample("pg1", "6.4.3", "contradicted")], [{ itemCode: "6.4.3", status: "pass", note: null }]))).toEqual([]);
  });
  it("순서: 반박 → 보류 → 근거 부족, 같은 AI 결과 안에서는 fail → review → pass. 한 묶음(f2·f3)은 가장 앞선 결과 한 줄", () => {
    const q = verificationQueue(view([ver("f5", "uncertain", 0.4, "review"), sample("pg2", "6.4.2", "contradicted"), ver("f2", "insufficient_evidence", 0.2), ver("f3", "contradicted", 0.9)]));
    expect(q.map((e) => [e.ai, e.autoResult])).toEqual([
      ["contradicted", "fail"],
      ["contradicted", "pass"],
      ["uncertain", "review"],
    ]);
  });
  it("큐를 만들어도 원본 발견 사항·항목·검수 이력은 그대로", () => {
    const vs = [ver("f2", "contradicted", 0.9), sample("pg1", "6.4.3", "contradicted")];
    const v = view(vs);
    const before = JSON.stringify({ f: v.findings, i: v.items, vs: v.verifications });
    verificationQueue(v);
    expect(JSON.stringify({ f: v.findings, i: v.items, vs: v.verifications })).toBe(before);
    expect(v.findings.find((f) => f.id === "f2")!.result).toBe("fail");
  });
  it("JSON: aiVerificationQueue 수와 표본 검수 행", () => {
    const j = viewJson(view([ver("f2", "contradicted", 0.9), sample("pg1", "6.4.3", "contradicted")]));
    expect(j.aiVerificationQueue).toBe(2);
    expect(j.aiVerifications.some((r: { autoResult: string; issueId: string }) => r.autoResult === "pass" && r.issueId === "-")).toBe(true);
  });
});
