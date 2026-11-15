// 서류 3종이 화면과 같은 판정을 말하는지 (실제 DB 형식 자료로 생성해서 확인)
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildChecklist } from "./checklist";
import { NOT_CERT_KO } from "./data";
import { buildReport, REPORT_TEMPLATE_VERSION } from "./docx";
import { buildFixRequests } from "./fixes";
import { AUTO_LABEL, HUMAN_LABEL, issueRecords, itemRows } from "./model";
import { fixtureView } from "./test-fixture";

const LONG_URL = "https://example.go.kr/board/notice/list.do?menuId=1234&page=1";
const AI_ON = "AI claude-haiku-5-5 · 프롬프트 v3 · 기준값 0.8";

async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

describe("서류 3종 일관성 (AI 꺼짐)", async () => {
  const v = fixtureView();
  const issues = issueRecords(v);
  const rows = itemRows(v, issues);

  it("엑셀: 항목별 자동 결과·점검자 판정이 모델과 같고, 오류 목록은 위치마다 한 줄", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(v)) as never);
    const ws = wb.getWorksheet("자체진단 점검표")!;
    let head = 0;
    ws.eachRow((r, n) => {
      if (r.getCell(1).value === "번호") head = n;
    });
    expect(head).toBeGreaterThan(0);
    expect(ws.getRow(head).values).toEqual([undefined, "번호", "기준 코드", "원칙·지침", "검사항목", "적용 여부", "점검 방법", "자동 결과", "점검노트 판정", "점검자 판정", "오류 수\n(유형·위치)", "근거 ID", "비고"]);
    for (const r of rows) {
      const row = ws.getRow(head + r.no);
      expect(row.getCell(2).value).toBe(r.code);
      expect(row.getCell(7).value).toBe(AUTO_LABEL.ko[r.auto]);
      expect(String(row.getCell(8).value)).toMatch(/^(적합|부적합|해당 없음|판정 중)/);
      expect(row.getCell(9).value).toBe(HUMAN_LABEL.ko[r.human]);
    }
    expect(ws.getRow(head + rows.find((r) => r.code === "7.1.1")!.no).getCell(9).value).toBe("미검토"); // 점검자가 아직 검토하지 않음 (점검노트 판정은 8열)
    const infoValues: string[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < head) row.eachCell((cell) => infoValues.push(String(cell.value ?? "")));
    });
    expect(infoValues.some((value) => value.includes(REPORT_TEMPLATE_VERSION))).toBe(true);
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.printTitlesRow).toBe(`${head}:${head}`);
    const ws2 = wb.getWorksheet("오류 목록")!;
    expect(ws2.rowCount - 1).toBe(issues.reduce((n, x) => n + x.locations.length, 0));
    const urls: string[] = [];
    ws2.eachRow((r, n) => n > 1 && urls.push(String(r.getCell(9).value)));
    expect(urls).toContain(LONG_URL);
    let all = "";
    wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => (all += `${c.value}\n`))));
    expect(all).not.toContain("AI 의견");
    expect(all).toContain(NOT_CERT_KO);
    let emptyStrings = 0;
    wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => c.value === "" && emptyStrings++)));
    expect(emptyStrings).toBe(0); // 빈 공유 문자열이 남으면 일부 도구가 번호(예: 57)로 보여 줌
    const ws3 = wb.getWorksheet("점검 범위")!;
    expect(ws3.getRow(1).values).toEqual([undefined, "캡처 ID", "화면명", "점검 URL", "선정 이유", "로그인 상태", "점검 시각", "점검 방식 (브라우저·OS)", "비고"]);
  });

  it("워드: 초안 표시, 모든 문제·위치, 사람 확인 위치, 마지막 문구", async () => {
    const text = await docxText(await buildReport(v, { loadShot: async () => null }));
    expect(text).toContain("웹 접근성 자체진단 결과 보고서");
    expect(text).toContain("자체진단 초안 · 항목 판정 진행 중");
    expect(text).toContain("항목별 판정 기준");
    expect(text).toContain("이러면 부적합");
    expect(text).toContain(`보고서 버전·점검 회차`);
    expect(text).toContain(REPORT_TEMPLATE_VERSION);
    expect(text).toContain("제출 전 입력 필요: 점검 기관, 점검자");
    expect(text).toContain("초안: 대상 기관명 입력 필요");
    expect(text).not.toContain("부적합(자동)");
    expect(text).toContain("품질인증서나 적합성 선언이 아니에요");
    for (const ref of ["KWCAG 2.2", "WCAG Evaluation Methodology (WCAG-EM) 2.0", "https://www.w3.org/TR/WCAG-EM/", "Accessibility Evaluation Report Template"]) expect(text).toContain(ref);
    expect(text).not.toContain("WCAG-EM) 1.0");
    for (const rec of issues) expect(text).toContain(rec.id);
    expect(text).toContain(LONG_URL);
    expect(text).toContain("부적합 (점검자 판정)");
    expect(text).toContain("오류 (자동 규칙)");
    expect(text).not.toMatch(/2\+11=13|점검자가 직접 확인합니다/);
    expect(text).toContain("오류 의심");
    // 보고서 Word 에는 규칙·AI 판단 문장을 싣지 않고 출처 수만 쓴다 (내부 근거는 Excel·Markdown)
    expect(text).not.toContain("제목이 사이트 이름만 있음");
    expect(text).toContain("AI 판단: 대상 2건 · AI가 판단 0건 · 규칙으로 대신 판단 1건 · 미처리 1건");
    expect(text).toContain("설정과 결과가 달라 원자료를 한 번 더 확인해야 해요");
    expect(text).not.toMatch(/준수율 \d/);
    for (const w of ["Shift+Tab", "robots.txt", "범위에서 뺐어요"]) expect(text).toContain(w);
    expect(text.trim().endsWith(NOT_CERT_KO)).toBe(true);
  });

  it("마크다운: 개발팀 수정 요청서, A/B/C 구분, 전체 URL, 생략 없음", () => {
    const md = buildFixRequests(v);
    expect(md).toContain(`보고서 버전: ${REPORT_TEMPLATE_VERSION}`);
    expect(md).toContain("# 개발팀 수정 요청서");
    expect(md).not.toContain("AI 코딩 도구");
    expect(md).toMatch(/## A\. 점검자 확정 부적합 — 기준 1개 · 유형 1개 · 위치 1곳/);
    expect(md).toMatch(/## B\. 자동 신호\(확정 아님\) — 기준 1개 · 유형 1개 · 위치 2곳/);
    expect(md).toMatch(/## C\. 사람 확인 필요 — 기준 2개 · 유형 2개 · 위치 2곳/);
    expect(md).toContain(LONG_URL);
    expect(md).not.toContain(" …");
    expect(md).toContain('<html lang="ko">');
    expect(md).toContain("AI 판단: 대상 2건 · AI가 판단 0건 · 규칙으로 대신 판단 1건 · 미처리 1건");
    expect(md).toContain("설정 불일치 확인 필요");
  });

  it("주소 속 개인정보(이름·토큰·조각)는 서류 어디에도 없음 (Codex 리뷰 2)", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(v)) as never);
    let xlsx = "";
    wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => (xlsx += `${c.value}\n`))));
    const docx = await docxText(await buildReport(v, { loadShot: async () => null }));
    for (const text of [xlsx, docx, buildFixRequests(v)]) {
      expect(text).not.toMatch(/홍길동|secret|#top/);
      expect(text).toContain(LONG_URL);
    }
  });
});

describe("AI 켜짐일 때만 AI 문구", () => {
  it("판단 방식에 AI 보조 판단 요약 표시", () => {
    const md = buildFixRequests(fixtureView({ aiConfig: AI_ON }));
    expect(md).toContain("AI 판단: 대상 2건 · AI가 판단 0건 · 규칙으로 대신 판단 1건 · 미처리 1건");
  });
});

describe("JIS 결과는 JIS 이름·레벨로, KWCAG 와 섞지 않음", () => {
  it("JIS 팩 점검표", async () => {
    const v = fixtureView({ pack: "jis2016" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(v)) as never);
    const ws = wb.getWorksheet("達成基準チェックリスト")!;
    expect(ws.getCell("A1").value).toContain("JIS X 8341-3:2016");
    let all = "";
    wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => (all += `${c.value}\n`))));
    expect(all).not.toContain("KWCAG");
    expect(all).toContain("適合レベル");
  });
  it("JIS 보고서·수정 요청서", async () => {
    const v = fixtureView({ pack: "jis2016" });
    const text = await docxText(await buildReport(v, { loadShot: async () => null }));
    expect(text).toContain("JIS X 8341-3:2016（目標とする適合レベル: AA）");
    expect(text).not.toContain("KWCAG");
    const md = buildFixRequests(v);
    expect(md).toContain("# 開発チーム向け修正依頼書");
    expect(md).not.toContain("KWCAG");
    expect(md).not.toMatch(/\*\*修正の方向\*\*: \s*$/m); // 빈 수정 설명 없음
  });
});
