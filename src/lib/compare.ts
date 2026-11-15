// 재점검 비교 (P1-1): 이전 회차(base)와 새 회차(next)의 화면·발견 사항·항목 상태를 맞춰 본다.
// 원칙
//  - 읽기만 한다. 이전 회차의 사람 판정을 새 회차로 복사하지 않는다 (참고용 이력으로만 보여 준다).
//  - 새 회차에서 다시 보지 못한 화면(점검 실패·범위 밖)의 문제는 "해결"이 아니라 "비교 불가"다.
//  - 같은 키를 가진 화면이 한 회차에 둘 이상이면 어느 것끼리 맞는지 알 수 없으므로 "비교 불가".
//  - 기준·엔진·의미 판단 설정이 다르면 차이가 코드 변화 때문일 수 있다고 알린다.

import { displayStatus, effectiveResult, type DisplayStatus, type FindingMethod, type FindingResult, type ItemSummary } from "../core/judge";
import type { Finding, PageState, Scan } from "./db";

const effective = (f: Pick<Finding, "humanResult" | "result" | "method">) => effectiveResult({ method: f.method as FindingMethod, result: f.result as FindingResult, humanResult: f.humanResult });

export type FindingChange = "new" | "resolved" | "persisting" | "changed" | "incomparable";
export type PageChange = "matched" | "added" | "missing" | "skipped" | "ambiguous";

export interface CompareSide {
  scan: Pick<Scan, "id" | "label" | "createdAt" | "packVersion" | "engineVersion" | "aiConfig" | "skipped" | "source">;
  pages: Pick<PageState, "id" | "url" | "label" | "flowId" | "flowStep">[];
  findings: Pick<Finding, "id" | "pageStateId" | "itemCode" | "ruleId" | "selector" | "message" | "method" | "result" | "humanResult" | "reviewNote">[];
  items: Pick<ItemSummary, "code" | "status" | "decidedBy">[];
}

export interface FindingDiff {
  change: FindingChange;
  pageKey: string;
  itemCode: string;
  ruleId: string;
  selector: string;
  message: string;
  /** 이전·새 회차의 실제 판정 (사람 판정 우선) */
  before: string | null;
  after: string | null;
  /** 이전 회차에서 사람이 정한 판정 — 참고용. 새 회차에는 적용하지 않는다 */
  previousHuman: { result: string; note: string | null } | null;
  baseFindingId: string | null;
  nextFindingId: string | null;
  reason?: string;
}

export interface PageDiff {
  key: string;
  change: PageChange;
  label: string;
  url: string;
  reason?: string;
}

export interface ItemDiff {
  code: string;
  before: DisplayStatus | null;
  after: DisplayStatus | null;
  direction: "better" | "worse" | "same" | "changed";
}

export interface CompareResult {
  baseId: string;
  nextId: string;
  warnings: string[];
  pages: PageDiff[];
  findings: FindingDiff[];
  items: ItemDiff[];
  counts: Record<FindingChange, number>;
}

/** 화면 비교용 주소: 쿼리·조각 제거, 호스트 소문자, 끝 / 정리 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${p}`;
  } catch {
    return raw.split(/[?#]/)[0].replace(/\/+$/, "");
  }
}

/** 화면 키: 같은 주소라도 흐름 단계가 다르면 다른 화면 */
export function pageKey(p: Pick<PageState, "url" | "flowId" | "flowStep">): string {
  const base = normalizeUrl(p.url);
  return p.flowId ? `${base}#flow:${p.flowId}:${p.flowStep ?? 0}` : base;
}

const fingerprint = (f: Pick<Finding, "itemCode" | "ruleId" | "selector">) => `${f.itemCode}|${f.ruleId}|${f.selector.trim()}`;
const isProblem = (r: string) => r !== "pass";

const GOOD = new Set<DisplayStatus>(["pass", "clear_auto"]);
const BAD = new Set<DisplayStatus>(["fail", "fail_auto"]);

function indexPages(pages: CompareSide["pages"]) {
  const byKey = new Map<string, CompareSide["pages"]>();
  for (const p of pages) {
    const k = pageKey(p);
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  return byKey;
}

export function versionWarnings(base: CompareSide["scan"], next: CompareSide["scan"]): string[] {
  const w: string[] = [];
  const fields: [keyof CompareSide["scan"], string][] = [
    ["packVersion", "점검 기준(연결표)"],
    ["engineVersion", "점검 엔진"],
    ["aiConfig", "의미 판단 설정"],
  ];
  for (const [k, name] of fields) {
    const a = (base[k] as string | null) ?? null;
    const b = (next[k] as string | null) ?? null;
    if (!a || !b || a === "unknown" || b === "unknown") w.push(`${name} 버전을 한쪽 이상 알 수 없습니다. 차이가 사이트 변경이 아니라 점검 방식 변화 때문일 수 있습니다.`);
    else if (a !== b) w.push(`${name}이 다릅니다 (이전: ${a} → 새: ${b}). 일부 차이는 사이트 변경이 아니라 점검 방식 변화 때문일 수 있습니다.`);
  }
  if (base.source !== next.source) w.push(`점검 방식이 다릅니다 (이전: ${base.source}, 새: ${next.source}). 서버 점검과 확장 녹화는 범위가 달라 직접 비교가 어렵습니다.`);
  return w;
}

export function compareScans(base: CompareSide, next: CompareSide): CompareResult {
  const warnings = versionWarnings(base.scan, next.scan);
  const bPages = indexPages(base.pages);
  const nPages = indexPages(next.pages);
  const skipped = new Map((next.scan.skipped ?? []).map((s) => [normalizeUrl(s.url), s.reason]));

  // 1) 화면 맞추기
  const pages: PageDiff[] = [];
  const pageStatus = new Map<string, PageDiff>();
  for (const k of new Set([...bPages.keys(), ...nPages.keys()])) {
    const b = bPages.get(k) ?? [];
    const n = nPages.get(k) ?? [];
    const ref = n[0] ?? b[0];
    let d: PageDiff;
    if (b.length > 1 || n.length > 1) d = { key: k, change: "ambiguous", label: ref.label, url: normalizeUrl(ref.url), reason: "같은 주소·단계의 화면이 한 회차에 여러 개라 짝을 정할 수 없음" };
    else if (b.length && n.length) d = { key: k, change: "matched", label: ref.label, url: normalizeUrl(ref.url) };
    else if (n.length) d = { key: k, change: "added", label: ref.label, url: normalizeUrl(ref.url) };
    else if (skipped.has(normalizeUrl(ref.url))) d = { key: k, change: "skipped", label: ref.label, url: normalizeUrl(ref.url), reason: `새 회차에서 점검하지 못함: ${skipped.get(normalizeUrl(ref.url))}` };
    else d = { key: k, change: "missing", label: ref.label, url: normalizeUrl(ref.url), reason: "새 회차에 없는 화면 (주소가 바뀌었거나 범위에서 빠짐)" };
    pages.push(d);
    pageStatus.set(k, d);
  }

  // 2) 발견 사항 맞추기 (화면별, 같은 지문은 개수만큼 짝지음)
  const keyOf = (side: CompareSide) => new Map(side.pages.map((p) => [p.id, pageKey(p)]));
  const bKey = keyOf(base);
  const nKey = keyOf(next);
  const group = (side: CompareSide, km: Map<string, string>) => {
    const m = new Map<string, CompareSide["findings"]>();
    for (const f of side.findings) {
      const k = `${km.get(f.pageStateId) ?? "?"}§${fingerprint(f)}`;
      m.set(k, [...(m.get(k) ?? []), f]);
    }
    return m;
  };
  const bf = group(base, bKey);
  const nf = group(next, nKey);
  const findings: FindingDiff[] = [];
  const row = (change: FindingChange, pk: string, b: CompareSide["findings"][number] | null, n: CompareSide["findings"][number] | null, reason?: string): FindingDiff => {
    const f = (n ?? b)!;
    return {
      change,
      pageKey: pk,
      itemCode: f.itemCode,
      ruleId: f.ruleId,
      selector: f.selector,
      message: f.message,
      before: b ? effective(b) : null,
      after: n ? effective(n) : null,
      previousHuman: b?.humanResult ? { result: b.humanResult, note: b.reviewNote ?? null } : null,
      baseFindingId: b?.id ?? null,
      nextFindingId: n?.id ?? null,
      reason,
    };
  };
  for (const k of new Set([...bf.keys(), ...nf.keys()])) {
    const pk = k.split("§")[0];
    const ps = pageStatus.get(pk);
    const bl = bf.get(k) ?? [];
    const nl = nf.get(k) ?? [];
    if (!ps || ps.change === "ambiguous" || ps.change === "skipped" || ps.change === "missing") {
      for (const b of bl) if (isProblem(effective(b))) findings.push(row("incomparable", pk, b, null, ps?.reason ?? "화면을 맞출 수 없음"));
      for (const n of nl) findings.push(row(ps?.change === "ambiguous" ? "incomparable" : "new", pk, null, n, ps?.reason));
      continue;
    }
    const pairs = Math.min(bl.length, nl.length);
    for (let i = 0; i < pairs; i++) {
      const b = bl[i];
      const n = nl[i];
      const before = effective(b);
      const after = effective(n);
      if (!isProblem(before) && !isProblem(after)) continue;
      findings.push(row(before === after ? "persisting" : "changed", pk, b, n));
    }
    for (const b of bl.slice(pairs)) if (isProblem(effective(b))) findings.push(row("resolved", pk, b, null));
    for (const n of nl.slice(pairs)) if (isProblem(effective(n))) findings.push(row("new", pk, null, n));
  }

  // 3) 항목 상태
  const bItems = new Map(base.items.map((i) => [i.code, displayStatus(i)]));
  const nItems = new Map(next.items.map((i) => [i.code, displayStatus(i)]));
  const items: ItemDiff[] = [];
  for (const code of new Set([...bItems.keys(), ...nItems.keys()])) {
    const before = bItems.get(code) ?? null;
    const after = nItems.get(code) ?? null;
    let direction: ItemDiff["direction"] = "changed";
    if (before === after) direction = "same";
    else if (before && after && BAD.has(before) && GOOD.has(after)) direction = "better";
    else if (before && after && GOOD.has(before) && BAD.has(after)) direction = "worse";
    items.push({ code, before, after, direction });
  }
  items.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const counts = { new: 0, resolved: 0, persisting: 0, changed: 0, incomparable: 0 } as Record<FindingChange, number>;
  for (const f of findings) counts[f.change]++;
  const order: Record<FindingChange, number> = { new: 0, changed: 1, persisting: 2, incomparable: 3, resolved: 4 };
  findings.sort((a, b) => order[a.change] - order[b.change] || a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
  pages.sort((a, b) => a.url.localeCompare(b.url));
  return { baseId: base.scan.id, nextId: next.scan.id, warnings, pages, findings, items, counts };
}
