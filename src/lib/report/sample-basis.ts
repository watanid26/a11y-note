// 보고서 "표본 선정 근거": 어떤 페이지를 왜 골랐는지, 유형별로 무엇을 덮었고 무엇을 못 덮었는지.
// 개수는 기준이 정하지 않는다 (WCAG-EM: 페이지 유형 · 핵심 흐름 · 무작위 일부를 덮었는가). 그래서 덮은 범위를 밝힌다.

import { PAGE_TYPES, RANDOM_REASON, RANDOM_SHARE, pageType, type PageType } from "../sampling";
import type { ScanView } from "../scan-view";

export type SelectMethod = "메인" | "필수 페이지" | "유형별 대표" | "무작위" | "업무 흐름" | "직접 점검";

export interface SampleRow {
  no: number;
  label: string;
  url: string;
  type: PageType;
  method: SelectMethod;
  reason: string;
}

export function selectMethod(reason: string, flow: boolean): SelectMethod {
  if (flow) return "업무 흐름";
  if (reason === RANDOM_REASON) return "무작위";
  if (reason === "홈") return "메인";
  if (/^필수|^주요 업무/.test(reason)) return "필수 페이지";
  if (/^같은 틀|^개별 페이지/.test(reason)) return "유형별 대표";
  return "직접 점검";
}

/** 사람이 읽는 선정 이유 (내부 표기 → 쉬운 말) */
export function plainReason(reason: string): string {
  if (reason === RANDOM_REASON) return "대표 페이지가 같은 모양의 다른 페이지를 잘 대표하는지 보려고 무작위로 골랐어요";
  if (reason === "홈") return "사이트의 첫 페이지예요";
  const m = /^같은 틀 페이지 (\d+)개 중 대표/.exec(reason);
  if (m) return `같은 모양의 페이지 ${m[1]}개 중 대표로 골랐어요`;
  if (reason === "개별 페이지") return "다른 페이지와 모양이 달라서 따로 골랐어요";
  if (/^필수: (.+)$/.test(reason)) return `꼭 봐야 하는 기능(${reason.replace(/^필수: /, "")})이라 넣었어요`;
  if (/^주요 업무/.test(reason)) return "신청·예약 같은 주요 업무 페이지라 넣었어요";
  return reason || "-";
}

export function sampleRows(v: ScanView): SampleRow[] {
  return v.pages.map((p, i) => ({
    no: i + 1,
    label: p.label,
    url: p.url,
    type: pageType(p.url, p.reason ?? ""),
    method: selectMethod(p.reason ?? "", Boolean(p.flowId)),
    reason: plainReason(p.reason ?? ""),
  }));
}

export interface TypeCoverage {
  type: PageType;
  checked: number;
  /** 한도 때문에 이번에 넣지 못한 대표 페이지 수 */
  missed: number;
  note: string;
}

export function typeCoverage(v: ScanView): TypeCoverage[] {
  const rows = sampleRows(v);
  const missed = (v.scan.plan?.sampling?.uncovered ?? []).map((u) => pageType(u.url, u.reason));
  return PAGE_TYPES.map((type) => {
    const checked = rows.filter((r) => r.type === type).length;
    const miss = missed.filter((t) => t === type).length;
    const note = checked && !miss ? "점검했어요" : checked && miss ? `점검했고, 같은 유형의 다른 모양 ${miss}개는 한도 때문에 이번에 못 봤어요` : miss ? `사이트에 있지만 한도 때문에 이번에 못 봤어요 (${miss}개)` : "찾은 페이지 중에는 없었어요";
    return { type, checked, missed: miss, note };
  });
}

export interface SampleSummary {
  found: number;
  templates: number | null;
  checked: number;
  perScan: number | null;
  missed: number;
  random: number;
  randomPool: number;
}

export function sampleSummary(v: ScanView): SampleSummary {
  const sp = v.scan.plan?.sampling;
  const rows = sampleRows(v);
  const random = rows.filter((r) => r.method === "무작위").length;
  return {
    found: v.scan.plan?.found ?? v.pages.length,
    templates: sp?.templates ?? null,
    checked: v.pages.length,
    perScan: sp?.perScan ?? null,
    missed: sp?.uncovered.length ?? 0,
    random,
    randomPool: Math.max(0, (v.scan.plan?.found ?? 0) - (rows.length - random)),
  };
}

export const RANDOM_HOW = `대표 페이지 수의 ${Math.round(RANDOM_SHARE * 100)}%(올림)만큼, 대표로 뽑히지 않은 페이지에서 골라요. 시작 주소와 페이지 주소로 만든 고정 순서로 고르기 때문에, 같은 주소 목록이면 다시 점검해도 같은 페이지가 뽑혀요.`;

export const SAMPLE_LIMIT = "이 결과는 위 표본을 점검한 결과이고, 사이트 전체가 기준을 지킨다는 보증은 아니에요. 표본은 페이지 수가 아니라 페이지 유형과 핵심 흐름을 덮는 것을 기준으로 골랐어요.";
