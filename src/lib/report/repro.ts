// 오류별 재현 절차 (3단계). 녹화된 흐름 단계와 점검 환경(창 크기·브라우저)이 있으면 그것으로, 없으면 기존 공통 절차를 쓴다.
// 녹화 단계의 입력값은 녹화할 때부터 "{{입력값}}"으로 가려져 있고, 주소는 다시 가린다.

import type { BrowserEnvironment } from "../../core/types";
import type { Flow, PageState } from "../db";
import { environmentText } from "../evidence";
import { normalizeUrl } from "../compare";
import { redactText, redactUrl } from "../security/url";

/** 한 오류 위치를 다시 볼 때 필요한 화면 문맥 */
export interface ReproContext {
  page: Pick<PageState, "url" | "flowId" | "flowStep"> | undefined;
  flow: Pick<Flow, "name" | "steps"> | undefined;
  environment: BrowserEnvironment | null | undefined;
}

/** 서류에 적을 최대 녹화 단계 수 (넘으면 "…외 N단계") */
export const MAX_REPRO_STEPS = 10;

interface RecordedStep {
  type?: string;
  selectors?: string[][];
  text?: string;
  value?: string;
  url?: string;
}

function stepText(s: RecordedStep, ja: boolean): string {
  const sel = s.selectors?.[0]?.[0] ?? "";
  const label = s.text ? `"${redactText(String(s.text)).slice(0, 60)}"` : sel;
  if (s.type === "click") return ja ? `${label} をクリック` : `${label} 누르기`;
  if (s.type === "change") return ja ? `${sel} に ${s.value ?? "{{入力値}}"} を入力` : `${sel} 에 ${s.value ?? "{{입력값}}"} 입력`;
  if (s.type === "navigate" && s.url) return ja ? `${redactUrl(s.url)} を開く` : `${redactUrl(s.url)} 열기`;
  return s.type ? String(s.type) : "-";
}

/**
 * 녹화 단계 중 이 화면에 오기 전까지의 단계. 단계마다 그 조작을 한 주소가 남아 있으므로,
 * 처음으로 이 화면 주소에서 한 조작 앞까지를 고른다. 맞는 주소가 없으면 전체 단계를 쓰고 그렇게 적는다.
 */
export function stepsBefore(steps: unknown[] | null | undefined, pageUrl: string): { steps: RecordedStep[]; exact: boolean } {
  const list = (Array.isArray(steps) ? steps : []).filter((x): x is RecordedStep => Boolean(x) && typeof x === "object");
  const target = normalizeUrl(redactUrl(pageUrl));
  const at = list.findIndex((s) => s.url && normalizeUrl(redactUrl(s.url)) === target);
  return at >= 0 ? { steps: list.slice(0, at), exact: true } : { steps: list, exact: false };
}

/** 재현 절차 줄들. 흐름·환경 정보가 없으면 null (호출한 쪽이 기존 공통 절차를 쓴다) */
export function reproLines(ctx: ReproContext, howToCheck: string, ja = false): string[] | null {
  const env = environmentText(ctx.environment);
  const recorded = ctx.page?.flowId && ctx.flow ? stepsBefore(ctx.flow.steps, ctx.page.url) : null;
  if (!env && !recorded?.steps.length) return null;
  const out: string[] = [];
  if (env) out.push(ja ? `検査環境に合わせる: ${env}` : `점검 환경 맞추기: ${env}`);
  if (recorded?.steps.length && ctx.flow) {
    out.push(ja ? `業務フロー「${ctx.flow.name}」を開始ページから記録順に操作する${recorded.exact ? "" : "（このページまでの区間が特定できないため記録全体）"}` : `업무 흐름 "${ctx.flow.name}"을 시작 화면부터 녹화 순서대로 조작한다${recorded.exact ? "" : " (이 화면까지의 구간을 특정할 수 없어 녹화 전체)"}`);
    const shown = recorded.steps.slice(0, MAX_REPRO_STEPS);
    shown.forEach((s, i) => out.push(`  ${i + 1}. ${stepText(s, ja)}`));
    if (recorded.steps.length > shown.length) out.push(ja ? `  …ほか ${recorded.steps.length - shown.length} 手順（記録を参照）` : `  … 외 ${recorded.steps.length - shown.length}단계 (녹화 기록 참고)`);
  } else {
    out.push(ja ? "URLのページを開く" : "전체 URL 의 화면을 연다");
  }
  out.push(ja ? "開発者ツールでセレクタの要素を探す" : "개발자 도구에서 선택자로 요소를 찾는다");
  out.push(howToCheck);
  return out.map((l, i) => (l.startsWith("  ") ? l : `${i + 1 - out.slice(0, i).filter((x) => x.startsWith("  ")).length}) ${l}`));
}
