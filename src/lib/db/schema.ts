// DB 구조. LawChange·점검노트와 같은 Supabase 를 쓰더라도 섞이지 않게 별도 스키마 "a11y" 를 쓴다.

import { relations } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgSchema, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Applicability, Box, BrowserEnvironment, Candidate, KeyboardTrace, NavigationTrace, PageOutline, RuleOutcomes, ScreenKind } from "../../core/types";

export const a11y = pgSchema("a11y");

export const project = a11y.table("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerEmail: text("owner_email").notNull(),
  /** 보고서에 표시할 대상 기관명 (점검 수행 기관과 분리) */
  clientName: text("client_name"),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  /** production | staging | development */
  targetEnvironment: text("target_environment").notNull().default("production"),
  /** 국가 팩: kwcag22 | jis2016 */
  pack: text("pack").notNull().default("kwcag22"),
  /** 대표 페이지 최대 수 (일본 공공 사양 관행: 40) */
  maxPages: integer("max_pages").notNull().default(40),
  /** (사용 안 함) 예전 버전의 원문 키 자리. 0004 마이그레이션에서 비움 */
  uploadToken: text("upload_token"),
  /** 크롬 확장 연결 키의 SHA-256 해시 (원문은 저장하지 않음, P0-4) */
  uploadTokenHash: text("upload_token_hash"),
  /** 화면 표시용 키 끝 4자리 */
  uploadTokenLast4: text("upload_token_last4"),
  uploadTokenExpiresAt: timestamp("upload_token_expires_at", { withTimezone: true }),
  /** 의미 판단에 외부 AI 사용 여부 (기본 끔, P0-9: 점검 대상 자료의 외부 전송 최소화) */
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  /** 보고서 표지에 쓰는 점검 기관(조사자) 이름 */
  auditorName: text("auditor_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("project_upload_token_uq").on(t.uploadToken), uniqueIndex("project_upload_token_hash_uq").on(t.uploadTokenHash), index("project_owner_idx").on(t.ownerEmail)]);

export type ScanProgress = { phase: string; done: number; total: number; message?: string };
export type ScanPlan = {
  found: number;
  pages: { url: string; reason: string; templateKey: string | null; groupSize: number }[];
  next: number;
  checked: string[];
  skipped: { url: string; reason: string }[];
  attempts?: Record<string, number>;
  /** 표본 선정 근거: 찾은 틀 수, 한도 때문에 이번에 넣지 못한 유형별 대표 (없으면 옛 회차) */
  sampling?: { templates: number; perScan: number; uncovered: { url: string; reason: string; templateKey: string; groupSize: number }[] };
};
export type ScopeMode = "public_pages" | "public_and_flows";

export const scan = a11y.table("scan", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  /** server = 서버 워커가 공개 페이지 수집 / extension = 크롬 확장 업로드 / file = 파일 업로드 */
  source: text("source").notNull(),
  /** queued → running → done | failed  (확장 업로드는 바로 done) */
  status: text("status").notNull().default("queued"),
  progress: jsonb("progress").$type<ScanProgress>(),
  error: text("error"),
  label: text("label"),
  /** 이 회차에 적용한 기준·연결표 버전, 점검 엔진 버전 (P0-10) */
  packVersion: text("pack_version"),
  engineVersion: text("engine_version"),
  /** 의미 판단 설정: "AI 꺼짐" 또는 모델·프롬프트 버전·기준값 (P0-10) */
  aiConfig: text("ai_config"),
  /** 점검하지 못한 화면 (불러오기 실패·시간 초과·한도 초과) — 주소(쿼리 제외)와 사유 */
  skipped: jsonb("skipped").$type<{ url: string; reason: string }[]>(),
  /** 서버리스 점검 진행 상태 (주소 수집 결과·다음 화면 번호·점검 마친 화면) — 단계별로 이어서 실행 */
  plan: jsonb("plan").$type<ScanPlan>(),
  /** 점검자가 제출 전 점검 범위를 확인했는지 (기본 pending) */
  scopeStatus: text("scope_status").notNull().default("pending"),
  /** 이번 회차가 공개 화면만인지, 크롬 확장으로 기록한 업무 흐름까지인지 */
  scopeMode: text("scope_mode").$type<ScopeMode | null>(),
  scopeReviewedBy: text("scope_reviewed_by"),
  scopeReviewedAt: timestamp("scope_reviewed_at", { withTimezone: true }),
  /** 지금 이 회차를 처리 중인 실행의 점유 기한 (겹쳐 실행 방지) */
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("scan_project_idx").on(t.projectId), index("scan_status_idx").on(t.status)]);

export const pageState = a11y.table("page_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  /** 브라우저에 처음 요청한 주소. url은 하위 호환을 위해 최종 도착 주소로 유지한다. */
  requestedUrl: text("requested_url"),
  navigation: jsonb("navigation").$type<NavigationTrace>(),
  screenKind: text("screen_kind").$type<ScreenKind>(),
  screenReason: text("screen_reason"),
  title: text("title").notNull().default(""),
  /** 화면 이름 (예: "홈", "민원신청 2단계") */
  label: text("label").notNull().default(""),
  flowId: uuid("flow_id"),
  flowStep: integer("flow_step"),
  /** 같은 틀로 찍어낸 페이지 묶음 키 */
  templateKey: text("template_key"),
  /** 이 페이지가 대표 페이지로 뽑힌 이유 */
  reason: text("reason"),
  screenshotKey: text("screenshot_key"),
  screenshotScale: real("screenshot_scale").notNull().default(1),
  /** 캡처가 화면 일부(확장의 보이는 영역)일 때 그 시작 위치 */
  screenshotOrigin: jsonb("screenshot_origin").$type<{ x: number; y: number }>(),
  /** 보관기간 만료·사용자 삭제로 캡처 파일을 지운 시각 (P0-9) */
  screenshotDeletedAt: timestamp("screenshot_deleted_at", { withTimezone: true }),
  applicable: jsonb("applicable").$type<Applicability>().notNull(),
  outline: jsonb("outline").$type<PageOutline>(),
  keyboard: jsonb("keyboard").$type<KeyboardTrace>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("page_state_scan_idx").on(t.scanId)]);

export const finding = a11y.table("finding", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  pageStateId: uuid("page_state_id").notNull().references(() => pageState.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull(),
  /** auto = 규칙 확정 / ai = AI 판정 / manual = 사람 */
  method: text("method").notNull(),
  /** fail | review | pending(AI 대기) | pass */
  result: text("result").notNull(),
  ruleId: text("rule_id").notNull(),
  message: text("message").notNull(),
  selector: text("selector").notNull().default(""),
  html: text("html").notNull().default(""),
  box: jsonb("box").$type<Box | null>(),
  candidate: jsonb("candidate").$type<Candidate | null>(),
  confidence: real("confidence"),
  aiReason: text("ai_reason"),
  aiSuggestion: text("ai_suggestion"),
  /** 사람이 검토해서 정한 결과 */
  humanResult: text("human_result").$type<"fail" | "pass">(),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("finding_scan_idx").on(t.scanId), index("finding_pending_idx").on(t.result)]);

/**
 * 자동 점검 결과(finding)에 대한 2차 검수 이력 (Phase 1). 원본 finding 은 바꾸지 않고 한 줄씩 쌓기만 한다.
 * result: supported(자동 결과를 뒷받침) | contradicted(반박) | uncertain | insufficient_evidence
 * AI 가 반박해도 자동 결과·사람 판정은 그대로이며, 화면·서류에서 사람 확인으로 안내한다.
 */
export const findingVerification = a11y.table("finding_verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  /** finding = 자동 점검 결과(fail·review) 검수 / auto_pass_sample = "문제 미발견" 표본 검수 (0021) */
  target: text("target").$type<"finding" | "auto_pass_sample">().notNull().default("finding"),
  /** target=finding 일 때만 있음 */
  findingId: uuid("finding_id").references(() => finding.id, { onDelete: "cascade" }),
  /** target=auto_pass_sample 일 때 대상 화면·항목 (pass 는 finding 행이 없다) */
  pageStateId: uuid("page_state_id").references(() => pageState.id, { onDelete: "cascade" }),
  itemCode: text("item_code"),
  /** ai | human (지금은 ai 만 씀) */
  verifier: text("verifier").$type<"ai" | "human">().notNull(),
  result: text("result").$type<"supported" | "contradicted" | "uncertain" | "insufficient_evidence">().notNull(),
  confidence: real("confidence"),
  /** 관찰 근거 (가림 처리 후 짧은 한 구절) */
  evidence: text("evidence").notNull().default(""),
  reasonCode: text("reason_code"),
  /** 검수할 때의 자동 결과 (fail | review) — 원본이 나중에 바뀌어도 무엇을 검수했는지 남긴다 */
  autoResult: text("auto_result").notNull(),
  provider: text("provider"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  /** AI 에 보낸 입력(가림 처리 후 글 + 잘라낸 캡처)의 sha256 — 입력 증거 식별자 */
  inputHash: text("input_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("finding_verification_scan_idx").on(t.scanId), index("finding_verification_finding_idx").on(t.findingId)]);

/**
 * 화면마다 자동 점검 원본 증거 (0022). axe 통과·해당 없음 결과(규칙 단위)와 점검한 브라우저 환경.
 * 판정·문제 수에 쓰지 않는다. 0022 를 적용하지 않은 DB 에서도 다른 표가 그대로 동작하도록 따로 둔다.
 */
export const pageEvidence = a11y.table("page_evidence", {
  pageStateId: uuid("page_state_id").primaryKey().references(() => pageState.id, { onDelete: "cascade" }),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  engineVersion: text("engine_version"),
  environment: jsonb("environment").$type<BrowserEnvironment | null>(),
  ruleOutcomes: jsonb("rule_outcomes").$type<RuleOutcomes | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("page_evidence_scan_idx").on(t.scanId)]);

/** 점검 기준의 어느 검사항목에도 연결되지 않은 자동 결과 (기준 외 참고, 0022). 판정·문제 수·비교에 넣지 않는다. */
export const unmappedReference = a11y.table("unmapped_reference", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  pageStateId: uuid("page_state_id").notNull().references(() => pageState.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  packVersion: text("pack_version"),
  engine: text("engine").notNull(),
  ruleId: text("rule_id").notNull(),
  outcome: text("outcome").$type<"violation" | "incomplete">().notNull(),
  /** 도구가 붙인 WCAG 표기 그대로 (KWCAG 연결이 아님) */
  wcag: jsonb("wcag").$type<string[]>().notNull().default([]),
  message: text("message").notNull(),
  selector: text("selector").notNull().default(""),
  html: text("html").notNull().default(""),
  box: jsonb("box").$type<Box | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("unmapped_reference_scan_idx").on(t.scanId), index("unmapped_reference_page_idx").on(t.pageStateId)]);

/**
 * 수동 점검 · 보조기술 점검 · 장애인 사용자 평가 기록 (0023). 쌓기만 하고, 고칠 때는 새 행이 supersedes 로 이전 행을 가리킨다.
 * 자동 결과·AI 검수·점검자 항목 판정과 별도 층이며 항목 상태 계산에 자동으로 넣지 않는다.
 * 참여자는 가명 코드와 특성만 적는다 (이름·연락처 없음).
 */
export const manualEvaluation = a11y.table("manual_evaluation", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  pageStateId: uuid("page_state_id").references(() => pageState.id, { onDelete: "set null" }),
  flowId: uuid("flow_id").references(() => flow.id, { onDelete: "set null" }),
  findingId: uuid("finding_id").references(() => finding.id, { onDelete: "set null" }),
  itemCode: text("item_code"),
  kind: text("kind").$type<"manual" | "assistive_tech" | "user_testing">().notNull(),
  /** 점검 방법 (예: 키보드만 조작, 화면 낭독기 제목 탐색, 200% 확대) */
  method: text("method"),
  assistiveTech: text("assistive_tech"),
  assistiveTechVersion: text("assistive_tech_version"),
  browser: text("browser"),
  browserVersion: text("browser_version"),
  os: text("os"),
  device: text("device"),
  participantCode: text("participant_code"),
  participantProfile: text("participant_profile"),
  task: text("task"),
  result: text("result").$type<"pass" | "fail" | "issue" | "blocked" | "na" | "observation">().notNull(),
  severity: text("severity").$type<"critical" | "major" | "minor">(),
  notes: text("notes").notNull().default(""),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  supersedes: uuid("supersedes"),
  evaluator: text("evaluator").notNull(),
  performedAt: timestamp("performed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("manual_evaluation_scan_idx").on(t.scanId)]);

/** 항목 단위로 사람이 직접 정한 결과 (예: 6.4.4 → 해당 없음) */
export const itemDecision = a11y.table("item_decision", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  decidedBy: text("decided_by").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("item_decision_uq").on(t.scanId, t.itemCode)]);

/**
 * 점검노트 판정 (항목 단위, 0025). 자동 규칙만으로 결론이 나지 않는 항목에 점검이 끝날 때 내린 판정과 근거.
 * source: "ai" (AI 가 캡처·점검 결과를 보고 판정) | "rule" (AI 를 못 쓸 때 규칙). 점검자 판정(item_decision)이 우선한다.
 */
export const itemVerdict = a11y.table("item_verdict", {
  id: uuid("id").primaryKey().defaultRandom(),
  scanId: uuid("scan_id").notNull().references(() => scan.id, { onDelete: "cascade" }),
  itemCode: text("item_code").notNull(),
  verdict: text("verdict").notNull(),
  confidence: real("confidence").notNull().default(0),
  evidence: text("evidence").notNull().default(""),
  source: text("source").notNull(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("item_verdict_uq").on(t.scanId, t.itemCode)]);

/** 점검해야 할 흐름 (로그인, 민원 신청 등) — AI 가 제안하고, 자동으로 끝내거나 사람이 녹화한다 */
export const flow = a11y.table("flow", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  startUrl: text("start_url"),
  /** 사람에게 보여 줄 길 안내 */
  guide: text("guide").notNull().default(""),
  /** 절대 누르면 안 되는 버튼 */
  stopBefore: text("stop_before"),
  /** suggested | auto_done | recorded | skipped */
  status: text("status").notNull().default("suggested"),
  source: text("source").notNull().default("heuristic"),
  /** 녹화된 단계 (크롬 녹화 형식과 비슷한 JSON) */
  steps: jsonb("steps").$type<unknown[]>(),
  autoTried: boolean("auto_tried").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("flow_project_idx").on(t.projectId)]);

/**
 * 업무 흐름의 주요 분기 경로 (0024, WCAG-EM 3.d). 기본 경로 외에 꼭 확인할 갈래(오류·취소·다른 선택).
 * 쌓기만 하고, 상태를 바꿀 때는 새 행이 supersedes 로 이전 행을 가리킨다.
 */
export const flowBranch = a11y.table("flow_branch", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  flowId: uuid("flow_id").notNull().references(() => flow.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** 기본 경로의 몇 번째 단계에서 갈라지는지 (모르면 null) */
  fromStep: integer("from_step"),
  /** 갈라지는 조건 (예: 필수 입력을 비우고 제출) */
  condition: text("condition").notNull().default(""),
  /** 기대 결과 (예: 오류 문구가 입력칸과 연결되어 낭독됨) */
  expected: text("expected").notNull().default(""),
  status: text("status").$type<"planned" | "tested" | "blocked" | "na">().notNull(),
  scanId: uuid("scan_id").references(() => scan.id, { onDelete: "set null" }),
  pageStateId: uuid("page_state_id").references(() => pageState.id, { onDelete: "set null" }),
  note: text("note").notNull().default(""),
  supersedes: uuid("supersedes"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("flow_branch_project_idx").on(t.projectId)]);

/** AI 사용량 — 하루 예산 상한을 지키기 위한 기록 */
export const aiUsage = a11y.table("ai_usage", {
  day: date("day").primaryKey(),
  calls: integer("calls").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
});

/** 프로젝트별 하루 업로드 화면 수 (원자적 한도 확인용, P0-4) */
export const uploadQuota = a11y.table("upload_quota", {
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.projectId, t.day] })]);

/** 운영 작업 기록 (보관기간 정리 등) — 실패·재시도 상태를 운영자가 확인 (GPT 리뷰) */
export const opsLog = a11y.table("ops_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  ok: boolean("ok").notNull(),
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ops_log_job_idx").on(t.job, t.createdAt)]);

/** 요청 속도 제한 (여러 서버 인스턴스가 함께 세는 DB 방식, GPT 리뷰) */
export const rateLimit = a11y.table("rate_limit", {
  key: text("key").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

/** 프로젝트별 사용 한도 설정 (P1-2): 운영자가 프로젝트에 지정. 기간 안의 가장 최근 것이 적용, 없으면 기본 한도 */
export const projectLimit = a11y.table("project_limit", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  grantedBy: text("granted_by").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("project_limit_project_idx").on(t.projectId, t.validUntil)]);

/** 서버 점검 회차별 사용량 예약·집계 (P1-2). reserved = 이번 회차에 새로 셀 수 있는 화면 수 상한 */
export const scanUsage = a11y.table("scan_usage", {
  scanId: uuid("scan_id").primaryKey().references(() => scan.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  /** KST 기준 달 (YYYY-MM) */
  period: text("period").notNull(),
  plan: text("plan").notNull(),
  reserved: integer("reserved").notNull(),
  /** 한 회차에서 점검할 수 있는 페이지 수 (이미 센 페이지 포함) */
  pageCap: integer("page_cap").notNull(),
  counted: integer("counted").notNull().default(0),
  /** reserved → settled | released */
  state: text("state").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}, (t) => [index("scan_usage_project_idx").on(t.projectId, t.period, t.state)]);

/** 이번 달에 이미 사용량으로 센 화면 (같은 달 재점검은 다시 세지 않음) */
export const usagePage = a11y.table("usage_page", {
  projectId: uuid("project_id").notNull().references(() => project.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  pageKey: text("page_key").notNull(),
  scanId: uuid("scan_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.projectId, t.period, t.pageKey] })]);

/** 기본 한도 사용량의 계정 단위 원장 (프로젝트를 지우거나 새로 만들어도 유지, 숫자만 보관) */
export const ownerUsage = a11y.table("owner_usage", {
  ownerEmail: text("owner_email").notNull(),
  period: text("period").notNull(),
  pages: integer("pages").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.ownerEmail, t.period] })]);

/** 계정에 연결된 크롬 확장 (자동 점검용). 연결 키는 해시로만 저장 */
export const extDevice = a11y.table("ext_device", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerEmail: text("owner_email").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("ext_device_token_uq").on(t.tokenHash), index("ext_device_owner_idx").on(t.ownerEmail)]);

export const projectRelations = relations(project, ({ many }) => ({ scans: many(scan), flows: many(flow) }));
export const scanRelations = relations(scan, ({ one, many }) => ({
  project: one(project, { fields: [scan.projectId], references: [project.id] }),
  pages: many(pageState),
  findings: many(finding),
}));
export const pageStateRelations = relations(pageState, ({ one, many }) => ({
  scan: one(scan, { fields: [pageState.scanId], references: [scan.id] }),
  findings: many(finding),
}));
export const findingRelations = relations(finding, ({ one }) => ({
  page: one(pageState, { fields: [finding.pageStateId], references: [pageState.id] }),
  scan: one(scan, { fields: [finding.scanId], references: [scan.id] }),
}));

export type Project = typeof project.$inferSelect;
export type Scan = typeof scan.$inferSelect;
export type PageState = typeof pageState.$inferSelect;
export type Finding = typeof finding.$inferSelect;
export type FindingVerification = typeof findingVerification.$inferSelect;
export type Flow = typeof flow.$inferSelect;
export type PageEvidence = typeof pageEvidence.$inferSelect;
export type UnmappedReferenceRow = typeof unmappedReference.$inferSelect;
export type ManualEvaluation = typeof manualEvaluation.$inferSelect;
export type FlowBranch = typeof flowBranch.$inferSelect;
export type ItemVerdict = typeof itemVerdict.$inferSelect;
