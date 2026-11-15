// AI 호출 (Gemini 또는 Anthropic). 키는 서버 환경변수에만 둔다 — 브라우저·확장에는 절대 넣지 않는다.
// 하루 예산(AI_DAILY_BUDGET_USD, 기본 $1)이나 전체 예산(AI_TOTAL_BUDGET_USD, 기본 $7 ≈ 1만 원)을 넘으면 호출하지 않고 규칙 기반 판정으로 넘어간다.

import { sql } from "drizzle-orm";
import { aiUsage, db } from "../db";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg"; data: string } };

export type AiProvider = "gemini" | "anthropic";

export function aiProvider(): AiProvider {
  return process.env.AI_PROVIDER === "gemini" ? "gemini" : "anthropic";
}

export function aiConfigured(): boolean {
  return Boolean(aiProvider() === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);
}

export function aiModel(): string {
  if (aiProvider() === "gemini") return process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.8-flash";
  return process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || "claude-haiku-5-5";
}

/**
 * Anthropic API multi-workspace key selection.
 * The workspace ID is an identifier, not the API secret, but it must remain
 * server-side because it is used together with the API key on every request.
 */
export function anthropicHeaders(): Record<string, string> {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY!,
    "anthropic-version": "2023-06-01",
    ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
  };
}

export function geminiHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-goog-api-key": process.env.GEMINI_API_KEY!,
    "x-goog-api-client": "a11ynote/0.1",
  };
}

/** 1백만 토큰당 달러. 모델 가격이 바뀌면 환경변수로 덮어쓴다 (대략값, 예산 상한 계산용) */
function prices(): { input: number; output: number } {
  const defaultInput = aiProvider() === "gemini" ? 0.75 : 0.1;
  const defaultOutput = aiProvider() === "gemini" ? 3.75 : 0.5;
  return {
    input: Number(process.env[aiProvider() === "gemini" ? "GEMINI_PRICE_INPUT_PER_MTOK" : "AI_PRICE_INPUT_PER_MTOK"] ?? defaultInput),
    output: Number(process.env[aiProvider() === "gemini" ? "GEMINI_PRICE_OUTPUT_PER_MTOK" : "AI_PRICE_OUTPUT_PER_MTOK"] ?? defaultOutput),
  };
}

function today(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜 기준
}

/**
 * 남은 예산 = min(오늘 남은 예산, 전체 누적 남은 예산).
 * 전체 상한(AI_TOTAL_BUDGET_USD) 기본 $7 ≈ 1만 원 — 운영자가 정한 총 지출 한도. 넘으면 규칙 판정으로만 돈다.
 */
export async function budgetLeft(): Promise<number> {
  const daily = Number(process.env.AI_DAILY_BUDGET_USD ?? 1);
  const total = Number(process.env.AI_TOTAL_BUDGET_USD ?? 7);
  const [rows, all] = await Promise.all([
    db.select().from(aiUsage).where(sql`${aiUsage.day} = ${today()}`),
    db.execute(sql`select coalesce(sum(cost_usd), 0)::float as spent from a11y.ai_usage`) as unknown as Promise<{ spent: number }[]>,
  ]);
  return Math.min(daily - Number(rows[0]?.costUsd ?? 0), total - Number(all[0]?.spent ?? 0));
}

async function record(inputTokens: number, outputTokens: number): Promise<void> {
  const p = prices();
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  await db
    .insert(aiUsage)
    .values({ day: today(), calls: 1, inputTokens, outputTokens, costUsd: cost.toFixed(4) })
    .onConflictDoUpdate({
      target: aiUsage.day,
      set: {
        calls: sql`${aiUsage.calls} + 1`,
        inputTokens: sql`${aiUsage.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${outputTokens}`,
        costUsd: sql`${aiUsage.costUsd} + ${cost.toFixed(4)}`,
      },
    });
}

export class BudgetExceeded extends Error {}

async function callAnthropic(opts: { system: string; content: ContentBlock[]; maxTokens?: number }): Promise<string> {
  if (!aiConfigured()) throw new Error("AI 키가 없습니다 (ANTHROPIC_API_KEY).");
  if ((await budgetLeft()) <= 0) throw new BudgetExceeded("AI 예산(하루 또는 전체)을 다 썼습니다.");
  const res = await fetch(process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicHeaders(),
    body: JSON.stringify({
      model: aiModel(),
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`AI 호출 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number } };
  await record(data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
  return data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
}

async function callGemini(opts: { system: string; content: ContentBlock[]; maxTokens?: number }): Promise<string> {
  if (!aiConfigured()) throw new Error("AI 키가 없습니다 (GEMINI_API_KEY).");
  if ((await budgetLeft()) <= 0) throw new BudgetExceeded("AI 예산(하루 또는 전체)을 다 썼습니다.");
  const parts = opts.content.map((block) =>
    block.type === "text"
      ? { text: block.text }
      : { inlineData: { mimeType: block.source.media_type, data: block.source.data } },
  );
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModel())}:generateContent`, {
    method: "POST",
    headers: geminiHeaders(),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 2000, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`AI 호출 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number };
  };
  // 생각(thinking) 토큰도 출력 토큰으로 계산된다
  await record(data.usageMetadata?.promptTokenCount ?? 0, (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0));
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

export async function callAI(opts: { system: string; content: ContentBlock[]; maxTokens?: number }): Promise<string> {
  return aiProvider() === "gemini" ? callGemini(opts) : callAnthropic(opts);
}

/** 기존 호출자 호환용 이름. 새 코드는 callAI를 사용한다. */
export const callClaude = callAI;

/** 모델 응답에서 JSON 부분만 꺼낸다 (```json 감싸기, 앞뒤 설명 허용) */
export function extractJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
  if (start < 0 || end < start) throw new Error("AI 응답에서 JSON 을 찾지 못했습니다.");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
