import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, flow } from "@/lib/db";
import { checkToken, json, preflight } from "@/lib/ext-auth";
import { readJsonLimited } from "@/lib/http/limited-json";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

const Body = z.object({ status: z.enum(["recorded", "skipped", "suggested"]), steps: z.array(z.any()).max(500).optional() });

/** 녹화를 마친 흐름 표시 + 녹화 단계 저장 (다음 회차에 재생용) */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await checkToken(req);
  if (!auth.ok) return json(req, { error: auth.error }, auth.status);
  const p = auth.project;
  const body = Body.safeParse(await readJsonLimited(req, 1024 * 1024).catch(() => null));
  if (!body.success || !/^[0-9a-f-]{36}$/i.test(params.id)) return json(req, { error: "형식이 맞지 않습니다." }, 400);
  const [f] = await db
    .update(flow)
    .set({ status: body.data.status, steps: body.data.steps ?? undefined, updatedAt: new Date() })
    .where(and(eq(flow.id, params.id), eq(flow.projectId, p.id)))
    .returning();
  if (!f) return json(req, { error: "없음" }, 404);
  return json(req, { ok: true });
}
