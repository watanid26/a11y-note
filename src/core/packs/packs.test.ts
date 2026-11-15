// 국가 기준 연결표 불변식 (P0-8): "점검이 하나도 안 돌았는데 문제 미발견(자동)" 이 나오는 길을 막는다.
import { readFileSync } from "node:fs";
import path from "node:path";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { summarizeItems, displayStatus } from "../judge";
import { getPack } from "./index";
import type { Applicability } from "../types";

// 실제로 실행되는 axe 규칙 (core/page/index.ts 의 runOnly 태그와 같아야 함)
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const live = new Map(axe.getRules(TAGS).filter((r) => !r.tags.includes("deprecated")).map((r) => [r.ruleId, r.tags]));
const pageSrc = readFileSync(path.join(__dirname, "..", "page", "checks.ts"), "utf8");
const coreSrc = readFileSync(path.join(__dirname, "..", "page", "index.ts"), "utf8");
const customRules = new Set([...pageSrc.matchAll(/result\("(kr-[a-z-]+)"/g)].map((m) => m[1]));
const keyboardRules = new Set(["kr-keyboard-trap", "kr-focus-indicator", "kr-focus-order"]); // judge.ts 키보드 판정
const candidateKinds = new Set([...pageSrc.matchAll(/kind: "([a-z]+)"/g)].map((m) => `ai-${m[1]}`));

function wcagOf(tags: string[]): string[] {
  return tags.map((t) => /^wcag(\d)(\d)(\d{1,2})$/.exec(t)).filter(Boolean).map((m) => `${m![1]}.${m![2]}.${m![3]}`);
}

describe.each(["kwcag22", "jis2016"] as const)("연결표 %s", (id) => {
  const pack = getPack(id);
  it("엔진이 실제 실행하는 태그 목록이 테스트와 같음", () => {
    for (const t of TAGS) expect(coreSrc).toContain(`"${t}"`);
  });
  it("연결표의 모든 규칙이 실제로 실행되는 규칙 (폐지·오타 없음)", () => {
    const dead = Object.keys(pack.ruleMap).filter((r) => !live.has(r) && !customRules.has(r) && !keyboardRules.has(r) && !candidateKinds.has(r));
    expect(dead).toEqual([]);
  });
  it("연결표의 모든 대상 항목 코드가 실제 항목", () => {
    const codes = new Set(pack.items.map((i) => i.code));
    expect(Object.values(pack.ruleMap).filter((c) => !codes.has(c))).toEqual([]);
  });
  it("자동·의미 판단 항목은 실행되는 규칙이 최소 1개 (아니면 사람 확인 표시 필요)", () => {
    const covered = new Set<string>(Object.values(pack.ruleMap));
    for (const [, tags] of live) {
      const w = wcagOf(tags);
      for (const it of pack.items) if (it.wcag.some((x) => w.includes(x))) covered.add(it.code);
    }
    const orphans = pack.items.filter((i) => i.method !== "manual" && !i.needsHuman && !covered.has(i.code)).map((i) => `${i.code} ${i.title}`);
    expect(orphans).toEqual([]);
  });
  it("사람 확인·수동 항목은 발견 사항이 없어도 자동으로 '문제 미발견'이 되지 않음", () => {
    const applicable = Object.fromEntries(["images", "media", "tables", "forms", "inputs", "links", "newWindowLinks", "carousels", "captchas", "iframes", "accessKeys"].map((k) => [k, 1])) as unknown as Applicability;
    (applicable as unknown as Record<string, unknown>).timeLimitHint = true;
    const items = summarizeItems(pack, [], [applicable]);
    const bad = items.filter((i) => {
      const def = pack.items.find((x) => x.code === i.code)!;
      return (def.method === "manual" || def.needsHuman) && displayStatus(i) !== "review";
    });
    expect(bad.map((i) => i.code)).toEqual([]);
  });
});
