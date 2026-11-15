// 항목별 판정 출처 표 (GPT 리뷰: 33개 항목 각각의 판정 출처 검증) → docs/coverage-<기준>.md
//   npx tsx scripts/coverage-table.ts
import { writeFileSync } from "node:fs";
import axe from "axe-core";
import { getPack } from "../src/core/packs";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const live = axe.getRules(TAGS).filter((r) => !r.tags.includes("deprecated"));
const wcagOf = (tags: string[]) => tags.map((t) => /^wcag(\d)(\d)(\d{1,2})$/.exec(t)).filter(Boolean).map((m) => `${m![1]}.${m![2]}.${m![3]}`);
const SOURCE = (r: string) => (r.startsWith("kr-") ? "자체 규칙" : r.startsWith("ai-") ? "의미 판단 후보" : "axe-core");

for (const id of ["kwcag22", "jis2016"] as const) {
  const pack = getPack(id);
  const lines = [`# 항목별 판정 출처 — ${pack.version}`, "", `엔진: axe-core ${axe.version} (태그 ${TAGS.join(", ")}), 자체 규칙, 의미 판단 후보. 생성: ${new Date().toISOString().slice(0, 10)}`, "", "| 항목 | 이름 | 방식 | 판정 출처 (규칙) | 자동 결과가 없을 때 | 해당 없음 조건 |", "|---|---|---|---|---|---|"];
  for (const it of pack.items) {
    const explicit = Object.entries(pack.ruleMap).filter(([, c]) => c === it.code).map(([r]) => `${r} (${SOURCE(r)})`);
    const viaWcag = live.filter((r) => !pack.ruleMap[r.ruleId] && it.wcag.some((w) => wcagOf(r.tags).includes(w))).map((r) => `${r.ruleId} (WCAG ${it.wcag.join("/")} 연결)`);
    const sources = [...explicit, ...viaWcag];
    const noResult = it.method === "manual" || it.needsHuman ? "검토 필요 (사람 확인)" : sources.length ? "문제 미발견(자동) — 확정 아님" : "⚠ 출처 없음";
    lines.push(`| ${it.code} | ${it.title} | ${it.method}${it.needsHuman ? " · 사람 확인" : ""} | ${sources.join(", ") || "—"} | ${noResult} | ${it.applies ?? "—"} |`);
  }
  lines.push("", "모든 항목은 점검자가 항목 단위로 확정해야 \"적합·부적합·해당 없음\" 이 된다. 화면이 없으면 \"미검사\".");
  writeFileSync(`docs/coverage-${id}.md`, lines.join("\n"));
  console.log(`docs/coverage-${id}.md`, pack.items.length, "항목", lines.filter((l) => l.includes("⚠")).length, "출처 없음");
}
