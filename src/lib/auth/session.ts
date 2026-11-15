import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, project, scan, type Project, type Scan } from "@/lib/db";
import { DEV_COOKIE, devLoginEnabled, supabaseConfigured } from "./dev";
import { getServerSupabase } from "./supabase-server";

export interface AuthUser {
  id: string;
  email: string;
}

/** 로그인한 사용자 (Supabase 매직 링크 또는 개발용 로그인) */
export async function getAuthUser(): Promise<AuthUser | null> {
  const jar = cookies(); // 항상 먼저 읽어 화면이 정적으로 굳지 않게 한다
  if (devLoginEnabled()) {
    const email = jar.get(DEV_COOKIE)?.value;
    if (email) return { id: `dev:${email}`, email: email.trim().toLowerCase() };
  }
  if (!supabaseConfigured()) return null;
  const { data } = await getServerSupabase().auth.getUser();
  if (!data.user?.email) return null;
  return { id: data.user.id, email: data.user.email.trim().toLowerCase() };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/** 내 프로젝트만 열 수 있다. 남의 id 를 넣으면 "없음" 처리 */
export async function ownedProject(user: AuthUser, projectId: string): Promise<Project | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const [p] = await db.select().from(project).where(and(eq(project.id, projectId), eq(project.ownerEmail, user.email)));
  return p ?? null;
}

export async function ownedScan(user: AuthUser, scanId: string): Promise<{ scan: Scan; project: Project } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) return null;
  const [row] = await db
    .select({ scan, project })
    .from(scan)
    .innerJoin(project, eq(project.id, scan.projectId))
    .where(and(eq(scan.id, scanId), eq(project.ownerEmail, user.email)));
  return row ?? null;
}
