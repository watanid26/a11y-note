// 크롬 확장용 인증: 쿠키 대신 프로젝트 연결 키(Authorization: Bearer an_…)를 쓴다.
// 키만으로는 결과 올리기·할 일 목록 보기만 가능하고, 결과 열람·서류 다운로드는 로그인해야 한다.
// - 키는 DB 에 해시로만 저장, 만료일 확인 (P0-4)
// - CORS 는 확장 출처만 허용. 단, CORS 는 브라우저 밖 요청을 막지 못하므로 실제 방어는 키 검증이다.
import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, project, scan, type Project, type Scan } from "./db";
import { takeRateLimitDb } from "./security/rate-limit";
import { hashToken } from "./tokens";

/** 허용할 확장 출처. 운영: EXTENSION_ORIGINS="chrome-extension://<배포 ID>". 개발: 모든 chrome-extension:// 허용 */
export function allowedOrigin(origin: string | null, env: Record<string, string | undefined> = process.env): string | null {
  if (!origin) return null;
  const list = (env.EXTENSION_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return origin;
  if (env.NODE_ENV !== "production" && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return origin;
  return null;
}

function corsHeaders(req: Request): Record<string, string> {
  const o = allowedOrigin(req.headers.get("origin"));
  if (!o) return { vary: "Origin" };
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function json(req: Request, data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders(req) });
}

export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export type TokenCheck = { ok: true; project: Project } | { ok: false; status: 401 | 429; error: string };

export async function checkToken(req: Request): Promise<TokenCheck> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^an_[0-9a-f]{48}$/.test(token)) return { ok: false, status: 401, error: "연결 키가 올바르지 않습니다." };
  const hash = hashToken(token);
  if (!(await takeRateLimitDb(`ext:${hash}`, Number(process.env.EXT_RATE_PER_MIN ?? 240), 60))) return { ok: false, status: 429, error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." };
  const [p] = await db.select().from(project).where(eq(project.uploadTokenHash, hash));
  if (!p) return { ok: false, status: 401, error: "연결 키가 올바르지 않습니다. 사이트 설정 화면에서 새 키를 받아 주세요." };
  if (!p.uploadTokenExpiresAt || p.uploadTokenExpiresAt.getTime() < Date.now()) return { ok: false, status: 401, error: "연결 키가 만료되었습니다. 사이트 설정 화면에서 새 키를 받아 주세요." };
  return { ok: true, project: p };
}

/** 예전 호출부 호환: 성공 시 프로젝트, 아니면 null */
export async function projectFromToken(req: Request): Promise<Project | null> {
  const r = await checkToken(req);
  return r.ok ? r.project : null;
}

const EXT_SOURCES = ["extension", "file"];

/**
 * 확장 결과를 붙일 회차 (P0-4): 확장·파일 회차에만 붙인다. 서버 자동 점검 회차에는 섞지 않는다.
 * 지정한 회차가 이 프로젝트의 확장 회차면 그것 → 아니면 24시간 안의 확장 회차 → 없으면 새로 만든다.
 */
export async function targetScan(p: Project, scanId?: string | null): Promise<Scan> {
  if (scanId && /^[0-9a-f-]{36}$/i.test(scanId)) {
    const [s] = await db.select().from(scan).where(eq(scan.id, scanId));
    if (s && s.projectId === p.id && EXT_SOURCES.includes(s.source)) return s;
  }
  const since = new Date(Date.now() - 24 * 3600_000);
  const [recent] = await db
    .select()
    .from(scan)
    .where(and(eq(scan.projectId, p.id), eq(scan.source, "extension"), gte(scan.createdAt, since)))
    .orderBy(desc(scan.createdAt))
    .limit(1);
  if (recent) return recent;
  const [created] = await db.insert(scan).values({ projectId: p.id, source: "extension", status: "done", label: "확장 점검", finishedAt: new Date() }).returning();
  return created;
}

export { EXT_SOURCES };
