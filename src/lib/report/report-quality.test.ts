// 보고서 품질 고정 테스트: 공공기관 사이트 점검과 같은 모양의 가상 자료(인트로·접속 안내·같은 최종 URL, AI·규칙 대체 혼합)로
//  - AI 자유문장이 보고서 Word 본문에 들어가지 않는지
//  - 문구 길이·반복 제한
//  - Word·Excel·Markdown 의 상태명·숫자, AI 처리 건수(오류별 합계 = 전체)가 같은지
//  - 숨은 요소는 캡처 대신 DOM 근거, 캡처의 번호·테두리가 잘리지 않는지
//  - 범위가 대표 페이지가 아니면 "범위 검토 초안"으로 강제되는지
import ExcelJS from "exceljs";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { evidenceImages } from "../crop";
import { buildChecklist } from "./checklist";
import { LIMIT, clip, reportActual, parseAiReason } from "./copy";
import { docStatus, scopeGate, summary } from "./data";
import { buildReport } from "./docx";
import { buildFixRequests } from "./fixes";
import { aiAudit, aiSummaryText, issueRecords, metricLine, reportMetrics, type IssueState } from "./model";
import { AI_FREE_TEXT, AXE_RAW, sampleSiteLike } from "./sample-site-fixture";

async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
async function xlsxText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  let all = "";
  wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => (all += `${c.value}\n`))));
  return all;
}
const shotPng = () => sharp({ create: { width: 1280, height: 1400, channels: 3, background: "#ffffff" } }).png().toBuffer();

describe("문구 규칙 (copy.ts)", () => {
  it("clip: 접두·접속어·둘째 문장 제거, 길이 제한", () => {
    expect(clip(AI_FREE_TEXT, 90)).toBe("웹사이트 및 해당 인트로 페이지의 성격을 나타내는 적절한 페이지 제목이 제공되었습니다.");
    expect(clip("또한 " + "가".repeat(200), 60).length).toBeLessThanOrEqual(60);
    expect(clip("[AI:x] AI 의견 (미확정): 참고(AI 의견, 확인 필요): 적절함", 60)).toBe("적절함");
  });
  it("저장된 AI 근거 해석: 코드형·이전 자유문장·규칙 판정", () => {
    expect(parseAiReason('[AI:alt_matches] 그림 속 글자 "민원 신청"')).toEqual({ source: "ai", code: "alt_matches", note: '대체 텍스트가 이미지 내용과 같은 뜻으로 보임 — 그림 속 글자 "민원 신청"' });
    expect(parseAiReason(AI_FREE_TEXT).note.length).toBeLessThanOrEqual(LIMIT.aiNote);
    expect(parseAiReason("[규칙 판정] 확인이 필요합니다 (AI 미사용).").note).toBe("확인이 필요합니다.");
  });
  it("axe 원문 번역투는 보고서 문구로 바꾸고 측정값만 남김", () => {
    expect(reportActual("color-contrast", AXE_RAW, "글자와 배경의 색 차이가 작습니다")).toBe("글자와 배경의 명암비가 1:1로 측정되었어요 (기준 4.5:1).");
  });
});

describe("예시 기관형 자료 — 범위 무효", async () => {
  const v = sampleSiteLike();
  const issues = issueRecords(v);
  const audit = aiAudit(v);
  const docx = await docxText(await buildReport(v, { loadShot: shotPng }));
  const xlsx = await xlsxText(await buildChecklist(v));
  const md = buildFixRequests(v);

  it("인트로·접속 안내·같은 최종 URL만 점검하면 모든 산출물이 범위 검토 초안", () => {
    const gate = scopeGate(v);
    expect(gate.blocked).toBe(true);
    const status = docStatus(summary(v), false, gate);
    expect(status).toMatch(/^범위 검토 초안 · 제출용 아님/);
    for (const [name, text] of [["docx", docx], ["xlsx", xlsx], ["md", md]] as const) expect(text, name).toContain(status);
    expect(docx).toContain("범위 검토 초안 — 제출용 아님");
    expect(docx).not.toContain("확정본");
  });

  it("fixture 출처는 실제 도메인처럼 보여도 시연용 문서로 표시", () => {
    expect(docx).toContain("시연용 테스트 사이트");
    expect(md).toContain("시연용 테스트 사이트");
  });

  it("AI 처리 건수: 오류별 합계 = 전체 합계, 세 산출물의 요약 문구가 같음", () => {
    const sum = (k: "aiTotal" | "aiResolved" | "aiFallback") => issues.reduce((n, r) => n + (r[k] ?? 0), 0);
    expect(sum("aiTotal")).toBe(audit.aiFindings - audit.pendingFindings);
    expect(sum("aiResolved")).toBe(audit.aiResolvedFindings);
    expect(sum("aiFallback")).toBe(audit.fallbackFindings);
    expect(audit).toMatchObject({ aiFindings: 13, aiResolvedFindings: 5, fallbackFindings: 8 });
    const img = issues.find((r) => r.ruleId === "ai-image")!;
    expect([img.aiTotal, img.aiResolved, img.aiFallback]).toEqual([9, 3, 6]);
    const line = aiSummaryText(audit);
    for (const [name, text] of [["docx", docx], ["xlsx", xlsx], ["md", md]] as const) expect(text, name).toContain(line);
  });

  it("상태별 수치 문구가 세 산출물에서 같음", () => {
    const m = reportMetrics(v, issues);
    for (const st of ["confirmed_fail", "auto_fail", "review"] as IssueState[]) {
      const line = metricLine(st, m);
      for (const [name, text] of [["docx", docx], ["xlsx", xlsx], ["md", md]] as const) expect(text, `${name} ${st}`).toContain(line);
    }
  });

  it("보고서 Word 에 AI 자유문장·axe 원문·AI 수정 제안 원문이 없음", () => {
    expect(docx).not.toContain("웹사이트 및 해당 인트로 페이지");
    expect(docx).not.toContain("참고(AI 의견");
    expect(docx).not.toContain("엘리먼트는 반드시");
    expect(docx).not.toContain("풍부하게 작성하는 것이 좋겠습니다");
    expect(docx).not.toContain("민원 신청"); // AI 관찰 근거도 보고서 본문에는 넣지 않음
    // 내부 자료(Excel)에는 짧게 정리된 근거만
    expect(xlsx).toContain('AI 판단: 대체 텍스트가 이미지 내용과 같은 뜻으로 보임 — 그림 속 글자 "민원 신청"');
    expect(xlsx).not.toContain("또한 전반적으로");
  });

  it("오류 카드 문구 길이 제한", () => {
    for (const r of issues) {
      expect(r.title.length, r.title).toBeLessThanOrEqual(LIMIT.title);
      expect(r.actual.length, r.actual).toBeLessThanOrEqual(LIMIT.cardLine);
      if (r.basis) expect(r.basis.length, r.basis).toBeLessThanOrEqual(LIMIT.aiNote + 25);
    }
  });

  it("공통 안내는 섹션에 한 번만 (오류마다 반복하지 않음)", () => {
    const count = (s: string) => docx.split(s).length - 1;
    expect(count("항목 판정(3장)에 반영했어요")).toBe(1);
    expect(count("전체 목록은 Excel")).toBeLessThanOrEqual(1);
    expect(count("(아래 표, 전체 목록은 Excel)")).toBe(0);
    // 그림 설명(위치·확인할 것)은 문제당 한 번
    const withFigure = (docx.match(/그림 P-\d{3}-a/g) ?? []).length;
    expect(count("확인할 것:")).toBe(withFigure);
  });

  it("숨은 요소는 캡처 대신 DOM 근거로 표시", () => {
    const skip = issues.find((r) => r.variant === "skip_destination")!;
    expect(docx).not.toContain(`그림 ${skip.id}-a`);
    expect(docx).toContain("코드 위치: #accessibility > a:nth-of-type(1)");
    // 버튼(첫 초점 문제)은 목적지 문제와 다른 유형
    expect(issues.filter((r) => r.ruleId === "kr-skip-link")).toHaveLength(2);
  });
});

describe("대표 페이지가 있으면 범위 초안으로 강제하지 않음", () => {
  it("서로 다른 일반 페이지 2개", () => {
    const v = sampleSiteLike({ representative: true });
    expect(scopeGate(v).blocked).toBe(false);
    expect(docStatus(summary(v), false, scopeGate(v))).not.toMatch(/범위 검토 초안/);
  });

  it("대표 페이지가 있어도 점검자 범위 확인 전에는 완료본으로 내보내지 않음", () => {
    const v = sampleSiteLike({ representative: true });
    const pending = { ...v, scan: { ...v.scan, scopeStatus: "pending" } };
    expect(scopeGate(pending).structuralBlocked).toBe(false);
    expect(scopeGate(pending).blocked).toBe(true);
    expect(scopeGate(pending).reasons).toContain("점검자가 점검 범위를 아직 확인하지 않음");
  });

  it("업무 흐름 포함을 선택했는데 흐름 화면이 없으면 완료본으로 내보내지 않음", () => {
    const v = sampleSiteLike({ representative: true });
    const flowRequired = { ...v, scan: { ...v.scan, scopeMode: "public_and_flows" as const } };
    const gate = scopeGate(flowRequired);
    expect(gate.coverageBlocked).toBe(true);
    expect(gate.flowPages).toBe(0);
    expect(gate.reasons).toContain("업무 흐름 포함으로 선택했지만 크롬 확장으로 기록한 흐름 화면이 없음");
  });
});

describe("캡처 표시가 잘리지 않음", () => {
  it("자르는 높이보다 큰 요소도 번호 원형과 테두리 윗변이 축소본 안에 들어감", async () => {
    const png = await shotPng();
    const box = { x: 0, y: 170, w: 1280, h: 900 };
    const ev = await evidenceImages(png, box, { label: "1", window: 560, cropWidth: 960, pad: 90 });
    expect(ev).not.toBeNull();
    const r = 14;
    const markerTop = Math.max(r + 2, box.y - r) - r;
    expect(ev!.region.top).toBeLessThanOrEqual(markerTop);
    expect(ev!.region.top).toBeLessThanOrEqual(box.y);
  });
  it("보통 크기 요소는 요소 주변을 그대로 보여 줌", async () => {
    const png = await shotPng();
    const ev = await evidenceImages(png, { x: 300, y: 800, w: 120, h: 40 }, { label: "1", window: 560, cropWidth: 960 });
    expect(ev!.region.top).toBeLessThanOrEqual(800 - 28);
    expect(ev!.region.top + ev!.region.height).toBeGreaterThanOrEqual(840);
  });
  it("요소 주변 문맥을 내용 행 정리 뒤에도 보존함", async () => {
    const png = await sharp({ create: { width: 1280, height: 1400, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const ev = await evidenceImages(png, { x: 440, y: 780, w: 120, h: 40 }, { label: "1", window: 560, cropWidth: 960 });
    expect(ev).not.toBeNull();
    expect(ev!.region.top).toBeLessThanOrEqual(752);
    expect(ev!.region.top + ev!.region.height).toBeGreaterThanOrEqual(848);
  });
});

describe("첫 2쪽 가독성: 결론 → 우선순위", async () => {
  const docx = await docxText(await buildReport(sampleSiteLike({ representative: true }), { loadShot: async () => null }));
  const front = docx.slice(0, docx.indexOf("2. 지적사항"));
  it("표지에 읽는 방법·문서 구성 안내가 없고, 1장에 결론·우선 처리할 오류가 바로 나옴", () => {
    expect(front).not.toContain("읽는 방법");
    expect(front).not.toContain("이 문서의 구성");
    const s1 = front.slice(front.indexOf("1. 결과 요약"));
    expect(s1).toMatch(/\d+개 항목 중 \d+개를 판정했고|\d+개 항목을 모두 판정했어요/);
    expect(s1).toContain("우선 처리할 오류");
    // 기준 항목 33개 표·각주는 6장으로 옮겨 1장을 짧게 유지
    expect(s1).not.toContain("기준 항목 상태");
    expect(s1).not.toContain("※ 사람 확인 필요");
    expect(s1.length).toBeLessThan(1500);
  });
});
