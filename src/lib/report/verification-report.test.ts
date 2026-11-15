// Phase 1: 자동 점검 결과 AI 검수가 원본 판정을 바꾸지 않고, 서류·JSON 에 자동 결과 / AI 검증 / 점검자 판정이 따로 보이는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { FindingVerification } from "../db";
import { buildScanView } from "../scan-view";
import { viewJson } from "../view-json";
import { buildChecklist } from "./checklist";
import { buildReport } from "./docx";
import { issueRecords, itemRows, verificationLine, verificationRows } from "./model";
import { PAGES, findings, project, scanRow } from "./test-fixture";

const T = new Date("2026-10-01T02:00:00Z");
const decisions = [{ itemCode: "6.4.4", status: "na", note: "고정 참조 위치 없음" }];
function ver(findingId: string, result: FindingVerification["result"], confidence: number, autoResult = "fail"): FindingVerification {
  return { id: `v-${findingId}`, scanId: "s1", target: "finding", findingId, pageStateId: null, itemCode: null, verifier: "ai", result, confidence, evidence: "관찰: hong@example.com 주변 글자", reasonCode: "issue_not_observed", autoResult, provider: "anthropic", model: "test-model", promptVersion: "v1", inputHash: "a".repeat(64), createdAt: T };
}
// test-fixture: f2·f3 = 7.1.1 html-has-lang 자동 fail (사람 판정 없음), f1 = 5.1.1 자동 fail + 점검자 fail, f5 = 8.2.1 자동 review
const verifs = [ver("f2", "contradicted", 0.9), ver("f1", "supported", 0.95), ver("f5", "uncertain", 0.4, "review")];
const plain = () => buildScanView(scanRow(), project(), PAGES, findings(), decisions, []);
const withAi = () => buildScanView(scanRow(), project(), PAGES, findings(), decisions, [], verifs);

async function docxText(buf: Buffer): Promise<string> {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

describe("AI 검수는 원본 판정을 바꾸지 않음", () => {
  it("발견 사항·항목 상태·오류 목록이 검수 이력 유무와 같음", () => {
    const a = plain();
    const b = withAi();
    expect(b.findings.map((f) => [f.id, f.result, f.humanResult])).toEqual(a.findings.map((f) => [f.id, f.result, f.humanResult]));
    expect(b.items).toEqual(a.items);
    expect(issueRecords(b).map((r) => [r.id, r.state, r.itemCode])).toEqual(issueRecords(a).map((r) => [r.id, r.state, r.itemCode]));
    expect(itemRows(b, issueRecords(b)).map((r) => [r.code, r.auto, r.human])).toEqual(itemRows(a, issueRecords(a)).map((r) => [r.code, r.auto, r.human]));
  });
});

describe("자동 결과 · AI 검증 · 점검자 판정을 따로 표시", () => {
  const v = withAi();
  const rows = verificationRows(v, issueRecords(v));

  it("AI 가 자동 fail 을 반박해도 자동 결과는 fail, 처리는 사람 확인, 점검자 판정은 미확정", () => {
    const r = rows.find((x) => x.ruleId === "html-has-lang")!;
    expect([r.autoResult, r.ai, r.route, r.human]).toEqual(["fail", "contradicted", "human_review", null]);
  });
  it("점검자가 확정한 결과는 AI 지지와 별도로 점검자 판정을 보여 줌", () => {
    const r = rows.find((x) => x.ruleId === "image-alt")!;
    expect([r.autoResult, r.ai, r.human]).toEqual(["fail", "supported", "fail"]);
  });

  it("Excel: 'AI 검수' 시트에 1차 자동 결과 / 2차 AI 검증 / 3차 점검자 판정 열이 따로 있음, 이력이 없으면 시트 없음", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(v)) as never);
    const ws = wb.getWorksheet("AI 검수")!;
    expect(ws).toBeTruthy();
    const head = (ws.getRow(2).values as unknown[]).slice(1);
    expect(head).toEqual(expect.arrayContaining(["1차 자동 결과", "2차 AI 검증", "3차 점검자 판정", "모델", "프롬프트"]));
    const text: string[] = [];
    ws.eachRow((row) => text.push((row.values as unknown[]).join("|")));
    expect(text.join("\n")).toContain("AI 반박");
    expect(text.join("\n")).toContain("사람 확인 필요");
    expect(text.join("\n")).not.toContain("hong@example.com");
    const wb0 = new ExcelJS.Workbook();
    await wb0.xlsx.load((await buildChecklist(plain())) as never);
    expect(wb0.getWorksheet("AI 검수")).toBeUndefined();
  });

  it("Word: 근거 줄에 AI 검증 고정 문구만 (AI 관찰 문장은 넣지 않음), 의미 후보 AI 판단과 다른 이름", async () => {
    const text = await docxText(await buildReport(v, { loadShot: async () => null }));
    expect(text).toContain("AI 검증 (자동 점검 결과 재검수·확정 아님): 검수 1/2곳 · AI 반박 1 → 사람 확인 필요 1곳");
    expect(text).not.toContain("관찰: ");
    const t0 = await docxText(await buildReport(plain(), { loadShot: async () => null }));
    expect(t0).not.toContain("AI 검증 (자동 점검 결과 재검수");
  });

  it("문제 묶음 단위 요약 문구", () => {
    const rec = issueRecords(v).find((r) => r.itemCode === "7.1.1")!;
    expect(verificationLine(v, rec)).toMatch(/^AI 검증 \(자동 점검 결과 재검수·확정 아님\): 검수 1\/2곳 · AI 반박 1 → 사람 확인 필요 1곳 · 모델 anthropic\/test-model · 프롬프트 v1$/);
  });

  it("JSON: aiVerifications 필드가 따로 있고 기존 필드는 그대로", () => {
    const j = viewJson(v);
    expect(j.aiVerifications.length).toBe(rows.length);
    expect(viewJson(plain()).aiVerifications).toEqual([]);
    expect(j.items).toEqual(viewJson(plain()).items);
  });
});
