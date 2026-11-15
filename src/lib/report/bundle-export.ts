// 통합 점검 묶음 내보내기: JSON · Excel · Word.
// 세 형식 모두 같은 ProjectBundle 에서 만들고, 출처(서버 자동/크롬 확장/AI/점검자)와 판정 이력(v1/v2/v3)을 열로 나눠 적는다.
// "통합 참고" 값은 확정 판정이 아님을 모든 형식에 적는다.

import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import type { DisplayStatus } from "../../core/judge";
import { CONFLICT_LABEL, EVIDENCE_LABEL, SOURCE_LABEL, type BundleSource, type ProjectBundle } from "../bundle";
import { CONFORMANCE_LABEL } from "../conformance";
import { NOT_CERT_KO } from "./data";
import { EVAL_KIND_LABEL, EVAL_RESULT_LABEL } from "../manual-eval";

export const BUNDLE_NOTICE = "통합 참고값은 여러 출처의 결과를 나란히 놓고 요약한 것이며 확정 판정이 아닙니다. 최종 판단은 점검자 판정(v3)만 봅니다.";

export const REFERENCE_NOTICE = "검사항목에 연결되지 않은 자동 점검 결과입니다. 판정에 반영하지 않는 참고 결과이며 항목 상태·오류 수·충돌에 넣지 않습니다. WCAG 는 점검 도구(axe-core) 표기 그대로입니다.";
const REF_OUTCOME_KO: Record<string, string> = { violation: "위반", incomplete: "확인 필요" };
const RESULT_KO: Record<string, string> = { fail: "오류", review: "사람 확인 필요", pending: "AI 대기", pass: "오류 없음" };
const LAYER_RESULT_KO: Record<string, string> = { ...RESULT_KO, supported: "AI 지지", contradicted: "AI 반박", uncertain: "AI 판단 보류", insufficient_evidence: "AI 근거 부족" };
const ITEM_KO: Record<DisplayStatus, string> = { pass: "적합 (점검자)", fail: "부적합 (점검자)", na: "해당 없음 (점검자)", fail_auto: "자동 신호", clear_auto: "자동 오류 미발견", na_auto: "해당 요소 없음 (자동)", review: "사람 확인 필요", untested: "미점검" };
const SOURCES: BundleSource[] = ["server", "extension", "file"];

const NONE = "기록 없음";
const metaRows = (b: ProjectBundle): [string, string][] => {
  const m = b.metadata;
  const x = b.methods;
  return [
    ["점검자", m.evaluator ?? NONE],
    ["의뢰 기관", m.commissioner ?? NONE],
    ["작성 시각", m.generatedAt],
    ["기준", m.standard],
    ["판정 대상", m.target],
    ["점검 환경", m.environment],
    ["점검 엔진", m.engines.join(" / ")],
    ["AI 설정", m.aiConfigs.join(" / ")],
    ["표본", `화면 ${m.sample.pages} (필수 화면 ${m.sample.required} · 같은 틀 묶음 ${m.sample.templates}) · 업무 흐름 ${m.sample.flows}개 ${m.sample.flowSteps}단계 · 무작위 표본 ${m.sample.random || NONE} · 흐름 분기 ${m.sample.branches.total ? `${m.sample.branches.total}개 (확인함 ${m.sample.branches.tested})` : NONE}`],
    ["점검 방법별 기록", `자동 ${x.automatedFindings} (그중 자동 확인 필요 ${x.automatedNeedsReview}) · AI 보조 판단 ${x.aiSemantic} · AI 검증 ${x.aiVerification} · 점검자 위치 판정 ${x.humanFindingDecisions} · 점검자 항목 결정 ${x.humanItemDecisions} · 자동 통과·해당 없음 원본 보존 화면 ${x.ruleOutcomePages} · 수동 점검 ${x.manualChecks || NONE} · 보조기술 점검 ${x.assistiveTech || NONE} · 사용자 평가 ${x.userTesting || NONE}`],
    ["기록하지 못한 정보", m.notRecorded.join(" · ") || "없음"],
  ];
};
const conformanceRows = (b: ProjectBundle): [string, string][] => [
  ["항목 단위 적합 요약 (평균 아님)", CONFORMANCE_LABEL[b.conformance.state]],
  ["점검자 확정 부적합 항목", b.conformance.failed.join(", ") || "없음"],
  ["점검자 확정 전 항목", `${b.conformance.unconfirmed.length}/${b.conformance.total}`],
  ["자동 신호가 남은 항목", b.conformance.autoSignals.join(", ") || "없음"],
  ["판단 방식", b.conformance.note],
];
const refText = (r: ProjectBundle["issues"][number]["refs"]) => ({
  wcag: r.wcag.join(", ") || (r.source ? "-" : "자체 규칙 (대응 기록 없음)"),
  act: r.act.join(", ") || "-",
  kind: r.bestPractice ? "모범 사례 (WCAG 부적합 근거 아님)" : r.source ? "WCAG 규칙" : "자체 규칙",
});

const flowText = (s: { flowId: string | null; flowStep: number | null }) => (s.flowId ? `흐름 ${s.flowId.slice(0, 8)} · ${s.flowStep ?? 0}단계` : "공개 화면");

/** JSON: 묶음 그대로 + 안내 문구. 원본 id 를 남겨 다시 찾아갈 수 있게 한다 */
export function bundleJson(b: ProjectBundle) {
  return { notice: BUNDLE_NOTICE, disclaimer: NOT_CERT_KO, ...b };
}

export async function bundleXlsx(b: ProjectBundle): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "접근성 점검노트";
  const head = (ws: ExcelJS.Worksheet, cols: [string, number][]) => {
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const s0 = wb.addWorksheet("묶음 요약");
  head(s0, [["구분", 24], ["내용", 100]]);
  s0.addRows([
    ["사이트", b.project.name],
    ["점검 주소", b.project.baseUrl],
    ["기준", b.project.pack],
    ["묶음 형식", b.version],
    ["안내", BUNDLE_NOTICE],
    ["면책", NOT_CERT_KO],
    ["법적·인증 고지", b.legalNote],
    ...conformanceRows(b),
    ...metaRows(b),
    ["통합 오류 수", b.counts.issues],
    ["여러 출처에서 나온 오류", b.counts.multiSource],
    ["충돌 (사람 확인)", b.counts.conflicts],
    ["점검자 판정 있음", b.counts.humanDecided],
    ["AI 검증 있음", b.counts.aiVerified],
    ["기준 외 참고 (판정 미반영)", `규칙 ${b.references.rules.length}개 · 요소 ${b.references.total}곳`],
    ...b.warnings.map((w) => ["주의", w]),
  ]);
  s0.addRow([]);
  s0.addRow(["포함한 회차", "출처 · 회차 id · 시작 · 끝 · 기준 · 엔진 · AI 설정 · 범위 확인"]).font = { bold: true };
  for (const s of b.scans) s0.addRow([SOURCE_LABEL[s.source], [s.id, s.createdAt, s.finishedAt ?? "-", s.packVersion ?? "-", s.engineVersion ?? "-", s.aiConfig ?? "-", s.scopeStatus].join(" · ")]);

  const s1 = wb.addWorksheet("항목");
  head(s1, [["항목", 10], ["항목명", 30], ...SOURCES.map((s) => [SOURCE_LABEL[s], 22] as [string, number]), ["통합 참고 (확정 아님)", 24], ["충돌", 10]]);
  for (const i of b.items) s1.addRow([i.code, i.title, ...SOURCES.map((s) => (i.bySource[s] ? ITEM_KO[i.bySource[s]!] : "-")), ITEM_KO[i.combined], i.conflict ? "사람 확인" : ""]);

  const s2 = wb.addWorksheet("통합 오류");
  head(s2, [["항목", 8], ["항목명", 24], ["화면", 24], ["주소", 40], ["상태(흐름)", 18], ["화면 크기", 10], ["규칙", 22], ["WCAG 참고 (axe)", 14], ["ACT 규칙", 14], ["규칙 종류", 22], ["요소", 30], ["출처", 22], ["v1 자동", 14], ["v2 AI", 18], ["v3 점검자", 12], ["통합 참고 (확정 아님)", 18], ["충돌", 30], ["설명", 50], ["재현 절차", 60]]);
  for (const i of b.issues) {
    const by = (k: string[]) => [...new Set(i.layers.filter((l) => k.includes(l.kind)).map((l) => LAYER_RESULT_KO[l.result] ?? l.result))].join(", ") || "-";
    s2.addRow([
      i.itemCode,
      i.itemTitle,
      i.label,
      i.url,
      flowText(i.state),
      i.state.viewport ? `${i.state.viewport.w}×${i.state.viewport.h}` : NONE,
      i.ruleId,
      refText(i.refs).wcag,
      refText(i.refs).act,
      refText(i.refs).kind,
      i.selector,
      i.sources.map((s) => SOURCE_LABEL[s]).join(", "),
      by(["auto"]),
      by(["ai_semantic", "ai_verification"]),
      by(["human"]),
      RESULT_KO[i.combined] ?? i.combined,
      i.conflicts.map((c) => CONFLICT_LABEL[c]).join(" / "),
      i.message,
      i.repro ? i.repro.join("\n") : "공통 절차: 주소를 열고 선택자로 요소를 찾아 확인",
    ]);
  }

  const s3 = wb.addWorksheet("판정 이력");
  head(s3, [["항목", 8], ["규칙", 22], ["주소", 40], ["요소", 30], ["판", 6], ["근거 종류", 26], ["출처", 16], ["결과", 16], ["신뢰도", 8], ["처리", 22], ["모델·사람", 22], ["시각", 22], ["회차 id", 38], ["발견 사항 id", 38]]);
  for (const i of b.issues)
    for (const l of i.layers)
      s3.addRow([i.itemCode, i.ruleId, i.url, i.selector, l.rev, EVIDENCE_LABEL[l.kind], SOURCE_LABEL[l.source], LAYER_RESULT_KO[l.result] ?? l.result, l.confidence ?? "", l.route ?? "", l.by ?? "", l.at ?? "", l.scanId, l.findingId]);

  const s4 = wb.addWorksheet("화면");
  head(s4, [["주소", 50], ["화면 이름", 24], ["상태(흐름)", 20], ["화면 성격", 12], ["화면 크기", 10], ["점검 환경", 40], ["본 출처", 30]]);
  for (const p of b.pages) s4.addRow([p.url, p.label, flowText(p), p.screenKind ?? "-", p.viewport ? `${p.viewport.w}×${p.viewport.h}` : NONE, p.environments.join(" / ") || NONE, p.sources.map((s) => SOURCE_LABEL[s]).join(", ")]);

  if (b.evaluations.length) {
    const s6 = wb.addWorksheet("수동·보조기술·사용자 평가");
    head(s6, [["기록 id", 38], ["판", 8], ["출처", 14], ["종류", 16], ["항목", 8], ["화면", 40], ["과업", 30], ["방법", 20], ["보조기술", 18], ["브라우저", 18], ["OS·기기", 18], ["참여자", 20], ["결과", 14], ["심각도", 10], ["조작 순서", 40], ["메모", 40], ["점검자", 20], ["수행 시각", 22], ["고친 기록", 38]]);
    for (const e of b.evaluations)
      s6.addRow([e.id, e.current ? "최신" : "이전 판", SOURCE_LABEL[e.source], EVAL_KIND_LABEL.ko[e.kind], e.itemCode ?? "", e.pageKey ?? "", e.task ?? "", e.method ?? "", e.assistiveTech ?? "", e.browser ?? "", e.os ?? "", [e.participantCode, e.participantProfile].filter(Boolean).join(" · "), EVAL_RESULT_LABEL.ko[e.result], e.severity ?? "", e.steps.map((x, i) => `${i + 1}) ${x}`).join("\n"), e.notes, e.evaluator, e.performedAt ?? "", e.supersedes ?? ""]);
  }

  if (b.references.rules.length) {
    const s5 = wb.addWorksheet("기준 외 참고");
    head(s5, [["규칙 ID", 24], ["도구 결과", 12], ["WCAG(도구 표기)", 16], ["규칙 설명", 50], ["요소 수", 8], ["화면 수", 8], ["출처", 22]]);
    s5.addRow([REFERENCE_NOTICE]);
    for (const r of b.references.rules) s5.addRow([r.ruleId, REF_OUTCOME_KO[r.outcome], r.wcag.join(", ") || "-", r.message, r.count, r.pages, r.sources.map((s) => SOURCE_LABEL[s]).join(", ")]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function bundleDocx(b: ProjectBundle): Promise<Buffer> {
  const p = (text: string, bold = false) => new Paragraph({ children: [new TextRun({ text, bold })] });
  const cell = (text: string, bold = false) => new TableCell({ children: [p(text, bold)] });
  const table = (header: string[], rows: string[][]) =>
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: header.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))] });

  const conflicted = b.issues.filter((i) => i.conflicts.length);
  const doc = new Document({
    creator: "접근성 점검노트",
    title: `통합 점검 묶음 — ${b.project.name}`,
    description: NOT_CERT_KO,
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(`통합 점검 묶음 — ${b.project.name}`)] }),
          p(`점검 주소: ${b.project.baseUrl} · 기준: ${b.project.pack} · 형식: ${b.version}`),
          p(BUNDLE_NOTICE, true),
          p(NOT_CERT_KO),
          p(b.legalNote),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("0. 항목 단위 적합 요약 (평균 점수 아님)")] }),
          table(["구분", "내용"], conformanceRows(b)),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("0-1. 평가 정보 (WCAG-EM 보고 항목)")] }),
          table(["구분", "내용"], metaRows(b)),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. 포함한 회차")] }),
          table(["출처", "회차", "끝난 시각", "기준", "엔진", "범위 확인"], b.scans.map((s) => [SOURCE_LABEL[s.source], s.id.slice(0, 8), s.finishedAt ?? "-", s.packVersion ?? "-", s.engineVersion ?? "-", s.scopeStatus === "approved" ? "확인됨" : "미확인"])),
          ...b.warnings.map((w) => p(`주의: ${w}`)),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. 요약")] }),
          p(`통합 오류 ${b.counts.issues}건 · 여러 출처에서 나온 오류 ${b.counts.multiSource}건 · 충돌(사람 확인) ${b.counts.conflicts}건 · 점검자 판정 ${b.counts.humanDecided}건 · AI 검증 ${b.counts.aiVerified}건`),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. 항목별 출처 비교")] }),
          table(["항목", ...SOURCES.map((s) => SOURCE_LABEL[s]), "통합 참고"], b.items.map((i) => [`${i.code} ${i.title}`, ...SOURCES.map((s) => (i.bySource[s] ? ITEM_KO[i.bySource[s]!] : "-")), `${ITEM_KO[i.combined]}${i.conflict ? " · 충돌" : ""}`])),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. 사람 확인이 필요한 충돌")] }),
          conflicted.length
            ? table(["항목", "WCAG·ACT 참고", "주소", "요소", "출처", "충돌"], conflicted.map((i) => [`${i.itemCode} ${i.ruleId}`, `${refText(i.refs).wcag} / ${refText(i.refs).act}`, i.url, i.selector, i.sources.map((s) => SOURCE_LABEL[s]).join(", "), i.conflicts.map((c) => CONFLICT_LABEL[c]).join(" / ")]))
            : p("충돌 없음"),
          p("발견 사항별 판정 이력(v1 자동 → v2 AI → v3 점검자)은 Excel 묶음의 \"판정 이력\" 시트와 JSON 에 있습니다."),
          ...(b.references.rules.length
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. 기준 외 참고 (판정 미반영)")] }),
                p(REFERENCE_NOTICE),
                table(["규칙 ID", "도구 결과", "WCAG(도구 표기)", "요소 수", "화면 수", "출처"], b.references.rules.map((r) => [r.ruleId, REF_OUTCOME_KO[r.outcome], r.wcag.join(", ") || "-", String(r.count), String(r.pages), r.sources.map((s) => SOURCE_LABEL[s]).join(", ")])),
              ]
            : []),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
