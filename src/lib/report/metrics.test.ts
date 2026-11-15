// 단위 일치 회귀 (Codex 보고서 리뷰 1): 결과 화면·Word/PDF·Excel·Markdown 이 같은 공통 수치·같은 표기를 쓰는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MetricsSummary from "../../app/app/s/[id]/MetricsSummary";
import { viewJson } from "../view-json";
import { buildChecklist } from "./checklist";
import { buildReport } from "./docx";
import { buildFixRequests } from "./fixes";
import { metricLine, metricText, reportMetrics, type IssueState } from "./model";
import { fixtureView } from "./test-fixture";

const STATES: IssueState[] = ["confirmed_fail", "auto_fail", "review"];

describe("수치 단위 일치", async () => {
  const v = fixtureView();
  const m = reportMetrics(v);
  const screen = renderToStaticMarkup(createElement(MetricsSummary, { m: viewJson(v).metrics })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const zip = await JSZip.loadAsync(await buildReport(v, { loadShot: async () => null }));
  const docx = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildChecklist(v)) as never);
  const sheetText = (name: string) => {
    let t = "";
    wb.getWorksheet(name)!.eachRow((r) => r.eachCell((c) => (t += `${c.value}\n`)));
    return t;
  };
  const md = buildFixRequests(v);

  it("공통 수치 값 (테스트 자료 기준)", () => {
    expect(m.confirmed_fail).toEqual({ criteria: 1, types: 1, locations: 1, pages: 1 });
    expect(m.auto_fail).toEqual({ criteria: 1, types: 1, locations: 2, pages: 2 });
    expect(m.review).toEqual({ criteria: 2, types: 2, locations: 2, pages: 2 });
    expect(m.pagesChecked).toBe(2);
    expect(viewJson(v).metrics).toEqual(m);
  });

  it("모든 산출물에 같은 표기 '기준 n개 · 유형 n개 · 위치 n곳'", () => {
    for (const st of STATES) {
      const line = metricText(m[st]);
      expect(screen, `화면 ${st}`).toContain(line);
      expect(docx, `Word ${st}`).toContain(metricLine(st, m));
      expect(sheetText("요약"), `Excel 요약 ${st}`).toContain(metricLine(st, m));
      expect(sheetText("자체진단 점검표"), `Excel 점검표 ${st}`).toContain(metricLine(st, m));
      expect(md, `Markdown ${st}`).toContain(metricLine(st, m));
    }
  });

  it("Word·Excel 요약표 숫자가 공통 수치와 같음", () => {
    const xs = wb.getWorksheet("요약")!;
    const rows: (string | number)[][] = [];
    xs.eachRow((r) => rows.push((r.values as (string | number)[]).slice(1)));
    for (const st of STATES) {
      const title = { confirmed_fail: "부적합 (점검자 판정)", auto_fail: "오류 (자동 규칙)", review: "오류 의심" }[st];
      const row = rows.find((r) => r[0] === title)!;
      expect(row.slice(2, 6)).toEqual([m[st].criteria, m[st].types, m[st].locations, m[st].pages]);
    }
    expect(docx).toContain(`점검한 페이지 수${m.pagesChecked}`);
  });

  it("결과 화면 목록의 위치 합(화면별 요소)이 공통 수치와 같음", () => {
    const g = viewJson(v).groups;
    const sum = (f: (x: (typeof g)[number]) => boolean) => g.filter(f).reduce((n, x) => n + x.pages.length, 0);
    expect(sum((x) => x.result === "fail" && x.humanResult !== "fail")).toBe(m.auto_fail.locations);
    expect(sum((x) => x.result === "fail" && x.humanResult === "fail")).toBe(m.confirmed_fail.locations);
    expect(sum((x) => x.result === "review" && !x.humanResult)).toBe(m.review.locations);
  });

  it("화면에는 단위 없는 '가지'·항목 수 혼용 표현이 없음", () => {
    expect(screen).not.toMatch(/가지|개 항목/);
    expect(screen).toContain(`페이지 ${m.pagesChecked}개`);
  });
});
