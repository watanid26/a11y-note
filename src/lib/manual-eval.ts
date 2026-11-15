// 수동 점검 · 보조기술 점검 · 장애인 사용자 평가 기록 (2단계, 0023).
// 원칙
//  - 자동 결과·AI 검수·점검자 항목 판정과 별도 층이다. 이 기록만으로 항목 상태를 바꾸지 않는다 (점검자가 항목 판정을 따로 남긴다)
//  - 쌓기만 한다. 고칠 때는 새 기록을 넣고 supersedes 로 이전 기록을 가리킨다. 서류에는 최신 기록만 세고, 이전 기록은 이력으로 남는다
//  - 참여자는 가명 코드(P01)와 특성만. 이메일·전화번호처럼 보이는 글은 저장 전에 가린다

import { z } from "zod";
import type { ManualEvaluation } from "./db";
import { redactText } from "./security/url";

export const EVAL_KINDS = ["manual", "assistive_tech", "user_testing"] as const;
export const EVAL_RESULTS = ["pass", "fail", "issue", "blocked", "na", "observation"] as const;
export type EvalKind = (typeof EVAL_KINDS)[number];
export type EvalResult = (typeof EVAL_RESULTS)[number];

export const EVAL_KIND_LABEL: Record<"ko" | "ja", Record<EvalKind, string>> = {
  ko: { manual: "수동 점검", assistive_tech: "보조기술 점검", user_testing: "장애인 사용자 평가" },
  ja: { manual: "手動試験", assistive_tech: "支援技術による試験", user_testing: "障害のある利用者による評価" },
};
export const EVAL_RESULT_LABEL: Record<"ko" | "ja", Record<EvalResult, string>> = {
  ko: { pass: "문제 없음", fail: "기준 미충족", issue: "이용 문제", blocked: "과업 수행 불가", na: "해당 없음", observation: "관찰 기록" },
  ja: { pass: "問題なし", fail: "基準を満たさない", issue: "利用上の問題", blocked: "タスク遂行不可", na: "適用なし", observation: "観察記録" },
};
export const SEVERITY_LABEL: Record<"ko" | "ja", Record<"critical" | "major" | "minor", string>> = {
  ko: { critical: "심각 (기능 차단)", major: "중요 (이용 불편)", minor: "경미" },
  ja: { critical: "重大（機能の阻害）", major: "重要（利用上の不便）", minor: "軽微" },
};

const short = (n: number) => z.string().trim().max(n).optional().nullable();
// 이름·연락처 대신 가명 코드만 받는다
const ParticipantCode = z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "가명 코드만 (예: P01)").optional().nullable();

export const EvaluationInput = z
  .object({
    kind: z.enum(EVAL_KINDS),
    result: z.enum(EVAL_RESULTS),
    pageStateId: z.string().uuid().optional().nullable(),
    flowId: z.string().uuid().optional().nullable(),
    findingId: z.string().uuid().optional().nullable(),
    itemCode: z.string().trim().max(10).optional().nullable(),
    method: short(200),
    assistiveTech: short(100),
    assistiveTechVersion: short(50),
    browser: short(100),
    browserVersion: short(50),
    os: short(100),
    device: short(100),
    participantCode: ParticipantCode,
    participantProfile: short(300),
    task: short(500),
    severity: z.enum(["critical", "major", "minor"]).optional().nullable(),
    notes: z.string().max(4000).optional(),
    steps: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
    supersedes: z.string().uuid().optional().nullable(),
    performedAt: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .superRefine((x, ctx) => {
    if (x.kind === "assistive_tech" && !x.assistiveTech) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["assistiveTech"], message: "보조기술 점검은 사용한 보조기술을 적어야 합니다." });
    if (x.kind === "user_testing" && !x.participantCode) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participantCode"], message: "사용자 평가는 참여자 가명 코드가 필요합니다." });
    if (x.kind === "user_testing" && !x.task) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["task"], message: "사용자 평가는 수행한 과업을 적어야 합니다." });
    if (!x.itemCode && !x.task && !x.findingId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["itemCode"], message: "검사항목·과업·발견 사항 중 하나는 있어야 합니다." });
  });
export type EvaluationInputT = z.infer<typeof EvaluationInput>;

const red = (s: string | null | undefined) => (s ? redactText(s) : null);

/** 저장할 행 (가림 처리 포함). evaluator 는 로그인한 사람 */
export function evaluationRow(scanId: string, x: EvaluationInputT, evaluator: string) {
  return {
    scanId,
    pageStateId: x.pageStateId ?? null,
    flowId: x.flowId ?? null,
    findingId: x.findingId ?? null,
    itemCode: x.itemCode || null,
    kind: x.kind,
    method: red(x.method),
    assistiveTech: x.assistiveTech || null,
    assistiveTechVersion: x.assistiveTechVersion || null,
    browser: x.browser || null,
    browserVersion: x.browserVersion || null,
    os: x.os || null,
    device: x.device || null,
    participantCode: x.participantCode || null,
    participantProfile: red(x.participantProfile),
    task: red(x.task),
    result: x.result,
    severity: x.severity ?? null,
    notes: redactText(x.notes ?? ""),
    steps: (x.steps ?? []).map((s) => redactText(s)),
    supersedes: x.supersedes ?? null,
    evaluator,
    performedAt: x.performedAt ? new Date(x.performedAt) : null,
  };
}

/** 다른 기록이 supersedes 로 가리킨 기록은 이전 판이다. 서류에는 최신 판만 센다 */
export function currentEvaluations(rows: ManualEvaluation[]): ManualEvaluation[] {
  const replaced = new Set(rows.map((r) => r.supersedes).filter(Boolean));
  return rows.filter((r) => !replaced.has(r.id));
}

export interface EvaluationSummary {
  /** 최신 판 기준 종류별 기록 수. 기록이 없으면 0 (null 아님 — 표가 없는 DB 는 loadScanView 가 [] 로 준다) */
  manual: number;
  assistiveTech: number;
  userTesting: number;
  /** 이전 판으로 밀려난 기록 수 (이력) */
  superseded: number;
  /** 문제(fail·issue·blocked)로 기록된 수 */
  problems: number;
  assistiveTechs: string[];
  participants: number;
  items: string[];
}

export function evaluationSummary(rows: ManualEvaluation[]): EvaluationSummary {
  const cur = currentEvaluations(rows);
  const by = (k: EvalKind) => cur.filter((r) => r.kind === k).length;
  return {
    manual: by("manual"),
    assistiveTech: by("assistive_tech"),
    userTesting: by("user_testing"),
    superseded: rows.length - cur.length,
    problems: cur.filter((r) => r.result === "fail" || r.result === "issue" || r.result === "blocked").length,
    assistiveTechs: [...new Set(cur.filter((r) => r.assistiveTech).map((r) => [r.assistiveTech, r.assistiveTechVersion].filter(Boolean).join(" ")))].sort(),
    participants: new Set(cur.filter((r) => r.kind === "user_testing" && r.participantCode).map((r) => r.participantCode)).size,
    items: [...new Set(cur.map((r) => r.itemCode).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  };
}

/** 서류에는 점검자 계정을 그대로 적지 않는다 (예: ab***@example.go.kr) */
export function maskAccount(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email.length > 2 ? `${email.slice(0, 2)}***` : "***";
  return `${name.slice(0, 2)}***@${domain}`;
}

/** 화면·서류에 내보낼 때 다시 가린다 (예전 저장분 대비) */
export function redactEvaluation(r: ManualEvaluation): ManualEvaluation {
  return { ...r, method: red(r.method), participantProfile: red(r.participantProfile), task: red(r.task), notes: redactText(r.notes), steps: (r.steps ?? []).map((s) => redactText(s)) };
}
