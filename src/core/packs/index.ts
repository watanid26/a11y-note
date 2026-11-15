import type { RawResult } from "../types";
import { JIS2016_ITEMS, JIS2016_RULE_MAP } from "./jis2016";
import { KWCAG22_ITEMS, KWCAG22_RULE_MAP } from "./kwcag22";
import type { Pack, PackItem } from "./types";

export type { Pack, PackItem, Method } from "./types";

export const PACKS: Record<Pack["id"], Pack> = {
  kwcag22: { id: "kwcag22", name: "KWCAG 2.2 (한국)", country: "KR", locale: "ko", version: "KWCAG 2.2 (2022) · 점검노트 연결표 r2", items: KWCAG22_ITEMS, ruleMap: KWCAG22_RULE_MAP },
  jis2016: { id: "jis2016", name: "JIS X 8341-3:2016 AA (일본)", country: "JP", locale: "ja", version: "JIS X 8341-3:2016 · 点検ノート対応表 r2", items: JIS2016_ITEMS, ruleMap: JIS2016_RULE_MAP },
};

export function getPack(id: string): Pack {
  return PACKS[id as Pack["id"]] ?? PACKS.kwcag22;
}

/** 규칙 결과 하나가 이 팩의 어느 항목에 해당하는지. 연결할 항목이 없으면 null (보고서에서 제외). */
export function itemForResult(pack: Pack, r: Pick<RawResult, "ruleId" | "wcag">): string | null {
  const direct = pack.ruleMap[r.ruleId];
  if (direct) return direct;
  if (r.ruleId.startsWith("kr-")) return null; // 자체 규칙은 연결표에 있을 때만
  for (const sc of r.wcag) {
    const item = pack.items.find((it) => it.wcag.includes(sc));
    if (item) return item.code;
  }
  return null;
}

export function itemByCode(pack: Pack, code: string): PackItem | undefined {
  return pack.items.find((i) => i.code === code);
}

/** 화면에 보이는 기준 이름: 일본어 화면에서는 "(한국)·(일본)" 표기를 일본어로 */
export function packLabel(name: string, ja: boolean): string {
  if (!ja) return name.replace(/\s*\(한국\)\s*$/, "");
  return name.replace(/\s*\(일본\)\s*$/, "").replace(/\s*\(한국\)\s*$/, "（韓国）");
}
