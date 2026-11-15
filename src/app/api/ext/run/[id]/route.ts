// 확장 자동 점검 진행: GET = 다음에 볼 화면, POST = 본 화면의 결과 올리기. 확장 키(계정 단위)로만.
import { z } from "zod";
import { checkDevice } from "@/lib/ext-device";
import { json, preflight } from "@/lib/ext-auth";
import { nextPage, submitPage } from "@/lib/scan/browser-run";
import { LIMITS, StateSchema } from "@/lib/upload-guard";
import { BodyInvalid, BodyTooLarge, readJsonLimited } from "@/lib/http/limited-json";
import type { CapturedState } from "@/core/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const OPTIONS = preflight;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await checkDevice(req);
  if (!auth.ok) return json(req, { error: auth.error }, auth.status);
  const r = await nextPage(params.id, auth.email);
  if ("error" in r) return json(req, { error: r.error }, r.status);
  return json(req, r);
}

const Body = z.object({
  url: z.string().max(4000),
  state: StateSchema.nullish(),
  screenshotOrigin: z.object({ x: z.number(), y: z.number() }).nullish(),
  links: z.array(z.object({ url: z.string().max(2000), text: z.string().max(200) })).max(500).optional(),
  error: z.string().max(200).nullish(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await checkDevice(req);
  if (!auth.ok) return json(req, { error: auth.error }, auth.status);
  let raw: unknown;
  try {
    raw = await readJsonLimited(req, LIMITS.requestBytes);
  } catch (e) {
    if (e instanceof BodyTooLarge) return json(req, { error: "요청이 너무 큽니다." }, 413);
    return json(req, { error: e instanceof BodyInvalid ? e.message : "형식이 맞지 않습니다." }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json(req, { error: "형식이 맞지 않거나 너무 큽니다.", detail: parsed.error.issues[0]?.message }, 400);
  const r = await submitPage(params.id, auth.email, { ...parsed.data, state: (parsed.data.state ?? null) as unknown as CapturedState | null });
  if ("error" in r) return json(req, { error: r.error }, r.status);
  return json(req, r);
}
