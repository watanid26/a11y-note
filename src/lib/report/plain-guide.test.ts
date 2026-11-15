// 쉽게 보기·개선 방향: 기준 원문은 그대로, 쉬운 설명·수정 전후·확인 방법이 붙는지, 판정은 바뀌지 않는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildChecklist } from "./checklist";
import { buildReport } from "./docx";
import { buildFixRequests } from "./fixes";
import { STATE_LABEL, issueRecords } from "./model";
import { GLOSSARY, PLAIN_LABEL, basedExample, improvementPlan, plainGuide, reviewQuestion, sameElementGroups, shortHtml, termsIn } from "./plain-guide";
import { fixtureView } from "./test-fixture";

async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
const shotPng = () => sharp({ create: { width: 1280, height: 1400, channels: 3, background: "#ffffff" } }).png().toBuffer();

describe("plainGuide", () => {
  const issues = issueRecords(fixtureView());
  const byRule = (r: string) => issues.find((x) => x.ruleId === r)!;

  it("기준 원문(번호·제목·판정·순위)을 그대로 두고 누가 불편한지 붙인다", () => {
    const rec = byRule("image-alt");
    const g = plainGuide(rec)!;
    expect(g.criterion).toBe(`5.1.1 ${rec.itemTitle} · ${STATE_LABEL.ko.confirmed_fail} · ${rec.priority}`);
    expect(g.criterion.startsWith("5.1.1 적절한 대체 텍스트 제공 · ")).toBe(true);
    expect(g.who).toContain("화면 낭독기");
    expect(g.before?.html).toBe('<div id="el-1"></div>');
    expect(g.after?.code).toContain("alt=");
    expect(g.steps.at(-1)).toContain("다시 점검");
    expect(g.why).toContain("기능 차단");
  });

  it("여러 화면 공통 요소는 공통 요소부터 고치라고 안내한다", () => {
    const g = plainGuide(byRule("html-has-lang"))!;
    expect(g.steps[0]).toContain("공통 요소부터");
    expect(g.scope).toContain("공통 요소 1곳");
  });

  it("사람 확인 필요 항목은 수정 예시 없이 확인 절차부터", () => {
    const g = plainGuide(byRule("aria-allowed-role"))!;
    expect(g.after).toBeNull();
    expect(g.steps[0]).toMatch(/^먼저 확인해요/);
    expect(g.steps[1]).toContain("부적합으로 판정됐다면");
  });

  it("사람 확인 항목도 판정 정책 문구(안내 없음만으로 부적합 아님)를 빠뜨리지 않는다", () => {
    const rec = { ...byRule("aria-allowed-role"), ruleId: "kr-new-window", itemCode: "7.2.1" };
    expect(plainGuide(rec)!.steps.join(" ")).toContain("안내가 없다는 것만으로는 부적합이 아니에요");
  });

  it("규칙 설명이 없으면 기준 항목별 사용자 설명으로 대신한다", () => {
    const g = plainGuide(byRule("aria-allowed-role"))!;
    expect(g.who).toContain("이름·역할·상태");
  });

  it("일본 기준은 만들지 않는다", () => {
    expect(plainGuide(byRule("image-alt"), true)).toBeNull();
    expect(improvementPlan(issues, true)).toEqual([]);
  });

  it("긴 HTML 은 잘라서 보여준다", () => {
    expect(shortHtml("<a>" + "x".repeat(500) + "</a>").length).toBe(260);
  });
});

describe("실제 코드 기준 수정 예시", () => {
  it("클릭만 걸린 div 는 button 으로 (onclick 유지, cursor style 제거)", () => {
    const ex = basedExample("kr-click-only", `<div onclick="location.href='/apply.html'" style="cursor:pointer">민원신청 바로가기</div>`)!;
    expect(ex.code).toBe(`<button type="button" onclick="location.href='/apply.html'">민원신청 바로가기</button>`);
  });
  it("이름표 없는 입력칸은 label for 로 연결", () => {
    expect(basedExample("label", `<input type="text" name="q">`)!.code).toBe(`<label for="q">입력칸 이름</label>\n<input type="text" name="q" id="q">`);
    expect(basedExample("label", `<input id="kw" type="search">`)!.code).toContain(`<label for="kw">`);
  });
  it("숨긴 영역은 inert, 스킵 링크 목적지는 main id", () => {
    expect(basedExample("aria-hidden-focus", `<div class="slide" aria-hidden="true"><a href="/x">x</a></div>`)!.code).toBe(`<div class="slide" aria-hidden="true" inert>`);
    expect(basedExample("kr-skip-link", `<a href="#container">본문 바로가기</a>`, "skip_destination")!.code).toContain(`<main id="container">`);
  });
  it("자동 재생은 autoplay 를 빼고 controls, 명암은 해당 class 에 색", () => {
    expect(basedExample("kr-autoplay", `<video src="/intro.mp4" autoplay="" width="200"></video>`)!.code).toBe(`<video src="/intro.mp4" width="200" controls></video>`);
    expect(basedExample("color-contrast", `<p class="low note">x</p>`)!.code).toMatch(/^\.low \{ color: #595959; \}/);
    expect(basedExample("label", `<input type="password" name="pw">`)!.code).toMatch(/^<label for="pw">비밀번호<\/label>/);
  });
  it("확실히 만들 수 없으면 null", () => {
    expect(basedExample("color-contrast", `<p>x</p>`)).toBeNull();
    expect(basedExample("kr-click-only", ``)).toBeNull();
  });
});

describe("개선 방향 (고치는 순서)", () => {
  const issues = issueRecords(fixtureView());
  const plan = improvementPlan(issues);
  it("순위 → 확인 후 결정 → 재점검 순서, 같은 순위 안에서는 공통 요소 먼저", () => {
    const stages = plan.map((r) => r.stage);
    expect(stages[0]).toMatch(/1순위/);
    const lang = plan.find((r) => r.ids.includes(issues.find((x) => x.ruleId === "html-has-lang")!.id))!;
    expect(lang.what).toContain("공통 요소");
    expect(stages.at(-1)).toMatch(/재점검/);
    expect(stages.indexOf("판정 반영")).toBe(stages.length - 2);
    const all = plan.flatMap((r) => r.ids);
    expect(new Set(all).size).toBe(issues.length); // 모든 문제가 한 번씩
  });
});

describe("보고서 반영", async () => {
  const v = fixtureView();
  const before = issueRecords(v).map((r) => [r.id, r.state, r.itemCode, r.priority]);
  const text = await docxText(await buildReport(v, { loadShot: shotPng }));
  const md = buildFixRequests(v);
  it("Word 에 지적사항 장, 한눈에 보기, 오류별 카드 한 장", () => {
    expect(text).toContain("2. 지적사항");
    expect(text).not.toContain(PLAIN_LABEL.planSub);
    expect(text).toContain(PLAIN_LABEL.readOrder);
    expect(text).toContain(PLAIN_LABEL.criterion);
    expect(text).toContain(PLAIN_LABEL.who);
    expect(text).toContain(PLAIN_LABEL.before);
    expect(text).toContain('<div id="el-1"></div>');
    expect(text).toContain(PLAIN_LABEL.verify);
    // 쉬운 설명이 있으면 문제·영향·조치 줄을 다시 싣지 않고, 6.3 이 말하는 "다시 점검" 단계도 카드마다 되풀이하지 않는다
    expect(text).not.toContain("회차 비교에서 이 문제가");
    // 캡처는 문제당 한 장 (확대본이 있으면 확대본만)
    expect(text).not.toMatch(/그림 P-\d{3}-b/);
  });
  it("카드용 개선 방향은 공통 요소·재점검 단계를 뺀다 (Excel·수정 요청서는 전체)", () => {
    for (const rec of issueRecords(v)) {
      const pg = plainGuide(rec)!;
      expect(pg.core.length).toBeGreaterThan(0);
      expect(pg.core.some((x) => /회차 비교|공통 요소부터/.test(x))).toBe(false);
      expect(pg.steps.at(-1)).toMatch(/회차 비교/);
    }
  });
  it("수정 요청서에 누가 불편한지·개선 방향·확인", () => {
    expect(md).toContain(PLAIN_LABEL.who);
    expect(md).toContain(`**${PLAIN_LABEL.steps}**`);
    expect(md).toContain("## 고치는 순서");
  });
  it("판정·순위는 바뀌지 않는다", () => {
    expect(issueRecords(v).map((r) => [r.id, r.state, r.itemCode, r.priority])).toEqual(before);
  });
  it("일본 기준 보고서에는 넣지 않는다", async () => {
    const ja = await docxText(await buildReport(fixtureView({ pack: "jis2016" }), { loadShot: shotPng }));
    expect(ja).not.toContain(PLAIN_LABEL.criterion);
    expect(ja).not.toContain(PLAIN_LABEL.readOrder);
  });
  it("Excel 에 쉽게 보기·개선 방향 시트 (고치는 순서대로, 모든 문제)", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildChecklist(v)) as never);
    const ws = wb.getWorksheet(PLAIN_LABEL.sheet)!;
    expect(ws).toBeTruthy();
    expect(ws.getRow(2).getCell(5).value).toBe(PLAIN_LABEL.who);
    const ids: string[] = [];
    ws.eachRow((r, i) => { if (i > 2 && r.getCell(2).value) ids.push(String(r.getCell(2).value)); });
    expect(new Set(ids).size).toBe(issueRecords(v).length);
    const ja = new ExcelJS.Workbook();
    await ja.xlsx.load((await buildChecklist(fixtureView({ pack: "jis2016" }))) as never);
    expect(ja.getWorksheet(PLAIN_LABEL.sheet)).toBeUndefined();
  });
});

describe("같은 요소 묶기 · 용어 풀이 · 예/아니오 질문 · 독자별 요약", () => {
  const base = issueRecords(fixtureView());
  const loc = (pageStateId: string, selector: string) => ({ ...base[0].locations[0], pageStateId, selector });
  const rec = (id: string, ...locs: ReturnType<typeof loc>[]) => ({ ...base[0], id, locations: locs });

  it("같은 페이지에서 같은 요소이거나 그 안쪽이면 한 묶음 (탭 위젯이 여러 규칙으로 나뉜 경우)", () => {
    const g = sameElementGroups([
      rec("P-001", loc("p1", "#newsTab01")),
      rec("P-002", loc("p1", "#newsTab01 > li:nth-of-type(1)")),
      rec("P-003", loc("p1", "#newsTab01 > li:nth-of-type(2) > a")),
      rec("P-004", loc("p2", "#newsTab01")), // 다른 화면
      rec("P-005", loc("p1", "body > footer > a")),
    ]);
    expect(g).toEqual([{ selector: "#newsTab01", ids: ["P-001", "P-002", "P-003"], pages: 1 }]);
  });
  it("서로 다른 요소를 이어 붙여 한 묶음으로 만들지 않는다", () => {
    const g = sameElementGroups([
      rec("P-001", loc("p1", "#a")),
      rec("P-002", loc("p1", "#a"), loc("p1", "#b")),
      rec("P-003", loc("p1", "#b")),
    ]);
    expect(g.map((x) => [x.selector, x.ids])).toEqual([["#a", ["P-001", "P-002"]], ["#b", ["P-002", "P-003"]]]);
  });
  it("html·body 같은 넓은 선택자로는 묶지 않는다", () => {
    expect(sameElementGroups([rec("P-001", loc("p1", "body")), rec("P-002", loc("p1", "body > main > img"))])).toEqual([]);
    expect(sameElementGroups([rec("P-001", loc("p1", "html")), rec("P-002", loc("p1", "html"))])).toEqual([]);
  });
  it("용어 풀이는 글에 나온 용어만", () => {
    expect(termsIn("화면 낭독기 사용자는 대체 텍스트를 듣습니다")).toHaveLength(2);
    expect(termsIn("로그인 버튼")).toEqual([]);
    expect(GLOSSARY.every((g) => g.plain.endsWith("."))).toBe(true);
  });
  it("예/아니오 질문은 판정 정책을 따른다", () => {
    expect(reviewQuestion("kr-small-target")).toBeNull(); // 6.1.3 은 권고 기준이라 확정 질문 없음
    expect(reviewQuestion("target-size")).toBeNull();
    expect(reviewQuestion("kr-new-window")!.q).toContain("실제로");
    expect(reviewQuestion("kr-new-window")!.hint).toContain("안내 문구가 없다는 것만으로는");
    expect(reviewQuestion("kr-table-caption")!.hint).toContain("caption 이 없다는 것만으로는");
  });
  it("Word 결과 요약에 한 줄 요약·재점검 결과, 카드에 용어 풀이", async () => {
    const text = await docxText(await buildReport(fixtureView(), { loadShot: shotPng, rescan: { baseDate: "2026-10-01", resolved: 12, persisting: 5, added: 1, warnings: [] } }));
    expect(text).toContain("한 줄로 보면");
    expect(text).not.toContain("경영진·담당자");
    expect(text).toContain("해결 12곳, 남음 5곳, 새로 생김 1곳");
    expect(text).not.toContain("쉬운 용어 풀이");
    expect(text).toContain("용어 풀이");
    const without = await docxText(await buildReport(fixtureView(), { loadShot: shotPng }));
    expect(without).not.toContain("지난 점검(");
  });
});
