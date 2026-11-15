import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, finding, flow, manualEvaluation, pageState, type ManualEvaluation } from "@/lib/db";
import { getAuthUser, ownedScan } from "@/lib/auth/session";
import { readJsonLimited } from "@/lib/http/limited-json";
import { getPack, itemByCode } from "@/core/packs";
import { EvaluationInput, evaluationRow, evaluationSummary, redactEvaluation } from "@/lib/manual-eval";

export const dynamic = "force-dynamic";

/** 수동 점검 · 보조기술 점검 · 장애인 사용자 평가 기록 (이력 전체 + 최신 판 요약) */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  const rows = await db
    .select()
    .from(manualEvaluation)
    .where(eq(manualEvaluation.scanId, row.scan.id))
    .orderBy(asc(manualEvaluation.createdAt))
    .catch(() => null);
  if (!rows) return NextResponse.json({ error: "평가 기록 표가 아직 없습니다 (마이그레이션 0023 적용 필요).", entries: [], summary: evaluationSummary([]) }, { status: 503 });
  return NextResponse.json({ entries: rows.map(redactEvaluation), summary: evaluationSummary(rows) });
}

/** 기록 추가 (쌓기만 한다). 고칠 때는 supersedes 에 이전 기록 id 를 넣어 새로 보낸다 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const row = await ownedScan(user, params.id);
  if (!row) return NextResponse.json({ error: "없음" }, { status: 404 });
  const body = EvaluationInput.safeParse(await readJsonLimited(req, 64 * 1024).catch(() => null));
  if (!body.success) return NextResponse.json({ error: "입력값 오류", issues: body.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  const x = body.data;
  const scanId = row.scan.id;
  if (x.itemCode && !itemByCode(getPack(row.project.pack), x.itemCode)) return NextResponse.json({ error: "검사항목 코드가 기준에 없습니다." }, { status: 400 });
  // 연결 대상은 모두 같은 회차(흐름은 같은 프로젝트) 것이어야 한다
  const checks: Promise<boolean>[] = [];
  if (x.pageStateId) checks.push(db.select({ id: pageState.id }).from(pageState).where(and(eq(pageState.id, x.pageStateId), eq(pageState.scanId, scanId))).then((r) => r.length > 0));
  if (x.findingId) checks.push(db.select({ id: finding.id }).from(finding).where(and(eq(finding.id, x.findingId), eq(finding.scanId, scanId))).then((r) => r.length > 0));
  if (x.flowId) checks.push(db.select({ id: flow.id }).from(flow).where(and(eq(flow.id, x.flowId), eq(flow.projectId, row.project.id))).then((r) => r.length > 0));
  if (x.supersedes) checks.push(db.select({ id: manualEvaluation.id }).from(manualEvaluation).where(and(eq(manualEvaluation.id, x.supersedes), eq(manualEvaluation.scanId, scanId))).then((r) => r.length > 0));
  if (!(await Promise.all(checks).catch(() => [false])).every(Boolean)) return NextResponse.json({ error: "연결한 화면·발견 사항·흐름·이전 기록이 이 회차에 없습니다." }, { status: 400 });
  let saved: ManualEvaluation | undefined;
  try {
    [saved] = await db.insert(manualEvaluation).values(evaluationRow(scanId, x, user.email)).returning();
  } catch {
    return NextResponse.json({ error: "평가 기록을 저장하지 못했습니다 (마이그레이션 0023 적용 여부 확인)." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, entry: saved ? redactEvaluation(saved) : null });
}
