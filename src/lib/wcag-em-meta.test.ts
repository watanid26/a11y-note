// 3단계: WCAG-EM 표본(무작위)·업무 흐름 분기·브라우저/화면 크기·재현 절차가 저장된 기록대로 서류에 나오는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildProjectBundle, missingRecords } from "./bundle";
import type { Flow, FlowBranch, PageEvidence, PageState } from "./db";
import { browserLabel, environmentSummary, environmentText } from "./evidence";
import { BranchInput, branchRow, branchSummary, currentBranches } from "./flow-branch";
import { bundleXlsx } from "./report/bundle-export";
import { buildChecklist } from "./report/checklist";
import { buildReport } from "./report/docx";
import { reproLines, stepsBefore, MAX_REPRO_STEPS } from "./report/repro";
import { findings, PAGES, project, scanRow } from "./report/test-fixture";
import { RANDOM_REASON } from "./sampling";
import { buildScanView } from "./scan-view";
import { viewJson } from "./view-json";

const T = new Date("2026-10-03T01:00:00Z");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const ENV = { userAgent: UA, language: "ko-KR", viewport: { w: 1280, h: 900 }, screen: { w: 1920, h: 1080 }, devicePixelRatio: 1, reducedMotion: false, colorScheme: "light" as const };
const ev = (pageStateId: string, env = ENV): PageEvidence => ({ pageStateId, scanId: "s1", engineVersion: "0.3.0", environment: env, ruleOutcomes: null, createdAt: T });
const FLOW: Flow = {
  id: "11111111-1111-4111-8111-111111111111", projectId: "p1", name: "민원 신청", kind: "apply", startUrl: "https://example.go.kr/", guide: "", stopBefore: "제출", status: "recorded", source: "extension", autoTried: false, createdAt: T, updatedAt: T,
  steps: [
    { type: "click", selectors: [["#menu-apply"]], text: "민원 신청", url: "https://example.go.kr/" },
    { type: "change", selectors: [["#name"]], value: "{{입력값}}", url: "https://example.go.kr/apply/step1?token=abc123def456ghi789" },
    { type: "click", selectors: [["#next"]], text: "다음", url: "https://example.go.kr/apply/step1?token=abc123def456ghi789" },
    { type: "click", selectors: [["#submit"]], text: "제출", url: "https://example.go.kr/apply/step2" },
  ],
};
const flowPage = { ...PAGES[1], id: "pg3", url: "https://example.go.kr/apply/step2", label: "민원 신청 2단계", flowId: FLOW.id, flowStep: 2 } as PageState;
const randomPage = { ...PAGES[1], id: "pg4", url: "https://example.go.kr/board/notice/view.do?id=7", label: "공지 보기", reason: RANDOM_REASON } as PageState;
function branch(id: string, over: Partial<FlowBranch> = {}): FlowBranch {
  return { id, projectId: "p1", flowId: FLOW.id, name: "필수 입력 누락", fromStep: 2, condition: "이름을 비우고 다음", expected: "오류 문구가 입력칸과 연결되어 낭독됨", status: "planned", scanId: null, pageStateId: null, note: "", supersedes: null, createdBy: "t@example.com", createdAt: T, ...over };
}
const BRANCHES = [branch("b1"), branch("b2", { supersedes: "b1", status: "tested", pageStateId: "pg3" }), branch("b3", { name: "신청 취소", status: "planned" })];
const pages = [...PAGES, flowPage, randomPage];
const fs = () => [...findings(), { ...findings()[1], id: "f99", pageStateId: "pg3", selector: "#name" }];
const view = () => buildScanView(scanRow(), project(), pages, fs(), [], [FLOW], [], { evidence: pages.map((p) => ev(p.id)), branches: BRANCHES });

describe("점검 환경", () => {
  it("UA 에서 브라우저·OS, 창 크기 한 줄", () => {
    expect(browserLabel(UA)).toBe("Chrome 140");
    expect(browserLabel("Mozilla/5.0 (Macintosh) AppleWebKit Version/18.1 Safari/605")).toBe("Safari 18");
    expect(environmentText(ENV)).toBe("Chrome 140 · Windows · 창 1280×900");
    expect(environmentSummary([ev("a"), ev("b", { ...ENV, viewport: { w: 390, h: 844 } })])).toEqual({ pages: 2, browsers: ["Chrome 140 / Windows"], viewports: ["1280×900", "390×844"] });
  });
});

describe("재현 절차", () => {
  it("이 화면 주소에서 한 첫 조작 앞까지의 녹화 단계, 주소 속 토큰은 가림", () => {
    const r = stepsBefore(FLOW.steps, flowPage.url);
    expect(r.exact).toBe(true);
    expect(r.steps).toHaveLength(3);
    const lines = reproLines({ page: flowPage, flow: FLOW, environment: ENV }, "입력칸에 레이블이 연결됐는지 본다")!;
    expect(lines[0]).toBe("1) 점검 환경 맞추기: Chrome 140 · Windows · 창 1280×900");
    expect(lines[1]).toContain('업무 흐름 "민원 신청"');
    expect(lines.slice(2, 5)).toEqual(['  1. "민원 신청" 누르기', "  2. #name 에 {{입력값}} 입력", '  3. "다음" 누르기']);
    expect(lines.at(-1)).toBe("4) 입력칸에 레이블이 연결됐는지 본다");
    expect(JSON.stringify(lines)).not.toContain("abc123def456ghi789");
  });
  it("맞는 주소가 없으면 녹화 전체라고 밝히고, 길면 줄인다", () => {
    const long = { ...FLOW, steps: Array.from({ length: MAX_REPRO_STEPS + 3 }, (_, i) => ({ type: "click", selectors: [[`#b${i}`]], url: "https://example.go.kr/x" })) };
    const lines = reproLines({ page: { ...flowPage, url: "https://example.go.kr/other" }, flow: long, environment: null }, "확인")!;
    expect(lines[0]).toContain("녹화 전체");
    expect(lines.some((l) => l.includes("외 3단계"))).toBe(true);
  });
  it("흐름·환경이 없으면 null (공통 절차 그대로)", () => {
    expect(reproLines({ page: PAGES[0], flow: undefined, environment: null }, "확인")).toBeNull();
  });
});

describe("흐름 분기", () => {
  it("입력 검증과 최신 판 집계", () => {
    expect(BranchInput.safeParse({ flowId: FLOW.id, name: "취소", status: "planned" }).success).toBe(true);
    expect(BranchInput.safeParse({ flowId: FLOW.id, name: "", status: "planned" }).success).toBe(false);
    expect(BranchInput.safeParse({ flowId: "x", name: "취소", status: "done" }).success).toBe(false);
    expect(branchRow("p1", BranchInput.parse({ flowId: FLOW.id, name: "취소", status: "planned", note: "me@example.com 문의" }), "t@example.com").note).not.toContain("me@example.com");
    expect(currentBranches(BRANCHES).map((b) => b.id)).toEqual(["b2", "b3"]);
    expect(branchSummary(BRANCHES)).toEqual({ total: 2, tested: 1, planned: 1, blocked: 0, na: 0 });
  });
});

describe("묶음·화면 JSON", () => {
  it("화면 크기·환경·무작위 표본·분기를 채우고, 판정·문제 수는 그대로", () => {
    const plain = buildScanView(scanRow(), project(), pages, fs(), [], [FLOW], []);
    const b = buildProjectBundle([view()]);
    expect(b.counts).toEqual(buildProjectBundle([plain]).counts);
    expect(b.pages.every((p) => p.viewport?.w === 1280 && p.environments[0] === "Chrome 140 · Windows · 창 1280×900")).toBe(true);
    expect(b.metadata.sample.random).toBe(1);
    expect(b.metadata.sample.branches).toMatchObject({ total: 2, tested: 1 });
    const flowIssue = b.issues.find((i) => i.state.flowId === FLOW.id)!;
    expect(flowIssue.state.viewport).toEqual({ w: 1280, h: 900 });
    expect(flowIssue.repro!.join("\n")).toContain('"다음" 누르기');
    expect(b.metadata.notRecorded).not.toContain("화면 크기 (viewport)");
    expect(b.metadata.notRecorded).not.toContain("무작위 표본 (WCAG-EM: 구조적 표본의 10%)");
    expect(b.metadata.notRecorded).not.toContain("흐름의 주요 분기 경로 (기본 경로 외)");
    expect(b.metadata.notRecorded).toContain("보조기술(화면 낭독기·음성 제어·확대) 점검");
    // 기록이 없으면 모두 "기록 없음"으로 남는다
    expect(buildProjectBundle([buildScanView(scanRow(), project(), PAGES, findings(), [], [])]).metadata.notRecorded).toEqual(expect.arrayContaining(["브라우저 버전", "화면 크기 (viewport)", "무작위 표본 (WCAG-EM: 구조적 표본의 10%)", "흐름의 주요 분기 경로 (기본 경로 외)"]));
    expect(missingRecords).toBeTypeOf("function");
    const j = viewJson(view());
    expect(j.sample).toMatchObject({ randomPages: 1, branches: { total: 2 } });
    expect(j.pages.find((p) => p.id === "pg4")).toMatchObject({ random: true, environment: "Chrome 140 · Windows · 창 1280×900" });
  });
});

describe("서류", () => {
  it("점검표: 재현 방법에 녹화 단계·환경, 점검 범위에 환경, 흐름 분기 시트", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(view())) as never);
    const issues = wb.getWorksheet("오류 목록")!;
    const head = (issues.getRow(1).values as unknown[]).indexOf("재현 방법");
    const repro: string[] = [];
    issues.eachRow((r, n) => n > 1 && repro.push(String(r.getCell(head).value ?? "")));
    expect(repro.some((x) => x.includes('업무 흐름 "민원 신청"'))).toBe(true);
    expect(repro.every((x) => x.includes("점검 환경 맞추기"))).toBe(true);
    const scope = wb.getWorksheet("점검 범위")!;
    expect(String(scope.getCell(2, 7).value)).toContain("창 1280×900");
    const br = wb.getWorksheet("흐름 분기")!;
    expect(br.getCell(3, 1).value).toBe("민원 신청");
    expect([3, 4, 5].map((r) => br.getCell(r, 9).value)).toEqual(["이전 판", "최신", "최신"]);
  });
  it("보고서: 표본·환경을 기록대로 적고, 없으면 기존 문구", async () => {
    const text = async (buf: Buffer) => (await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    const t1 = await text(await buildReport(view()));
    expect(t1).toContain("무작위로 고른 페이지 1개");
    expect(t1).toContain("기록된 점검 브라우저: Chrome 140 / Windows · 창 크기 1280×900");
    expect(t1).toContain("주요 분기 2개 중 확인함 1개");
    expect(t1).not.toContain("무작위로 고른 페이지는 넣지 않았어요");
    const t0 = await text(await buildReport(buildScanView(scanRow(), project(), PAGES, findings(), [], [])));
    expect(t0).toContain("무작위로 고른 페이지는 넣지 않았어요");
    expect(t0).toContain("자동 점검 브라우저: Chromium (데스크톱 화면 1280px)");
  });
  it("묶음 엑셀: 화면 크기·점검 환경·재현 절차 열", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await bundleXlsx(buildProjectBundle([view()]))) as never);
    const s4 = wb.getWorksheet("화면")!;
    expect(s4.getCell(2, 5).value).toBe("1280×900");
    const s2 = wb.getWorksheet("통합 오류")!;
    const col = (s2.getRow(1).values as unknown[]).indexOf("재현 절차");
    expect(col).toBeGreaterThan(0);
  });
});
