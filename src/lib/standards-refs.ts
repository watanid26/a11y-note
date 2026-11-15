// 규칙 → WCAG 성공기준·W3C ACT 규칙 참조. axe-core 가 규칙에 붙여 둔 메타데이터(tags·actIds)만 옮긴다.
// 원칙
//  - KWCAG 항목 연결(packs/*.ts 의 ruleMap)과 섞지 않는다. 이 값은 "참고 대응"이며 KWCAG 판정을 바꾸지 않는다.
//  - axe 가 연결하지 않은 규칙·자체 규칙(kr-*, ai-*)에는 대응을 만들어 넣지 않는다 (빈 목록 = 대응 기록 없음).
import axe from "axe-core";

export interface RuleReference {
  ruleId: string;
  /** "axe-core 4.14.0" 처럼 대응을 가져온 출처와 버전. 자체 규칙이면 null */
  source: string | null;
  /** WCAG 성공기준 번호 (axe 태그 wcag111 → 1.1.1) */
  wcag: string[];
  /** W3C ACT 규칙 id (axe 메타데이터 actIds) */
  act: string[];
  /** WCAG 성공기준이 없는 모범 사례 규칙 (WCAG 부적합 근거가 아님) */
  bestPractice: boolean;
}

let cache: Map<string, RuleReference> | null = null;

function scFromTag(tag: string): string | null {
  // wcag111 → 1.1.1, wcag1410 → 1.4.10, wcag2a/wcag21aa 같은 수준 태그는 제외
  const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function load(): Map<string, RuleReference> {
  if (cache) return cache;
  const src = `axe-core ${axe.version}`;
  cache = new Map(
    axe.getRules().map((r) => {
      const meta = r as { ruleId: string; tags: string[]; actIds?: string[] };
      const wcag = [...new Set(meta.tags.map(scFromTag).filter((x): x is string => Boolean(x)))];
      return [meta.ruleId, { ruleId: meta.ruleId, source: src, wcag, act: [...(meta.actIds ?? [])], bestPractice: meta.tags.includes("best-practice") && !wcag.length }];
    }),
  );
  return cache;
}

export function ruleReference(ruleId: string): RuleReference {
  return load().get(ruleId) ?? { ruleId, source: null, wcag: [], act: [], bestPractice: false };
}

export const ACT_RULES_URL = "https://www.w3.org/WAI/standards-guidelines/act/rules/";
