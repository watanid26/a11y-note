import { extDailyLimit } from "@/lib/usage-limits";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, flow, scan } from "@/lib/db";
import { getAuthUser, ownedProject } from "@/lib/auth/session";
import { ingestState } from "@/lib/ingest";
import type { CapturedState } from "@/core/types";
import { LIMITS, StateSchema, releaseQuota, reserveQuota } from "@/lib/upload-guard";
import { BodyInvalid, checkShape } from "@/lib/http/limited-json";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 인터넷이 막힌 내부망 PC 에서 확장이 저장한 결과 파일(JSON)을 올린다 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const p = await ownedProject(user, params.id);
  if (!p) return NextResponse.json({ error: "없음" }, { status: 404 });
  // 본문을 읽기 전에 크기부터 확인 (formData() 는 전체를 메모리에 올림)
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (!Number.isFinite(declared) || declared > LIMITS.importBytes + 64 * 1024) return NextResponse.json({ error: `파일이 너무 큽니다 (${LIMITS.importBytes / 1024 / 1024}MB 이하).` }, { status: 413 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  if (file.size > LIMITS.importBytes) return NextResponse.json({ error: `파일이 너무 큽니다 (${LIMITS.importBytes / 1024 / 1024}MB 이하).` }, { status: 400 });
  let data: { format?: string; states?: (CapturedState & { screenshotOrigin?: { x: number; y: number } })[]; flows?: { id: string; status: string; steps?: unknown[] }[] };
  try {
    data = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "결과 파일 형식이 아닙니다." }, { status: 400 });
  }
  try {
    checkShape(data, { maxDepth: 24, maxArray: 2000, maxKeys: 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof BodyInvalid ? e.message : "형식 오류" }, { status: 400 });
  }
  if (data.format !== "a11ynote-export-v1" || !Array.isArray(data.states)) return NextResponse.json({ error: "접근성 점검노트 확장에서 저장한 파일이 아닙니다." }, { status: 400 });
  const states = data.states.slice(0, LIMITS.importStates);
  const valid = states.map((st) => StateSchema.safeParse(st));
  if (valid.some((v) => !v.success)) return NextResponse.json({ error: "파일 안의 화면 자료 형식이 맞지 않거나 너무 큽니다." }, { status: 400 });
  const daily = await extDailyLimit(p.id);
  if (!(await reserveQuota(p.id, states.length, daily))) return NextResponse.json({ error: `오늘 올릴 수 있는 화면 수(${daily}개)를 넘습니다.` }, { status: 429 });
  const [s] = await db.insert(scan).values({ projectId: p.id, source: "file", status: "done", label: "파일 업로드", finishedAt: new Date() }).returning();
  const flowIds = new Set((await db.select({ id: flow.id }).from(flow).where(eq(flow.projectId, p.id))).map((f) => f.id));
  let count = 0;
  const warnings: string[] = [];
  for (const st of states) {
    if (!st?.snapshot?.results) continue;
    if (st.flowId && !flowIds.has(st.flowId)) st.flowId = null;
    const r = await ingestState(st, { scanId: s.id, packId: p.pack, reason: st.flowId ? "확장 녹화 (파일)" : "확장 점검 (파일)", screenshotOrigin: st.screenshotOrigin ?? null, untrusted: true });
    if (r.warning) warnings.push(r.warning);
    count++;
  }
  for (const f of data.flows ?? []) {
    if (!flowIds.has(f.id) || !["recorded", "skipped"].includes(f.status)) continue;
    await db.update(flow).set({ status: f.status, steps: f.steps ?? undefined, updatedAt: new Date() }).where(and(eq(flow.id, f.id), eq(flow.projectId, p.id)));
  }
  if (count < states.length) await releaseQuota(p.id, states.length - count);
  return NextResponse.json({ scanId: s.id, states: count, warnings: warnings.slice(0, 10) });
}
