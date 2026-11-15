import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, flow, flowBranch, pageState, scan, type FlowBranch } from "@/lib/db";
import { getAuthUser, ownedProject } from "@/lib/auth/session";
import { readJsonLimited } from "@/lib/http/limited-json";
import { BranchInput, branchRow, branchSummary, currentBranches, redactBranch } from "@/lib/flow-branch";

export const dynamic = "force-dynamic";

/** 업무 흐름의 주요 분기 경로 (이력 전체 + 최신 판 요약) */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const p = await ownedProject(user, params.id);
  if (!p) return NextResponse.json({ error: "없음" }, { status: 404 });
  const rows = await db.select().from(flowBranch).where(eq(flowBranch.projectId, p.id)).orderBy(asc(flowBranch.createdAt)).catch(() => null);
  if (!rows) return NextResponse.json({ error: "분기 경로 표가 아직 없습니다 (마이그레이션 0024 적용 필요).", entries: [], current: [], summary: branchSummary([]) }, { status: 503 });
  const cur = new Set(currentBranches(rows).map((r) => r.id));
  return NextResponse.json({ entries: rows.map((r) => ({ ...redactBranch(r), current: cur.has(r.id) })), summary: branchSummary(rows) });
}

/** 분기 추가 (쌓기만 한다). 상태를 바꿀 때는 supersedes 에 이전 기록 id 를 넣어 새로 보낸다 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const p = await ownedProject(user, params.id);
  if (!p) return NextResponse.json({ error: "없음" }, { status: 404 });
  const body = BranchInput.safeParse(await readJsonLimited(req, 32 * 1024).catch(() => null));
  if (!body.success) return NextResponse.json({ error: "입력값 오류", issues: body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  const x = body.data;
  // 흐름·회차·화면·이전 기록은 모두 이 프로젝트 것이어야 한다
  const checks: Promise<boolean>[] = [db.select({ id: flow.id }).from(flow).where(and(eq(flow.id, x.flowId), eq(flow.projectId, p.id))).then((r) => r.length > 0)];
  if (x.scanId) checks.push(db.select({ id: scan.id }).from(scan).where(and(eq(scan.id, x.scanId), eq(scan.projectId, p.id))).then((r) => r.length > 0));
  if (x.pageStateId) checks.push(db.select({ id: pageState.id }).from(pageState).innerJoin(scan, eq(scan.id, pageState.scanId)).where(and(eq(pageState.id, x.pageStateId), eq(scan.projectId, p.id))).then((r) => r.length > 0));
  if (x.supersedes) checks.push(db.select({ id: flowBranch.id }).from(flowBranch).where(and(eq(flowBranch.id, x.supersedes), eq(flowBranch.projectId, p.id), eq(flowBranch.flowId, x.flowId))).then((r) => r.length > 0));
  if (!(await Promise.all(checks).catch(() => [false])).every(Boolean)) return NextResponse.json({ error: "연결한 흐름·회차·화면·이전 기록이 이 사이트에 없습니다." }, { status: 400 });
  let saved: FlowBranch | undefined;
  try {
    [saved] = await db.insert(flowBranch).values(branchRow(p.id, x, user.email)).returning();
  } catch {
    return NextResponse.json({ error: "분기 경로를 저장하지 못했습니다 (마이그레이션 0024 적용 여부 확인)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, entry: saved ? redactBranch(saved) : null });
}
