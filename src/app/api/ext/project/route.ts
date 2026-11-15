import { and, asc, desc, eq } from "drizzle-orm";
import { db, flow, scan } from "@/lib/db";
import { checkToken, json, preflight } from "@/lib/ext-auth";
import { getPack } from "@/core/packs";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** 확장 첫 화면: 프로젝트 정보와 "직접 진행할 흐름" 목록 */
export async function GET(req: Request) {
  const auth = await checkToken(req);
  if (!auth.ok) return json(req, { error: auth.error }, auth.status);
  const p = auth.project;
  const [flows, [latest]] = await Promise.all([
    db.select().from(flow).where(eq(flow.projectId, p.id)).orderBy(asc(flow.createdAt)),
    // 확장 결과는 확장 회차에만 붙으므로 확장 회차 중 최신 것을 알려 준다
    db.select().from(scan).where(and(eq(scan.projectId, p.id), eq(scan.source, "extension"))).orderBy(desc(scan.createdAt)).limit(1),
  ]);
  return json(req, {
    project: { id: p.id, name: p.name, baseUrl: p.baseUrl, pack: p.pack, packName: getPack(p.pack).name },
    scanId: latest?.id ?? null,
    flows: flows.map((f) => ({ id: f.id, name: f.name, kind: f.kind, startUrl: f.startUrl, guide: f.guide, stopBefore: f.stopBefore, status: f.status })),
  });
}
