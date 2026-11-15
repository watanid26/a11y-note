// 브라우저에 주입되는 점검 번들의 입구. window.__a11yCore 로 노출된다.
// 서버 워커(Playwright)와 크롬 확장이 같은 파일을 쓴다 → 어디서 점검해도 결과가 같다.

import axe from "axe-core";
import axeKo from "axe-core/locales/ko.json";
import axeJa from "axe-core/locales/ja.json";
import type { BrowserEnvironment, FocusStop, PageSnapshot, RawResult, RuleOutcomeEntry, RuleOutcomes } from "../types";
import { applicability, collectCandidates, customChecks, outline, templateSignature } from "./checks";
import { boxOf, focusableElements, selectorOf, textOf } from "./dom";

import { CORE_VERSION } from "../version";
export { CORE_VERSION };
/** 보고서에 남기는 엔진 버전: 자체 엔진 + axe-core (P0-10) */
export const ENGINE_VERSION = `a11ynote-core ${CORE_VERSION} / axe-core ${axe.version}`;

function wcagFromTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(t);
    if (m) out.push(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return out;
}

// axe 의 번역 기능(axe.configure locale)은 내부에서 eval 을 써서 크롬 확장에서 막힌다.
// 그래서 axe 는 영어로 돌리고, 결과 문구만 번역 파일에서 직접 찾아 바꾼다.
type LocaleMsg = string | Record<string, string>;
type LocaleData = { rules?: Record<string, { help?: string }>; checks?: Record<string, { fail?: LocaleMsg; incomplete?: LocaleMsg }> };
let LOCALE: LocaleData | null = null;
// axe 번역 파일에 아직 없는 최신 규칙 문구
const EXTRA: Record<"ko" | "ja", LocaleData> = {
  ko: {
    rules: { "target-size": { help: "누를 수 있는 대상은 24×24px 이상이거나 주변에 충분한 여백이 있어야 합니다." } },
    checks: {
      "target-size": { fail: "누를 수 있는 영역이 너무 작습니다 ({{=it.data.width}}×{{=it.data.height}}px)." },
      "target-offset": { fail: "주변의 다른 누를 수 있는 요소와 너무 가깝습니다." },
    },
  },
  ja: {
    rules: { "target-size": { help: "ターゲットは24×24px以上、または十分な間隔が必要です。" } },
    checks: { "target-size": { fail: "ターゲットが小さすぎます（{{=it.data.width}}×{{=it.data.height}}px）。" }, "target-offset": { fail: "隣接するターゲットとの間隔が不十分です。" } },
  },
};
function setLocale(locale: string) {
  const base = locale === "ja" ? (axeJa as LocaleData) : locale === "ko" ? (axeKo as LocaleData) : null;
  const extra = locale === "ja" || locale === "ko" ? EXTRA[locale] : null;
  LOCALE = base && extra ? { rules: { ...base.rules, ...extra.rules }, checks: { ...base.checks, ...extra.checks } } : base;
}

function fillTemplate(tpl: string, data: unknown): string {
  const get = (k: string) => {
    const v = data && typeof data === "object" ? (data as Record<string, unknown>)[k] : "";
    return v == null ? "" : String(v);
  };
  // 새 형식: ${data.key} / ${data}
  tpl = tpl.replace(/\$\{\s*data\.(\w+)\s*\}/g, (_, k) => get(k)).replace(/\$\{\s*data\s*\}/g, data == null || typeof data === "object" ? "" : String(data));
  let out = tpl.replace(/\{\{=\s*it\.data\s*\}\}/g, data == null || typeof data === "object" ? "" : String(data));
  out = out.replace(/\{\{=\s*it\.data\.(\w+)\s*\}\}/g, (_, k) => {
    const v = data && typeof data === "object" ? (data as Record<string, unknown>)[k] : "";
    return v == null ? "" : String(v);
  });
  // 조건문·반복문 같은 나머지 템플릿 기호는 지운다
  return out.replace(/\{\{[^}]*\}\}/g, "").replace(/\s+/g, " ").trim();
}

type CheckRes = { id: string; data?: unknown; message?: string };
function localizedNodeMessage(node: { any?: CheckRes[]; all?: CheckRes[]; none?: CheckRes[]; failureSummary?: string }, outcome: "violation" | "incomplete"): string {
  if (!LOCALE?.checks) return (node.failureSummary ?? "").replace(/^Fix (any|all) of the following:\s*/i, "").replace(/\s*\n\s*/g, " / ");
  const parts: string[] = [];
  for (const c of [...(node.any ?? []), ...(node.all ?? []), ...(node.none ?? [])]) {
    const entry = LOCALE.checks[c.id];
    const fail = outcome === "incomplete" ? entry?.incomplete ?? entry?.fail : entry?.fail;
    let tpl: string | undefined;
    if (typeof fail === "string") tpl = fail;
    else if (fail && typeof fail === "object") {
      const key = c.data && typeof c.data === "object" ? (c.data as Record<string, unknown>).messageKey : undefined;
      tpl = (typeof key === "string" && fail[key]) || fail.default || Object.values(fail)[0];
    }
    const text = tpl ? fillTemplate(tpl, c.data) : c.message ?? "";
    if (text && !parts.includes(text)) parts.push(text);
  }
  return parts.slice(0, 4).join(" / ");
}

async function runAxe(maxNodes: number): Promise<{ results: RawResult[]; outcomes: RuleOutcomes }> {
  const res = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    resultTypes: ["violations", "incomplete"],
    // 스크린샷과 겹치지 않도록 화면을 건드리는 옵션은 끈다
    elementRef: true,
  } as axe.RunOptions);
  const map = (outcome: RawResult["outcome"]) => (r: axe.Result): RawResult => ({
    engine: "axe",
    ruleId: r.id,
    outcome,
    impact: (r.impact ?? null) as RawResult["impact"],
    wcag: wcagFromTags(r.tags),
    help: LOCALE?.rules?.[r.id]?.help ?? r.help,
    nodes: r.nodes.slice(0, maxNodes).map((n) => {
      const el = (n as unknown as { element?: Element }).element;
      return {
        selector: el ? selectorOf(el) : String(n.target?.[0] ?? ""),
        html: (n.html ?? "").replace(/\svalue="[^"]*"/g, "").slice(0, 300),
        box: el ? boxOf(el) : null,
        message: localizedNodeMessage(n as unknown as Parameters<typeof localizedNodeMessage>[0], outcome).slice(0, 400),
      };
    }),
  });
  // 통과·해당 없음은 버리지 않고 규칙 단위로 남긴다 (판정에는 쓰지 않음, axe 결과 모델 보존)
  const keep = (r: axe.Result): RuleOutcomeEntry => {
    const n = r.nodes[0];
    const el = n ? (n as unknown as { element?: Element }).element : undefined;
    return {
      ruleId: r.id,
      tags: r.tags.slice(0, 30),
      help: (LOCALE?.rules?.[r.id]?.help ?? r.help).slice(0, 300),
      sample: n ? { selector: el ? selectorOf(el) : String(n.target?.[0] ?? ""), html: (n.html ?? "").replace(/\svalue="[^"]*"/g, "").slice(0, 300) } : null,
    };
  };
  return {
    results: [...res.violations.map(map("violation")), ...res.incomplete.map(map("incomplete"))],
    outcomes: { engine: "axe", passed: (res.passes ?? []).map(keep), inapplicable: (res.inapplicable ?? []).map(keep) },
  };
}

function environment(): BrowserEnvironment {
  const mq = (q: string) => (typeof matchMedia === "function" ? matchMedia(q).matches : false);
  return {
    userAgent: navigator.userAgent.slice(0, 300),
    language: (navigator.language ?? "").slice(0, 20),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screen: { w: window.screen?.width ?? 0, h: window.screen?.height ?? 0 },
    devicePixelRatio: window.devicePixelRatio || 1,
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    colorScheme: mq("(prefers-color-scheme: dark)") ? "dark" : mq("(prefers-color-scheme: light)") ? "light" : "no-preference",
  };
}

export async function run(opts: { maxNodes?: number; locale?: "ko" | "ja" } = {}): Promise<PageSnapshot> {
  const maxNodes = opts.maxNodes ?? 30;
  setLocale(opts.locale ?? "ko");
  const axeRun = await runAxe(maxNodes);
  const custom = customChecks();
  const results = [...axeRun.results, ...custom];
  return {
    coreVersion: ENGINE_VERSION,
    url: location.href,
    title: document.title,
    lang: document.documentElement.getAttribute("lang") ?? "",
    viewport: { w: window.innerWidth, h: window.innerHeight, scrollH: document.documentElement.scrollHeight },
    results,
    candidates: collectCandidates(results),
    applicable: applicability(),
    outline: outline(),
    templateSignature: templateSignature(),
    ruleOutcomes: axeRun.outcomes,
    environment: environment(),
  };
}

// ── 키보드(Tab) 점검 도우미 ─────────────────────────────────────────────
// 실제 Tab 키 입력은 바깥(서버 워커의 Playwright, 확장의 크롬 디버거)이 보내고,
// 여기서는 "초점을 받기 전 모양"을 기억해 두었다가 초점이 왔을 때 모양이 바뀌었는지 비교한다.

const baseline = new WeakMap<Element, string>();

function focusStyle(el: Element): string {
  const s = getComputedStyle(el);
  return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderTopColor, s.borderBottomColor, s.borderBottomWidth, s.backgroundColor, s.color, s.textDecorationLine].join("|");
}

export function prepareFocus(): number {
  const els = focusableElements();
  els.forEach((el) => baseline.set(el, focusStyle(el)));
  (document.activeElement as HTMLElement | null)?.blur?.();
  window.scrollTo(0, 0);
  return els.length;
}

function deepActive(): Element | null {
  let a: Element | null = document.activeElement;
  while (a && (a as HTMLElement).shadowRoot?.activeElement) a = (a as HTMLElement).shadowRoot!.activeElement;
  return a;
}

export function focusInfo(index: number): FocusStop | null {
  const el = deepActive();
  if (!el || el === document.body || el === document.documentElement) return null;
  const before = baseline.get(el);
  const now = focusStyle(el);
  // 기준을 모르면(동적으로 생긴 요소) 바깥 테두리 유무로만 판단
  const indicator = before ? before !== now : getComputedStyle(el).outlineStyle !== "none";
  return {
    index,
    selector: selectorOf(el),
    tag: el.tagName.toLowerCase(),
    text: textOf(el, 60) || el.getAttribute("aria-label") || el.getAttribute("title") || "",
    box: boxOf(el),
    indicator,
  };
}

// ── 캡처할 때 입력칸 글자 가리기 ───────────────────────────────────────
const MASK_ID = "__a11y_mask_style";
export function maskInputs(on: boolean): void {
  const existing = document.getElementById(MASK_ID);
  if (!on) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement("style");
  style.id = MASK_ID;
  style.textContent =
    "input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, select, [contenteditable=true] { color: transparent !important; text-shadow: 0 0 9px rgba(0,0,0,.55) !important; }";
  document.head.appendChild(style);
}

const api = { version: CORE_VERSION, run, prepareFocus, focusInfo, maskInputs };
(window as unknown as { __a11yCore: typeof api }).__a11yCore = api;
export default api;
