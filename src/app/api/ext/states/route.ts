import { extDailyLimit } from "@/lib/usage-limits";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, flow } from "@/lib/db";
import { ingestState } from "@/lib/ingest";
import { checkToken, json, preflight, targetScan } from "@/lib/ext-auth";
import { LIMITS, StateSchema, reserveQuota } from "@/lib/upload-guard";
import { BodyInvalid, BodyTooLarge, readJsonLimited } from "@/lib/http/limited-json";
import type { CapturedState } from "@/core/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const OPTIONS = preflight;

const Body = z.object({
  scanId: z.string().uuid().nullish(),
  screenshotOrigin: z.object({ x: z.number(), y: z.number() }).nullish(),
  state: StateSchema,
});

/** 확장이 화면 하나를 점검할 때마다 올린다 → 같은 판정 과정을 거쳐 확장 회차에 더해진다 */
export async function POST(req: Request) {
  const auth = await checkToken(req);
  if (!auth.ok) return json(req, { error: auth.error }, auth.status);
  const p = auth.project;
  let raw: unknown;
  try {
    raw = await readJsonLimited(req, LIMITS.requestBytes);
  } catch (e) {
    if (e instanceof BodyTooLarge) return json(req, { error: "요청이 너무 큽니다." }, 413);
    return json(req, { error: e instanceof BodyInvalid ? e.message : "형식이 맞지 않습니다." }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json(req, { error: "형식이 맞지 않거나 너무 큽니다.", detail: parsed.error.issues[0]?.message }, 400);
  // 하루 한도를 먼저 원자적으로 예약한다 (동시 요청에서도 초과 불가)
  const daily = await extDailyLimit(p.id);
  if (!(await reserveQuota(p.id, 1, daily))) return json(req, { error: `오늘 올릴 수 있는 화면 수(${daily}개)를 넘었습니다.` }, 429);
  const s = await targetScan(p, parsed.data.scanId);
  const state = parsed.data.state as unknown as CapturedState;
  if (state.flowId) {
    const [f] = await db.select().from(flow).where(and(eq(flow.id, state.flowId), eq(flow.projectId, p.id)));
    if (!f) state.flowId = null;
  }
  const r = await ingestState(state, { scanId: s.id, packId: p.pack, reason: state.flowId ? "확장 녹화" : "확장 점검", screenshotOrigin: parsed.data.screenshotOrigin ?? null, untrusted: true });
  return json(req, { scanId: s.id, pageStateId: r.pageStateId, findings: r.findings, warning: r.warning });
}
