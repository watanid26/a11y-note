// 1단계: axe 통과·해당 없음 원본 보존 + 기준 외 참고 결과가 판정과 섞이지 않고 서류에서 사라지지 않는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { getPack } from "../core/packs";
import type { Applicability, CapturedState, RawResult } from "../core/types";
import { buildProjectBundle } from "./bundle";
import type { PageEvidence, UnmappedReferenceRow } from "./db";
import { evidenceRow, MAX_REFERENCES_PER_PAGE, referenceRows } from "./evidence";
import { buildChecklist } from "./report/checklist";
import { buildReport } from "./report/docx";
import { bundleXlsx } from "./report/bundle-export";
import { findings, PAGES, project, scanRow } from "./report/test-fixture";
import { buildScanView, referenceRules, ruleOutcomeSummary } from "./scan-view";
import { StateSchema } from "./upload-guard";
import { viewJson } from "./view-json";

const applicable: Applicability = { images: 0, media: 0, tables: 0, forms: 0, inputs: 0, links: 1, newWindowLinks: 0, carousels: 0, captchas: 0, iframes: 0, timeLimitHint: false, accessKeys: 0 };
const T = new Date("2026-10-01T01:00:00Z");
const ENV = { userAgent: "Mozilla/5.0 Chrome/140", language: "ko-KR", viewport: { w: 1280, h: 900 }, screen: { w: 1920, h: 1080 }, devicePixelRatio: 2, reducedMotion: false, colorScheme: "light" as const };
const OUTCOMES = {
  engine: "axe" as const,
  passed: [{ ruleId: "document-title", tags: ["wcag2a", "wcag242"], help: "문서 제목", sample: { selector: "html", html: '<a href="https://x.go.kr/?token=abc123def456ghi789">' } }],
  inapplicable: [{ ruleId: "video-caption", tags: ["wcag2a", "wcag122"], help: "영상 자막", sample: null }],
};

function state(results: RawResult[], extra: Partial<CapturedState["snapshot"]> = {}): CapturedState {
  return {
    url: "https://example.go.kr/", title: "홈", label: "홈",
    snapshot: { coreVersion: "0.3.0", url: "https://example.go.kr/", title: "홈", lang: "ko", viewport: { w: 1280, h: 900, scrollH: 2000 }, results, candidates: [], applicable, outline: { navLinks: [], forms: [], searchInput: null }, templateSignature: "x", ...extra },
    keyboard: null,
  };
}
const region: RawResult = { engine: "axe", ruleId: "region", outcome: "violation", impact: "moderate", wcag: [], help: "랜드마크 안의 내용", nodes: [{ selector: "#a", html: "<div>me@example.com</div>", box: null, message: "" }] };

function ref(id: string, pageStateId: string, ruleId = "region", outcome: "violation" | "incomplete" = "violation"): UnmappedReferenceRow {
  return { id, scanId: "s1", pageStateId, packId: "kwcag22", packVersion: "r2", engine: "axe", ruleId, outcome, wcag: [], message: "랜드마크 안의 내용", selector: `#${id}`, html: "", box: null, createdAt: T };
}
const ev = (pageStateId: string): PageEvidence => ({ pageStateId, scanId: "s1", engineVersion: "0.3.0", environment: ENV, ruleOutcomes: OUTCOMES, createdAt: T });
function view(extras = { evidence: [ev("pg1"), ev("pg2")], references: [ref("r1", "pg1"), ref("r2", "pg2"), ref("r3", "pg2", "p-as-heading", "incomplete")] }) {
  return buildScanView(scanRow(), project(), PAGES, findings(), [], [], [], extras);
}

describe("저장할 행 만들기", () => {
  it("통과·해당 없음과 환경을 한 행으로, 글 속 주소·이메일은 가린다", () => {
    const row = evidenceRow(state([], { ruleOutcomes: OUTCOMES, environment: ENV }), "s1", "pg1")!;
    expect(row.ruleOutcomes!.passed[0].ruleId).toBe("document-title");
    expect(row.ruleOutcomes!.inapplicable[0].ruleId).toBe("video-caption");
    expect(JSON.stringify(row)).not.toContain("abc123def456ghi789");
    expect(row.environment!.viewport).toEqual({ w: 1280, h: 900 });
  });
  it("옛 코어(0.2.x)처럼 보낼 것이 없으면 빈 행을 만들지 않는다", () => {
    expect(evidenceRow(state([]), "s1", "pg1")).toBeNull();
  });
  it("연결표 밖 결과만 기준 외 참고 행이 되고, 개인정보는 가린다", () => {
    const image: RawResult = { engine: "axe", ruleId: "image-alt", outcome: "violation", impact: "critical", wcag: ["1.1.1"], help: "alt", nodes: [{ selector: "img", html: "", box: null, message: "" }] };
    const rows = referenceRows(getPack("kwcag22"), state([region, image]), "s1", "pg1");
    expect(rows.map((r) => r.ruleId)).toEqual(["region"]);
    expect(rows[0].html).not.toContain("me@example.com");
    expect(rows[0].packId).toBe("kwcag22");
  });
  it("화면 하나에 너무 많은 위치가 있으면 상한까지만", () => {
    const many: RawResult = { ...region, nodes: Array.from({ length: MAX_REFERENCES_PER_PAGE + 20 }, (_, i) => ({ selector: `#n${i}`, html: "", box: null, message: "" })) };
    expect(referenceRows(getPack("kwcag22"), state([many]), "s1", "pg1")).toHaveLength(MAX_REFERENCES_PER_PAGE);
  });
});

describe("업로드 검증", () => {
  const base = { url: "https://example.go.kr/", title: "홈", label: "홈", snapshot: { results: [], candidates: [], applicable: {}, outline: {}, templateSignature: "x" } };
  it("새 필드가 없어도(옛 확장) 통과", () => expect(StateSchema.safeParse(base).success).toBe(true));
  it("형식에 맞는 새 필드는 통과", () => expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, ruleOutcomes: OUTCOMES, environment: ENV } }).success).toBe(true));
  it("엔진·색 체계가 이상하면 거절", () => {
    expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, ruleOutcomes: { ...OUTCOMES, engine: "other" } } }).success).toBe(false);
    expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, environment: { ...ENV, colorScheme: "neon" } } }).success).toBe(false);
  });
});

describe("판정과 분리", () => {
  it("기준 외 참고·통과 원본이 있어도 항목 상태·묶음 문제 수는 그대로", () => {
    const plain = buildScanView(scanRow(), project(), PAGES, findings(), [], []);
    const withRefs = view();
    expect(withRefs.items).toEqual(plain.items);
    expect(withRefs.groups.length).toBe(plain.groups.length);
    const b0 = buildProjectBundle([plain]);
    const b1 = buildProjectBundle([withRefs]);
    expect(b1.counts).toEqual(b0.counts);
    expect(b1.conformance).toEqual(b0.conformance);
    expect(b0.references).toEqual({ total: 0, rules: [] });
    expect(b1.references.total).toBe(3);
    expect(b1.references.rules.find((r) => r.ruleId === "region")).toMatchObject({ count: 2, pages: 2, sources: ["extension"] });
    expect(b1.methods.ruleOutcomePages).toBe(2);
  });
  it("규칙·결과별로 묶고, 통과·해당 없음은 화면 수로 센다", () => {
    const v = view();
    expect(referenceRules(v.references, v.pages).map((r) => `${r.ruleId}:${r.count}:${r.pages.length}`)).toEqual(["p-as-heading:1:1", "region:2:2"]);
    const o = ruleOutcomeSummary(v.evidence);
    expect(o.pages).toBe(2);
    expect(o.rules.find((r) => r.ruleId === "document-title")).toMatchObject({ passedPages: 2, inapplicablePages: 0 });
    expect(o.rules.find((r) => r.ruleId === "video-caption")).toMatchObject({ passedPages: 0, inapplicablePages: 2 });
  });
  it("화면용 JSON 에 요약이 들어가고, 새 표가 없으면 빈 값", () => {
    expect(viewJson(view()).references.total).toBe(3);
    expect(viewJson(view()).ruleOutcomes).toMatchObject({ pages: 2, passedRules: 1, inapplicableRules: 1 });
    const empty = viewJson(buildScanView(scanRow(), project(), PAGES, findings(), [], []));
    expect(empty.references).toEqual({ total: 0, rules: [] });
    expect(empty.ruleOutcomes.pages).toBe(0);
  });
});

describe("서류에서 사라지지 않음", () => {
  it("점검표 엑셀: 기준 외 참고·통과 시트가 있을 때만 생긴다", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(view())) as never);
    const refSheet = wb.getWorksheet("기준 외 참고")!;
    expect(String(refSheet.getCell(1, 1).value)).toContain("판정에 반영하지 않는 참고 결과");
    expect(refSheet.getCell(3, 1).value).toBe("p-as-heading");
    expect(wb.getWorksheet("자동 점검 통과·해당 없음")!.getCell(3, 1).value).toBe("document-title");
    const plain = new ExcelJS.Workbook();
    await plain.xlsx.load((await buildChecklist(buildScanView(scanRow(), project(), PAGES, findings(), [], []))) as never);
    expect(plain.getWorksheet("기준 외 참고")).toBeUndefined();
    expect(plain.getWorksheet("자동 점검 통과·해당 없음")).toBeUndefined();
  });
  it("보고서 워드: 기준 외 참고·자동 통과 원본은 싣지 않음 (Excel 에만)", async () => {
    const zip = await JSZip.loadAsync(await buildReport(view()));
    const xml = await zip.file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, "");
    expect(text).not.toContain("기준 외 참고 (검사항목에 연결되지 않은 자동 점검 결과)");
    expect(text).not.toContain("자동 점검 통과·해당 없음 (원본 보존)");
  });
  it("묶음 엑셀: 기준 외 참고 시트", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await bundleXlsx(buildProjectBundle([view()]))) as never);
    expect(wb.getWorksheet("기준 외 참고")!.getCell(3, 1).value).toBe("p-as-heading");
  });
});
