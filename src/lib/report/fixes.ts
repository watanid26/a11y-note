// 개발팀 수정 요청서 (Markdown). 개발자나 코딩 도구에 그대로 넘길 수 있게 위치·코드·완료 조건을 빠짐없이 적는다.
//  A. 점검자 확정 부적합 — 바로 수정
//  B. 자동 신호(확정 아님) — 개발자가 실제 화면을 확인한 뒤 수정
//  C. 사람 확인 필요 — 점검자 확인 전에는 수정 지시가 아님

import type { ScanView } from "../scan-view";
import { NOT_CERT_JA, NOT_CERT_KO, dateKst, docStatus, draftInputText, scopeGate, submissionInfo, summary } from "./data";
import { STATE_LABEL, aiAudit, aiSummaryText, provenanceText, byPriority, causeGroups, causeText, fixedExample, issueRecords, metricLine, metricText, reportMetrics, reviewFootnote, type IssueRecord, type IssueState } from "./model";
import { ruleHelp } from "../rule-help";
import { PLAIN_LABEL, improvementPlan, plainGuide, sameElementGroups } from "./plain-guide";
import { REPORT_TEMPLATE_VERSION } from "./version";

const HTML_SHOWN = 3;

const TXT = {
  ko: {
    title: (n: string) => `# 개발팀 수정 요청서 — ${n}`,
    meta: ["기준", "대상", "점검일", "문서 상태", "판단 방식", "점검 기관", "점검자"],
    ai: (audit: ReturnType<typeof aiAudit>): string => audit.attempted
      ? `규칙 점검 + AI 처리 ${audit.aiFindings}건(실제 AI 해석 ${audit.aiResolvedFindings}건 · 규칙 fallback ${audit.fallbackFindings}건 · 확정 아님)${audit.inconsistent ? " · 설정 불일치 확인 필요" : ""} + 점검자 확인`
      : "규칙 점검 + 점검자 확인 (AI 사용 안 함)",
    howTo: [
      "이 문서는 웹 접근성 자체진단 결과 중 수정이 필요한 위치를 정리한 것이에요.",
      "- **A**는 점검자가 부적합으로 확정한 문제예요. 바로 수정하여 주세요.",
      "- **B**는 자동 신호(확정 아님)이에요. 실제 화면에서 확인한 뒤 수정하여 주세요. 위반 확정이 아니에요.",
      "- **C**는 사람 확인 필요 위치예요. 점검자 확인 전에는 수정 지시가 아니에요.",
      "- 각 상태 안에서는 우선순위 순이에요. 우선순위는 위치 수가 아니라 사용자 영향(1순위 = 기능 차단, 2순위 = 이용 불편, 3순위 = 개선 권장)으로 정했어요.",
      "- 같은 선택자가 여러 화면에 나오면 \"원인 1곳\"이에요. 공통 레이아웃(머리글·바닥글·공통 컴포넌트) 한 곳을 수정하면 해당 화면이 모두 해결돼요.",
    ],
    common: [
      "## 공통 재현 절차",
      "",
      "모든 항목에 공통으로 적용해요. 항목별로는 **재현 행동**(3단계)과 **선택자**만 적었어요.",
      "",
      "1. 항목의 \"영향 화면 주소\" 표에서 화면 URL을 열어요 (데스크톱 크롬, 창 너비 1280px 기준).",
      "2. 개발자 도구(F12) → Elements 에서 Ctrl+F 로 \"원인(선택자)\"를 검색해 요소를 찾아요.",
      "3. 항목의 **재현 행동**을 수행해 \"실제 결과\"가 나타나는지 확인해요.",
      "4. 수정 후 같은 페이지를 다시 점검하여 \"수정 완료 조건\"을 확인해요.",
    ],
    sec: { confirmed_fail: "A. 점검자 확정 부적합", auto_fail: "B. 자동 신호(확정 아님)", review: "C. 사람 확인 필요" } as Record<IssueState, string>,
    secLead: {
      confirmed_fail: "점검자가 부적합으로 확정했어요. 바로 수정하여 주세요.",
      auto_fail: "자동 점검이 찾은 신호이며 위반 확정이 아니에요. 실제 화면에서 문제를 확인한 뒤 수정하여 주세요.",
      review: "자동 점검만으로는 판단할 수 없어요. 점검자 확인 전에는 수정 지시가 아니에요.",
    } as Record<IssueState, string>,
    none: "해당 없음.",
    f: { priority: "우선순위", cause: "원인·영향", code: "기준 코드", state: "판정 상태", why: "왜 문제인지", what: "확인할 것", repro: "재현 행동", how: "확인 행동", actual: "실제 결과", expected: "기대 결과", fix: "수정 방향", basis: "판단 근거", done: "수정 완료 조건", evidence: "캡처·증거 ID" },
    causes: (n: number, total: number) => `원인(선택자)별 위치 (원인 ${n}곳 · 위치 ${total}곳, 전체 표시)`,
    causeHead: "| # | 원인 (선택자) | 구분 | 영향 화면 (캡처 ID) |\n|---|---|---|---|",
    shared: (n: number) => `공통 요소 · 페이지 ${n}개`,
    single: "개별 요소",
    pagesTitle: "영향 화면 주소",
    pageHead: "| 캡처 ID | 화면명 | 전체 URL |\n|---|---|---|",
    current: "현재 HTML",
    htmlShown: (n: number, total: number) => `(서로 다른 요소 ${total}개 중 ${n}개 표시 — 나머지는 위 표의 선택자로 찾아 주세요)`,
    example: "수정 예시",
    noExample: "수정 예시 코드는 없어요. 위 \"수정 방향\"에 따라 해당 요소를 수정하여 주세요.",
  },
  ja: {
    title: (n: string) => `# 開発チーム向け修正依頼書 — ${n}`,
    meta: ["規格", "対象", "試験日", "文書の状態", "判断方法", "試験機関", "試験者"],
    ai: (audit: ReturnType<typeof aiAudit>): string => audit.attempted
      ? `規則チェック＋AI 処理 ${audit.aiFindings}件（AI 解釈 ${audit.aiResolvedFindings}件・規則 fallback ${audit.fallbackFindings}件・未確定）${audit.inconsistent ? "・設定不一致の確認が必要" : ""}＋試験者確認`
      : "規則チェック＋試験者確認（AI 不使用）",
    howTo: [
      "本書はウェブアクセシビリティ自己試験の結果のうち、修正が必要な箇所をまとめたものです。",
      "- **A** は試験者が不適合と確定した問題です。修正してください。",
      "- **B** は自動チェックが検出した問題の兆候です。実際のページで確認してから修正してください（確定ではありません）。",
      "- **C** は試験者の確認が必要な箇所です。確認前は修正指示ではありません。",
    ],
    common: ["## 共通の再現手順", "", "1. 「影響ページの URL」の表からページを開きます。", "2. 開発者ツールで「原因（セレクタ）」を検索します。", "3. 各項目の「再現の操作」を行います。", "4. 修正後、同じページを再試験します。"],
    sec: { confirmed_fail: "A. 試験者確定の不適合", auto_fail: "B. 自動チェックで検出した問題の兆候", review: "C. 要確認" } as Record<IssueState, string>,
    secLead: {
      confirmed_fail: "試験者が不適合と確定しました。",
      auto_fail: "自動チェックが検出した兆候です。実際のページで確認してから修正してください。",
      review: "自動チェックだけでは判断できません。試験者の確認前は修正指示ではありません。",
    } as Record<IssueState, string>,
    none: "なし。",
    f: { priority: "優先度", cause: "原因・影響", code: "達成基準", state: "判定の状態", why: "なぜ問題か", what: "確認すること", repro: "再現の操作", how: "確認の操作", actual: "実際の結果", expected: "期待される結果", fix: "修正の方向", basis: "判断の根拠", done: "修正完了の条件", evidence: "キャプチャ・根拠ID" },
    causes: (n: number, total: number) => `原因（セレクタ）ごとの箇所（原因 ${n}・箇所 ${total}、すべて表示）`,
    causeHead: "| # | 原因（セレクタ） | 区分 | 影響ページ（キャプチャID） |\n|---|---|---|---|",
    shared: (n: number) => `共通要素・${n}ページ`,
    single: "個別の要素",
    pagesTitle: "影響ページの URL",
    pageHead: "| キャプチャID | ページ名 | URL |\n|---|---|---|",
    current: "現在の HTML",
    htmlShown: (n: number, total: number) => `（異なる要素 ${total}件中 ${n}件を表示。残りは上の表のセレクタで探してください）`,
    example: "修正例",
    noExample: "修正例のコードはありません。上の「修正の方向」に従って修正してください。",
  },
};

/** 표 칸 안에서 Markdown 이 깨지지 않게 */
function md(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function fence(code: string, lang: string): string[] {
  const ticks = code.includes("```") ? "````" : "```";
  return [ticks + lang, code, ticks];
}

export function buildFixRequests(v: ScanView): string {
  const ja = v.pack.locale === "ja";
  const T = ja ? TXT.ja : TXT.ko;
  const lang = ja ? "ja" : "ko";
  const s = summary(v);
  const issues = issueRecords(v);
  const audit = aiAudit(v);
  const L: string[] = [];
  L.push(T.title(v.project.name), "");
  const sub = submissionInfo(v, ja);
  const inputNotice = draftInputText(sub, ja);
  if (inputNotice) L.push(`> **${inputNotice}**`, "");
  if (scopeGate(v).blocked) L.push(`> **${ja ? "範囲確認用の草案 — 提出不可" : "범위 검토 초안 — 제출용 아님"}: ${scopeGate(v).reasons.join(", ")}**`, "");
  L.push(`- ${T.meta[0]}: ${v.scan.packVersion ?? v.pack.name}`);
  L.push(`- ${ja ? "報告書バージョン" : "보고서 버전"}: ${REPORT_TEMPLATE_VERSION}`);
  L.push(`- ${T.meta[1]}: ${sub.target}`);
  L.push(`- ${T.meta[2]}: ${dateKst(v.scan.createdAt)}`);
  const gate = scopeGate(v);
  L.push(`- ${T.meta[3]}: ${docStatus(s, ja, gate, sub.incomplete)}`);
  L.push(`- ${T.meta[4]}: ${aiSummaryText(audit, ja)}`);
  L.push(`- ${T.meta[5]}: ${sub.org}`);
  L.push(`- ${T.meta[6]}: ${sub.auditor}`);
  const m = reportMetrics(v, issues);
  // 화면·Word·Excel 과 같은 수치·같은 표기
  L.push("", ja ? "## 要約" : "## 요약", "");
  for (const st of ["confirmed_fail", "auto_fail", "review"] as IssueState[]) L.push(`- ${metricLine(st, m, ja)}`);
  L.push(ja ? `- 試験ページ ${m.pagesChecked}・試験者確定 ${m.itemsConfirmed}/${m.itemsTotal}` : `- 점검 페이지 ${m.pagesChecked}개 · 점검자 확정 ${m.itemsConfirmed} / ${m.itemsTotal}개 기준`);
  L.push(ja ? "- 全箇所の一覧は Excel「問題一覧」シートが基準資料です。" : "- 전체 위치 목록의 기준 자료는 Excel \"오류 목록\" 시트예요.", "");
  L.push(reviewFootnote(m.reviewDetail, ja), "");
  L.push(...T.howTo, "");
  L.push(...T.common, "");
  // 개선 방향: 고치는 순서 (한국어)
  const plan = improvementPlan(issues, ja);
  if (plan.length) {
    L.push(`## ${PLAIN_LABEL.planSub.replace(/^6\.3 /, "")}`, "", PLAIN_LABEL.planLead.replace(/7장의 /, "각 항목의 "), "", `| ${PLAIN_LABEL.planHead.join(" | ")} |`, "|---|---|---|");
    for (const r of plan) L.push(`| ${md(r.stage)} | ${r.ids.join(", ") || "-"} | ${md(r.what)} |`);
    L.push("");
    const groups = sameElementGroups(byPriority(issues));
    if (groups.length) {
      L.push("### 같은 요소에서 나온 오류 (함께 고치기)", "", "한 요소가 여러 기준에 걸려 오류가 여러 개로 나뉜 경우예요. 판정과 오류 수는 그대로이고, 고칠 때 한 번에 같이 고쳐요.", "", "| 오류 ID | 공통 요소 (선택자) | 나온 화면 |", "|---|---|---|");
      for (const g of groups.slice(0, 12)) L.push(`| ${g.ids.join(", ")} | \`${g.selector.replace(/`/g, "")}\` | ${g.pages}개 |`);
      L.push("");
    }
  }

  const states: IssueState[] = ["confirmed_fail", "auto_fail", "review"];
  for (const st of states) {
    const list = byPriority(issues.filter((x) => x.state === st));
    L.push(`## ${T.sec[st]} — ${metricText(m[st], ja)}`, "", T.secLead[st], "");
    if (!list.length) L.push(T.none, "");
    for (const rec of list) L.push(...issueBlock(rec, T, lang, ja));
  }
  L.push("---", "", `> ${ja ? NOT_CERT_JA : NOT_CERT_KO}`, "");
  return L.join("\n");
}

function issueBlock(rec: IssueRecord, T: (typeof TXT)["ko"] | (typeof TXT)["ja"], lang: "ko" | "ja", ja: boolean): string[] {
  const L: string[] = [];
  const review = rec.state === "review";
  const help = ruleHelp(rec.ruleId, ja ? "ja" : "ko");
  const f = T.f;
  L.push(`### ${rec.id} · [${rec.itemCode}] ${rec.title}`, "");
  L.push(`- **${f.priority}**: ${rec.priority}`);
  L.push(`- **${f.cause}**: ${causeText(rec, ja)}`);
  L.push(`- **${f.code}**: ${rec.itemCode} ${rec.itemTitle}`);
  L.push(`- **${f.state}**: ${STATE_LABEL[lang][rec.state]}`);
  if (rec.why || help?.why) L.push(`- **${f.why}**: ${rec.why || help?.why}`);
  const pg = plainGuide(rec, ja);
  if (pg) {
    L.push(`- **${PLAIN_LABEL.criterion}**: ${pg.criterion}`);
    L.push(`- **${PLAIN_LABEL.who}**: ${pg.who}`);
  }
  L.push(`- **${review ? f.what : f.actual}**: ${rec.actual}`);
  L.push(`- **${f.expected}**: ${rec.expected}`);
  L.push(`- **${review ? f.how : f.repro}**: ${rec.howToCheck}`);
  L.push(`- **${ja ? "判断の出所" : "판단 출처"}**: ${provenanceText(rec, ja)}`);
  if (rec.basis) L.push(`- **${f.basis}**: ${rec.basis}`);
  if (!review) L.push(`- **${f.fix}**: ${rec.fix}`);
  L.push(`- **${f.done}**: ${rec.doneWhen}`);
  if (pg) {
    L.push(`- **${PLAIN_LABEL.verify}**: ${pg.verify}`);
    L.push(`- **${PLAIN_LABEL.why}**: ${pg.why} — ${pg.scope}`);
  }
  const shots = [...new Set(rec.locations.map((l) => l.shotId).filter(Boolean))];
  L.push(`- **${f.evidence}**: ${[rec.id, ...shots].join(", ")}`);
  if (pg) L.push("", `**${review ? PLAIN_LABEL.reviewSteps : PLAIN_LABEL.steps}**`, "", ...pg.steps.map((x, i) => `${i + 1}. ${x}`));
  const groups = causeGroups(rec);
  L.push("", `**${T.causes(groups.length, rec.locations.length)}**`, "", T.causeHead);
  groups.forEach((g, i) =>
    L.push(`| ${i + 1} | \`${md(g.selector)}\` | ${g.shared ? T.shared(g.pages.length) : T.single} | ${g.pages.map((p) => `${md(p.label)}${p.shotId ? ` (${p.shotId})` : ""}`).join("<br>")} |`),
  );
  const pages = new Map<string, { label: string; url: string; shot: string | null }>();
  for (const l of rec.locations) if (!pages.has(l.pageStateId)) pages.set(l.pageStateId, { label: l.pageLabel, url: l.url, shot: l.shotId });
  L.push("", `**${T.pagesTitle}**`, "", T.pageHead);
  for (const p of pages.values()) L.push(`| ${p.shot ?? "-"} | ${md(p.label)} | ${md(p.url)} |`);
  L.push("");
  // 현재 HTML: 서로 다른 요소별로
  const distinct: { selector: string; html: string }[] = [];
  for (const l of rec.locations) if (l.html && !distinct.some((d) => d.selector === l.selector)) distinct.push({ selector: l.selector, html: l.html });
  if (distinct.length) {
    L.push(`**${T.current}**${distinct.length > HTML_SHOWN ? ` ${T.htmlShown(HTML_SHOWN, distinct.length)}` : ""}`, "");
    for (const d of distinct.slice(0, HTML_SHOWN)) {
      L.push(`\`${d.selector}\``, ...fence(d.html, "html"), "");
    }
  }
  if (!review) {
    const ex = pg?.after ? { code: pg.after.code, note: pg.after.note } : fixedExample(rec.ruleId, distinct[0]?.html ?? "", help?.example ?? null, ja);
    L.push(`**${T.example}**${pg ? ` (${PLAIN_LABEL.exampleNote})` : ""}`, "");
    if (ex) {
      if (ex.note) L.push(ex.note, "");
      L.push(...fence(ex.code, /[{;]\s*$|^[a-z-]+\s*:|^[.#]?[\w-]+[^<\n]*\{/m.test(ex.code) && !ex.code.startsWith("<") ? "css" : "html"), "");
    } else L.push(T.noExample, "");
  }
  return L;
}
