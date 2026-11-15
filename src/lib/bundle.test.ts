// 통합 점검 묶음: 서버 자동 점검 + 크롬 확장 점검을 합쳐도 원본은 그대로, 출처·이력·충돌이 따로 보이는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Finding, FindingVerification, PageState } from "./db";
import { buildProjectBundle, bundleSource, pickBundleScans } from "./bundle";
import { bundleDocx, bundleJson, bundleXlsx, BUNDLE_NOTICE } from "./report/bundle-export";
import { PAGES, findings, project, scanRow } from "./report/test-fixture";
import { buildScanView } from "./scan-view";

const T = new Date("2026-10-02T01:00:00Z");
// 서버 회차 s1 = test-fixture 그대로 (pg1 홈, pg2 공지사항 목록)
const server = (vs: FindingVerification[] = []) => buildScanView({ ...scanRow(), id: "s1", source: "server" }, project(), PAGES, findings(), [], [], vs);

// 확장 회차 s2: 같은 홈 화면(pg1 과 같은 주소) + 로그인 뒤 흐름 화면
function extPages(): PageState[] {
  return [
    { ...PAGES[0], id: "e1", scanId: "s2" },
    { ...PAGES[0], id: "e2", scanId: "s2", url: "https://example.go.kr/mypage", label: "마이페이지", flowId: "11111111-1111-1111-1111-111111111111", flowStep: 2 },
  ] as PageState[];
}
function extFindings(): Finding[] {
  const base = findings()[0];
  const mk = (id: string, pageStateId: string, itemCode: string, ruleId: string, result: string, selector: string, humanResult: "fail" | "pass" | null = null): Finding => ({ ...base, id, scanId: "s2", pageStateId, itemCode, ruleId, result, selector, humanResult, method: "auto", message: `${ruleId} 확장`, reviewedAt: humanResult ? T : null, reviewedBy: humanResult ? "t@example.com" : null });
  return [
    mk("x1", "e1", "5.1.1", "image-alt", "fail", "#el-1", "pass"), // 서버 f1(점검자 fail)과 같은 위치, 점검자 판정이 다름
    mk("x2", "e2", "7.3.2", "label", "fail", "#id"), // 로그인 뒤 화면에서만 나온 문제
  ];
}
const ext = () => buildScanView({ ...scanRow(), id: "s2", source: "browser", createdAt: T }, project(), extPages(), extFindings(), [], []);

describe("출처·회차 고르기", () => {
  it("browser·extension 은 크롬 확장, fixture 는 묶지 않음", () => {
    expect(bundleSource("server")).toBe("server");
    expect(bundleSource("browser")).toBe("extension");
    expect(bundleSource("extension")).toBe("extension");
    expect(bundleSource("fixture")).toBeNull();
  });
  it("출처마다 가장 최근에 끝난 회차 하나씩", () => {
    const d = (n: number) => new Date(Date.UTC(2026, 9, n));
    const ids = pickBundleScans([
      { id: "a", source: "server", status: "done", createdAt: d(1) },
      { id: "b", source: "server", status: "done", createdAt: d(3) },
      { id: "c", source: "server", status: "running", createdAt: d(5) },
      { id: "d", source: "browser", status: "done", createdAt: d(2) },
      { id: "e", source: "fixture", status: "done", createdAt: d(9) },
    ]);
    expect(ids).toEqual(["b", "d"]);
  });
  it("다른 사이트 회차는 섞지 않음", () => {
    const other = buildScanView({ ...scanRow(), id: "s9" }, { ...project(), id: "p9" }, [], [], [], []);
    expect(() => buildProjectBundle([server(), other])).toThrow();
  });
});

describe("합치기", () => {
  const b = buildProjectBundle([server(), ext()]);

  it("같은 페이지(주소)·항목·규칙·요소는 출처가 달라도 한 줄, 출처를 모두 남김", () => {
    const img = b.issues.filter((i) => i.ruleId === "image-alt");
    expect(img).toHaveLength(1);
    expect(img[0].sources.sort()).toEqual(["extension", "server"]);
    expect(img[0].occurrences.map((o) => o.findingId).sort()).toEqual(["f1", "x1"]);
  });
  it("점검자 판정이 출처마다 다르면 고르지 않고 충돌 → 사람 확인", () => {
    const img = b.issues.find((i) => i.ruleId === "image-alt")!;
    expect(img.conflicts).toContain("human_disagree");
    expect(img.combined).toBe("review");
  });
  it("확장에서만 본 로그인 뒤 화면 문제는 충돌이 아님 (서버가 그 화면을 보지 않음), 흐름 상태를 남김", () => {
    const lab = b.issues.find((i) => i.ruleId === "label")!;
    expect(lab.sources).toEqual(["extension"]);
    expect(lab.conflicts).toEqual([]);
    expect(lab.state).toMatchObject({ flowStep: 2, viewport: null });
    expect(lab.combined).toBe("fail");
  });
  it("같은 페이지를 두 출처가 봤는데 한쪽만 문제를 내면 출처 충돌", () => {
    // 서버 pg1 의 html-has-lang(f2)은 확장 홈 화면(e1)에서 나오지 않음
    const lang = b.issues.find((i) => i.ruleId === "html-has-lang" && i.url === "https://example.go.kr/")!;
    expect(lang.sources).toEqual(["server"]);
    expect(lang.conflicts).toContain("source_disagree");
    expect(lang.combined).toBe("review");
  });
  it("판정 이력 층: v1 자동 → v2 AI → v3 점검자, AI 검증 반박도 따로", () => {
    const v: FindingVerification = { id: "v1", scanId: "s1", target: "finding", findingId: "f3", pageStateId: null, itemCode: null, verifier: "ai", result: "contradicted", confidence: 0.9, evidence: "e", reasonCode: "issue_not_observed", autoResult: "fail", provider: "anthropic", model: "m", promptVersion: "v1", inputHash: null, createdAt: T };
    const bb = buildProjectBundle([server([v]), ext()]);
    const lang2 = bb.issues.find((i) => i.ruleId === "html-has-lang" && i.url.includes("/board/"))!;
    expect(lang2.layers.map((l) => [l.rev, l.kind])).toEqual([["v1", "auto"], ["v2", "ai_verification"]]);
    expect(lang2.conflicts).toContain("ai_contradicts");
    const img = bb.issues.find((i) => i.ruleId === "image-alt")!;
    expect(img.layers.map((l) => l.rev)).toEqual(["v1", "v1", "v3", "v3"]);
    // 의미 후보 AI 판단(method=ai)은 v2
    expect(bb.issues.find((i) => i.ruleId === "ai-title")!.layers[0]).toMatchObject({ rev: "v2", kind: "ai_semantic" });
  });
  it("항목: 출처별 상태를 나란히 두고, 점검자 확정이 하나면 그것", () => {
    const i511 = b.items.find((i) => i.code === "5.1.1")!;
    expect(i511.bySource).toEqual({ server: "fail", extension: "clear_auto" });
    expect([i511.combined, i511.conflict]).toEqual(["fail", false]);
  });
  it("항목: 회차마다 점검자 결정이 다르면 충돌 → 사람 확인", () => {
    const s = buildScanView({ ...scanRow(), id: "s1", source: "server" }, project(), PAGES, findings(), [{ itemCode: "6.5.1", status: "pass", note: null }], []);
    const e = buildScanView({ ...scanRow(), id: "s2", source: "browser" }, project(), extPages(), extFindings(), [{ itemCode: "6.5.1", status: "fail", note: null }], []);
    const i = buildProjectBundle([s, e]).items.find((x) => x.code === "6.5.1")!;
    expect(i.bySource).toEqual({ server: "pass", extension: "fail" });
    expect([i.combined, i.conflict]).toEqual(["review", true]);
  });
  it("항목: 점검자가 적합으로 정했는데 다른 출처에 자동 신호가 남으면 다시 확인", () => {
    const s = buildScanView({ ...scanRow(), id: "s1", source: "server" }, project(), PAGES, findings(), [{ itemCode: "7.3.2", status: "pass", note: null }], []);
    const i = buildProjectBundle([s, ext()]).items.find((x) => x.code === "7.3.2")!;
    expect(i.bySource).toEqual({ server: "pass", extension: "fail_auto" });
    expect([i.combined, i.conflict]).toEqual(["review", true]);
  });
  it("원본 회차 자료는 그대로", () => {
    const s = server();
    const e = ext();
    const before = JSON.stringify([s.findings, s.items, e.findings, e.items]);
    buildProjectBundle([s, e]);
    expect(JSON.stringify([s.findings, s.items, e.findings, e.items])).toBe(before);
  });
  it("같은 출처 회차가 둘이면 경고", () => {
    const again = buildScanView({ ...scanRow(), id: "s3", source: "server" }, project(), PAGES, findings(), [], []);
    expect(buildProjectBundle([server(), again]).warnings.join("\n")).toContain("서버 자동 점검 회차가 2개");
  });
});

describe("내보내기", () => {
  const b = buildProjectBundle([server(), ext()]);
  it("JSON: 안내 문구 + 원본 id", () => {
    const j = bundleJson(b);
    expect(j.notice).toBe(BUNDLE_NOTICE);
    expect(JSON.stringify(j)).toContain('"findingId":"x1"');
    expect(JSON.stringify(j)).not.toContain("token=secret");
    expect(JSON.stringify(j)).not.toContain("홍길동");
  });
  it("Excel: 요약·항목·통합 오류·판정 이력·화면 시트, 출처와 v1/v2/v3 열", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await bundleXlsx(b)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["묶음 요약", "항목", "통합 오류", "판정 이력", "화면"]);
    const head = (wb.getWorksheet("통합 오류")!.getRow(1).values as unknown[]).slice(1);
    expect(head).toEqual(expect.arrayContaining(["출처", "v1 자동", "v2 AI", "v3 점검자", "통합 참고 (확정 아님)", "충돌", "화면 크기"]));
    const hist: string[] = [];
    wb.getWorksheet("판정 이력")!.eachRow((r) => hist.push((r.values as unknown[]).join("|")));
    expect(hist.join("\n")).toContain("크롬 확장 점검");
    expect(hist.join("\n")).toContain("점검자 판정");
  });
  it("Word: 안내 문구와 충돌 표", async () => {
    const xml = await (await JSZip.loadAsync(await bundleDocx(b))).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, "");
    expect(text).toContain("확정 판정이 아닙니다");
    expect(text).toContain("사람 확인이 필요한 충돌");
    expect(text).toContain("점검자 판정이 회차마다 다름");
  });
});

describe("공식 자료 기준 보강 (WCAG-EM·ACT·인증 경계)", () => {
  const b = buildProjectBundle([server(), ext()]);
  it("법적·인증 고지와 기록하지 못한 평가 정보를 그대로 밝힘", () => {
    expect(b.legalNote).toContain("지정된 인증기관");
    expect(b.legalNote).toContain("인증 표시로 쓸 수 없습니다");
    expect(b.metadata.notRecorded).toEqual(expect.arrayContaining(["브라우저 버전", "장애인 사용자 평가"]));
    expect(b.metadata.sample.random).toBe(0);
    // 0023 부터 기록할 수 있다. 기록이 없으면 null 이 아니라 0 (서류에는 "기록 없음")
    expect(b.methods).toMatchObject({ manualChecks: 0, assistiveTech: 0, userTesting: 0 });
  });
  it("적합 요약은 평균이 아님: 점검자 확정 부적합이 하나라도 있으면 미충족", () => {
    expect(b.conformance.state).toBe("not_met");
    expect(JSON.stringify(b.conformance)).not.toMatch(/\d+(\.\d+)?%/);
  });
  it("WCAG·ACT 참고는 axe 메타데이터에서만, 자체 규칙에는 만들지 않음", () => {
    const img = b.issues.find((i) => i.ruleId === "image-alt")!;
    expect(img.refs.wcag).toEqual(["1.1.1"]);
    expect(img.refs.act).toContain("23a2a8");
    expect(img.refs.source).toMatch(/^axe-core /);
    const own = b.issues.find((i) => i.ruleId === "ai-title")!;
    expect(own.refs).toMatchObject({ source: null, wcag: [], act: [] });
  });
  it("KWCAG 항목 연결은 ACT 참고와 별개 (itemCode 그대로)", () => {
    expect(b.issues.find((i) => i.ruleId === "image-alt")!.itemCode).toBe("5.1.1");
  });
  it("Excel·Word 에 적합 요약·평가 정보·ACT 열이 같은 값으로 들어감", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await bundleXlsx(b)) as never);
    const sum: string[] = [];
    wb.getWorksheet("묶음 요약")!.eachRow((r) => sum.push((r.values as unknown[]).join("|")));
    expect(sum.join("\n")).toContain("기준 미충족");
    expect(sum.join("\n")).toContain("지정된 인증기관");
    const head = (wb.getWorksheet("통합 오류")!.getRow(1).values as unknown[]).slice(1);
    expect(head).toEqual(expect.arrayContaining(["WCAG 참고 (axe)", "ACT 규칙", "규칙 종류"]));
    const xml = await (await JSZip.loadAsync(await bundleDocx(b))).file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, "");
    expect(text).toContain("평균 점수 아님");
    expect(text).toContain("기준 미충족");
    expect(text).toContain("기록하지 못한 정보");
  });
});
