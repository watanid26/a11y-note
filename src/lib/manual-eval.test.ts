// 2단계: 수동·보조기술·사용자 평가 기록이 별도 층으로 쌓이고, 판정을 바꾸지 않으며, 서류에 그대로 나오는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildProjectBundle } from "./bundle";
import type { ManualEvaluation } from "./db";
import { currentEvaluations, EvaluationInput, evaluationRow, evaluationSummary, maskAccount } from "./manual-eval";
import { bundleXlsx } from "./report/bundle-export";
import { buildChecklist } from "./report/checklist";
import { buildReport } from "./report/docx";
import { findings, PAGES, project, scanRow } from "./report/test-fixture";
import { buildScanView } from "./scan-view";
import { viewJson } from "./view-json";

const T = new Date("2026-10-02T01:00:00Z");
function ev(id: string, over: Partial<ManualEvaluation> = {}): ManualEvaluation {
  return {
    id, scanId: "s1", pageStateId: "pg1", flowId: null, findingId: null, itemCode: "5.1.1", kind: "manual", method: "키보드만 조작", assistiveTech: null, assistiveTechVersion: null,
    browser: "Chrome", browserVersion: "140", os: "Windows 11", device: null, participantCode: null, participantProfile: null, task: null,
    result: "pass", severity: null, notes: "", steps: [], supersedes: null, evaluator: "tester@example.com", performedAt: T, createdAt: T, ...over,
  };
}
const ROWS = [
  ev("e1"),
  ev("e2", { kind: "assistive_tech", assistiveTech: "NVDA", assistiveTechVersion: "2025.3", method: "제목 탐색", result: "fail", severity: "major", steps: ["홈을 연다", "H 키로 제목 이동"] }),
  ev("e3", { kind: "user_testing", itemCode: null, participantCode: "P01", participantProfile: "화면 낭독기 상시 사용", task: "민원 신청서 제출", result: "blocked", severity: "critical" }),
  // e1 을 고친 기록: e1 은 이전 판이 된다
  ev("e4", { supersedes: "e1", result: "fail", notes: "초점이 보이지 않음 (재확인)" }),
];
const view = (rows = ROWS) => buildScanView(scanRow(), project(), PAGES, findings(), [], [], [], { evaluations: rows });

describe("입력 검증", () => {
  const ok = { kind: "manual", result: "pass", itemCode: "5.1.1" };
  it("기본 기록", () => expect(EvaluationInput.safeParse(ok).success).toBe(true));
  it("보조기술 점검은 보조기술 이름이 필요", () => {
    expect(EvaluationInput.safeParse({ ...ok, kind: "assistive_tech" }).success).toBe(false);
    expect(EvaluationInput.safeParse({ ...ok, kind: "assistive_tech", assistiveTech: "VoiceOver" }).success).toBe(true);
  });
  it("사용자 평가는 가명 코드와 과업이 필요, 이름·이메일은 코드로 못 넣음", () => {
    expect(EvaluationInput.safeParse({ ...ok, kind: "user_testing", task: "로그인" }).success).toBe(false);
    expect(EvaluationInput.safeParse({ ...ok, kind: "user_testing", task: "로그인", participantCode: "홍길동" }).success).toBe(false);
    expect(EvaluationInput.safeParse({ ...ok, kind: "user_testing", task: "로그인", participantCode: "a@b.com" }).success).toBe(false);
    expect(EvaluationInput.safeParse({ ...ok, kind: "user_testing", task: "로그인", participantCode: "P01" }).success).toBe(true);
  });
  it("검사항목·과업·발견 사항이 모두 없으면 거절, 결과 값은 정해진 것만", () => {
    expect(EvaluationInput.safeParse({ kind: "manual", result: "pass" }).success).toBe(false);
    expect(EvaluationInput.safeParse({ ...ok, result: "maybe" }).success).toBe(false);
    expect(EvaluationInput.safeParse({ ...ok, steps: new Array(31).fill("x") }).success).toBe(false);
  });
  it("저장 전 메모·조작 순서 속 이메일·토큰 주소를 가린다", () => {
    const x = EvaluationInput.parse({ ...ok, notes: "문의 me@example.com", steps: ["https://example.go.kr/a?token=abc123def456ghi789 열기"] });
    const row = evaluationRow("s1", x, "tester@example.com");
    expect(row.notes).not.toContain("me@example.com");
    expect(row.steps[0]).not.toContain("abc123def456ghi789");
    expect(row.evaluator).toBe("tester@example.com");
  });
});

describe("쌓기만 하고 최신 판만 센다", () => {
  it("고친 기록이 이전 기록을 대신한다", () => {
    expect(currentEvaluations(ROWS).map((r) => r.id)).toEqual(["e2", "e3", "e4"]);
    expect(evaluationSummary(ROWS)).toMatchObject({ manual: 1, assistiveTech: 1, userTesting: 1, superseded: 1, problems: 3, assistiveTechs: ["NVDA 2025.3"], participants: 1, items: ["5.1.1"] });
  });
  it("평가 기록은 항목 상태·묶음 문제 수를 바꾸지 않는다", () => {
    const plain = buildScanView(scanRow(), project(), PAGES, findings(), [], []);
    expect(view().items).toEqual(plain.items);
    const b = buildProjectBundle([view()]);
    expect(b.counts).toEqual(buildProjectBundle([plain]).counts);
    expect(b.methods).toMatchObject({ manualChecks: 1, assistiveTech: 1, userTesting: 1 });
    expect(b.evaluations).toHaveLength(4);
    expect(b.evaluations.find((e) => e.id === "e1")!.current).toBe(false);
    expect(JSON.stringify(b.evaluations)).not.toContain("tester@example.com");
  });
  it("화면용 JSON 요약", () => {
    expect(viewJson(view()).evaluations.assistiveTech).toBe(1);
    expect(viewJson(buildScanView(scanRow(), project(), PAGES, findings(), [], [])).evaluations).toMatchObject({ manual: 0, assistiveTech: 0, userTesting: 0 });
  });
  it("계정 가림", () => {
    expect(maskAccount("tester@example.com")).toBe("te***@example.com");
    expect(maskAccount("x")).toBe("***");
  });
});

describe("서류 반영", () => {
  it("점검표 엑셀: 이력 전체를 판(최신·이전 판)과 함께, 계정은 가려서", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(view())) as never);
    const ws = wb.getWorksheet("수동·보조기술·사용자 평가")!;
    expect(String(ws.getCell(1, 1).value)).toContain("항목 상태를 자동으로 바꾸지 않으며");
    const vals = [3, 4, 5, 6].map((r) => [ws.getCell(r, 2).value, ws.getCell(r, 3).value]);
    expect(vals).toEqual([["이전 판", "수동 점검"], ["최신", "보조기술 점검"], ["최신", "장애인 사용자 평가"], ["최신", "수동 점검"]]);
    expect(String(ws.getCell(4, 14).value)).toContain("2) H 키로 제목 이동");
    expect(JSON.stringify(ws.getSheetValues())).not.toContain("tester@example.com");
    const plain = new ExcelJS.Workbook();
    await plain.xlsx.load((await buildChecklist(buildScanView(scanRow(), project(), PAGES, findings(), [], []))) as never);
    expect(plain.getWorksheet("수동·보조기술·사용자 평가")).toBeUndefined();
  });
  it("보고서 워드: 점검 방법에 기록 수, 없으면 '기록 없음'", async () => {
    const text = async (buf: Buffer) => (await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    const t1 = await text(await buildReport(view()));
    expect(t1).toContain("수동 점검 · 보조기술 점검 · 장애인 사용자 평가");
    expect(t1).toContain("1건 (NVDA 2025.3)");
    expect(t1).toContain("참여자 1명 (가명)");
    const t0 = await text(await buildReport(buildScanView(scanRow(), project(), PAGES, findings(), [], [])));
    expect(t0).toContain("보조기술 점검기록 없음");
  });
  it("묶음 엑셀: 평가 시트와 점검 방법별 기록 수", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await bundleXlsx(buildProjectBundle([view()]))) as never);
    expect(wb.getWorksheet("수동·보조기술·사용자 평가")!.rowCount).toBe(5);
    const meta = JSON.stringify(wb.getWorksheet("묶음 요약")!.getSheetValues());
    expect(meta).toContain("보조기술 점검 1");
  });
});
