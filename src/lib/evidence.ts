// 자동 점검 원본 보존 자료 (1단계, 0022). 판정 표(finding)와 따로 저장하고, 판정·문제 수·비교에 쓰지 않는다.
//  - 화면 증거: axe 통과·해당 없음 결과(규칙 단위)와 점검한 브라우저 환경
//  - 기준 외 참고: 점검 기준의 어느 검사항목에도 연결되지 않은 자동 결과
// 저장 전에 글 속 주소·이메일·토큰을 가린다. 화면에서 읽을 때도 한 번 더 가린다.

import { unmappedReferencesFromState } from "../core/judge";
import type { Pack } from "../core/packs";
import type { BrowserEnvironment, CapturedState, RuleOutcomeEntry, RuleOutcomes } from "../core/types";
import { redactText } from "./security/url";

/** 화면 하나에 저장하는 기준 외 참고 결과 상한 (규칙 1개가 수백 요소에 걸리는 경우 대비) */
export const MAX_REFERENCES_PER_PAGE = 500;

function cleanEntry(e: RuleOutcomeEntry): RuleOutcomeEntry {
  return {
    ruleId: String(e.ruleId).slice(0, 100),
    tags: (e.tags ?? []).slice(0, 30).map((t) => String(t).slice(0, 60)),
    help: redactText(String(e.help ?? "")).slice(0, 300),
    sample: e.sample ? { selector: String(e.sample.selector).slice(0, 500), html: redactText(String(e.sample.html ?? "")).slice(0, 300) } : null,
  };
}

export function cleanRuleOutcomes(o: RuleOutcomes | null | undefined): RuleOutcomes | null {
  if (!o) return null;
  return { engine: "axe", passed: (o.passed ?? []).map(cleanEntry), inapplicable: (o.inapplicable ?? []).map(cleanEntry) };
}

export function cleanEnvironment(e: BrowserEnvironment | null | undefined): BrowserEnvironment | null {
  if (!e) return null;
  return { ...e, userAgent: String(e.userAgent ?? "").slice(0, 300), language: String(e.language ?? "").slice(0, 50) };
}

export interface EvidenceRow {
  pageStateId: string;
  scanId: string;
  engineVersion: string | null;
  environment: BrowserEnvironment | null;
  ruleOutcomes: RuleOutcomes | null;
}

/** 옛 코어(0.2.x)처럼 보낼 것이 없으면 null — 빈 행을 만들지 않는다 */
export function evidenceRow(state: CapturedState, scanId: string, pageStateId: string): EvidenceRow | null {
  const ruleOutcomes = cleanRuleOutcomes(state.snapshot.ruleOutcomes);
  const environment = cleanEnvironment(state.snapshot.environment);
  if (!ruleOutcomes && !environment) return null;
  return { pageStateId, scanId, engineVersion: String(state.snapshot.coreVersion ?? "").slice(0, 120) || null, environment, ruleOutcomes };
}

export interface ReferenceRow {
  scanId: string;
  pageStateId: string;
  packId: string;
  packVersion: string;
  engine: string;
  ruleId: string;
  outcome: "violation" | "incomplete";
  wcag: string[];
  message: string;
  selector: string;
  html: string;
  box: { x: number; y: number; w: number; h: number } | null;
}

export function referenceRows(pack: Pack, state: CapturedState, scanId: string, pageStateId: string): ReferenceRow[] {
  return unmappedReferencesFromState(pack, state)
    .slice(0, MAX_REFERENCES_PER_PAGE)
    .map((r) => ({
      scanId,
      pageStateId,
      packId: pack.id,
      packVersion: pack.version,
      engine: r.engine,
      ruleId: r.ruleId.slice(0, 100),
      outcome: r.outcome,
      wcag: r.wcag.slice(0, 20),
      message: redactText(r.message).slice(0, 1000),
      selector: r.selector.slice(0, 500),
      html: redactText(r.html).slice(0, 1000),
      box: r.box,
    }));
}

/** UA 에서 브라우저 이름·주 버전만 (예: "Chrome 140"). 모르면 null */
export function browserLabel(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  const m = /(Edg|OPR|Firefox|HeadlessChrome|Chrome)\/(\d+)/.exec(ua) ?? /Version\/(\d+)[\d.]* (Safari)/.exec(ua);
  if (!m) return null;
  if (m[2] === "Safari") return `Safari ${m[1]}`;
  const name = { Edg: "Edge", OPR: "Opera", HeadlessChrome: "Chromium (headless)" }[m[1]] ?? m[1];
  return `${name} ${m[2]}`;
}

export function osLabel(userAgent: string | null | undefined): string | null {
  const ua = userAgent ?? "";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** 화면 하나의 점검 환경 한 줄 (예: "Chrome 140 · Windows · 창 1280×900 · 배율 2") */
export function environmentText(e: BrowserEnvironment | null | undefined): string | null {
  if (!e) return null;
  return [browserLabel(e.userAgent), osLabel(e.userAgent), `창 ${e.viewport.w}×${e.viewport.h}`, e.devicePixelRatio && e.devicePixelRatio !== 1 ? `배율 ${e.devicePixelRatio}` : null, e.reducedMotion ? "동작 줄이기 켜짐" : null].filter(Boolean).join(" · ");
}

export interface EnvironmentSummary {
  /** 환경을 기록한 화면 수 (0.3.0 코어부터) */
  pages: number;
  browsers: string[];
  viewports: string[];
}

export function environmentSummary(evidence: { environment: BrowserEnvironment | null }[]): EnvironmentSummary {
  const env = evidence.map((e) => e.environment).filter((e): e is BrowserEnvironment => Boolean(e));
  return {
    pages: env.length,
    browsers: [...new Set(env.map((e) => [browserLabel(e.userAgent), osLabel(e.userAgent)].filter(Boolean).join(" / ")).filter(Boolean))].sort(),
    viewports: [...new Set(env.map((e) => `${e.viewport.w}×${e.viewport.h}`))].sort(),
  };
}
