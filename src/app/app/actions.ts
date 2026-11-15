"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, flow, project, scan } from "@/lib/db";
import { ownedProject, requireUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { NEW_TOKEN_COOKIE, issueUploadToken } from "@/lib/tokens";
import { EgressBlocked, checkUrl } from "@/lib/security/egress";
import { LimitError, createProjectLimited, reserveServerScan } from "@/lib/usage-limits";
import { pickSource } from "@/lib/scan/mode";

const ProjectInput = z.object({
  clientName: z.string().trim().max(120).optional(),
  name: z.string().trim().min(1, "사이트 이름을 입력하세요.").max(80),
  baseUrl: z
    .string()
    .trim()
    .url("http:// 또는 https:// 로 시작하는 주소를 입력하세요.")
    .superRefine((u, ctx) => {
      try {
        checkUrl(u);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: e instanceof EgressBlocked ? e.message : "주소를 확인하세요." });
      }
    }),
  targetEnvironment: z.enum(["production", "staging", "development"]).default("production"),
  pack: z.enum(["kwcag22", "jis2016"]),
  maxPages: z.coerce.number().int().min(1).max(200),
  auditorName: z.string().trim().max(80).optional(),
});

const ProjectMetaInput = z.object({
  clientName: z.string().trim().max(120, "대상 기관명은 120자 이내로 입력하세요.").optional(),
  auditorName: z.string().trim().max(80, "점검 수행 기관은 80자 이내로 입력하세요.").optional(),
  targetEnvironment: z.enum(["production", "staging", "development"]),
});

export type FormState = { error?: string; needExt?: boolean };

/** 새 연결 키를 한 번만 보여 주기 위한 쿠키 (HttpOnly, 이 프로젝트 화면 경로에서만, 10분) */
function showTokenOnce(projectId: string, token: string) {
  cookies().set(NEW_TOKEN_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: `/app/p/${projectId}`, maxAge: 600 });
}

export async function hideToken(projectId: string): Promise<void> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) throw new Error("사이트를 찾을 수 없습니다.");
  cookies().delete({ name: NEW_TOKEN_COOKIE, path: `/app/p/${p.id}` });
  revalidatePath(`/app/p/${p.id}`);
}

export async function createProject(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ProjectInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const issued = issueUploadToken();
  let p: { id: string };
  try {
    p = await createProjectLimited(user.email, { ...parsed.data, clientName: parsed.data.clientName || null, auditorName: parsed.data.auditorName || null, ...issued.fields });
  } catch (e) {
    if (e instanceof LimitError) return { error: e.message };
    throw e;
  }
  showTokenOnce(p.id, issued.token);
  redirect(`/app/p/${p.id}`);
}

/** 프로젝트에 보고서 표지용 정보를 저장한다. 실제 결과·판정과 분리해 언제든 수정할 수 있다. */
export async function updateProjectMetadata(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) return { error: "사이트를 찾을 수 없습니다." };
  const parsed = ProjectMetaInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "보고서 정보를 확인하세요." };
  await db.update(project).set({ clientName: parsed.data.clientName || null, auditorName: parsed.data.auditorName || null, targetEnvironment: parsed.data.targetEnvironment }).where(eq(project.id, p.id));
  revalidatePath(`/app/p/${p.id}`);
  revalidatePath(`/app/s`);
  return {};
}

export async function startServerScan(projectId: string, form?: FormData): Promise<void> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) throw new Error("사이트를 찾을 수 없습니다.");
  const source = pickSource(form);
  if (!source) redirect("/app/extension");
  // 사용 한도는 서버에서 원자적으로 확인하고 예약한다 (P1-2)
  let scanId: string;
  try {
    scanId = (await reserveServerScan(p.id, { source })).scan.id;
  } catch (e) {
    if (e instanceof LimitError) redirect(`/app/p/${p.id}?limit=${e.code}`);
    throw e;
  }
  redirect(`/app/s/${scanId}`);
}

export async function setFlowStatus(projectId: string, flowId: string, status: "skipped" | "suggested"): Promise<void> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) throw new Error("사이트를 찾을 수 없습니다.");
  await db.update(flow).set({ status, updatedAt: new Date() }).where(and(eq(flow.id, flowId), eq(flow.projectId, p.id)));
  revalidatePath(`/app/p/${p.id}`);
}

export async function rotateToken(projectId: string): Promise<void> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) throw new Error("사이트를 찾을 수 없습니다.");
  const issued = issueUploadToken();
  await db.update(project).set(issued.fields).where(eq(project.id, p.id));
  showTokenOnce(p.id, issued.token);
  revalidatePath(`/app/p/${p.id}`);
}

/** 프로젝트별 외부 AI 사용 켜기/끄기 (기본 끔) */
export async function setAiEnabled(projectId: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) throw new Error("사이트를 찾을 수 없습니다.");
  await db.update(project).set({ aiEnabled: enabled }).where(eq(project.id, p.id));
  revalidatePath(`/app/p/${p.id}`);
}

const NEED_EXT = "점검하려면 크롬 확장을 먼저 설치하세요. 설치는 1분이면 끝납니다.";

const LIMIT_TEXT: Record<string, string> = {
  E_CONCURRENT: "이 사이트는 이미 점검하고 있습니다. 끝난 뒤 다시 시작하세요.",
  E_DAILY: "오늘 시작할 수 있는 점검을 모두 사용했습니다. 내일 다시 시도하세요.",
  E_MONTHLY: "이번 달 점검할 수 있는 페이지를 모두 사용했습니다. 이미 점검한 사이트는 '재점검'으로 계속 확인할 수 있습니다.",
  E_PROJECTS: "기본 한도로는 사이트 3개까지 점검할 수 있습니다. 기존 사이트를 다시 점검해 주세요.",
};

/**
 * 첫 화면: 주소 하나로 바로 점검을 시작한다.
 * 같은 주소(도메인)의 사이트가 이미 있으면 그것을 다시 쓰고, 없으면 만든다 (사용자에게는 "사이트"를 보이지 않는다).
 */
export async function startScanFromUrl(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let raw = String(form.get("url") ?? "").trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = checkUrl(raw);
  } catch (e) {
    return { error: e instanceof EgressBlocked ? e.message : "주소를 확인하세요. 예: www.example.go.kr" };
  }
  const pack = form.get("pack") === "jis2016" ? "jis2016" : "kwcag22";
  const origin = `${u.protocol}//${u.host}`;
  const mine = await db.select().from(project).where(eq(project.ownerEmail, user.email));
  let p = mine.find((x) => {
    try {
      const b = new URL(x.baseUrl);
      return b.host === u.host && b.pathname.replace(/\/+$/, "") === u.pathname.replace(/\/+$/, "") && x.pack === pack;
    } catch {
      return false;
    }
  });
  const source = pickSource(form);
  if (!source) return { error: NEED_EXT, needExt: true };
  let scanId: string;
  let created = false;
  try {
    if (!p) {
      p = await createProjectLimited(user.email, { clientName: null, name: u.hostname.replace(/^www\./, ""), baseUrl: `${origin}${u.pathname === "/" ? "/" : u.pathname}`, pack, maxPages: 10, targetEnvironment: "production", ...issueUploadToken().fields });
      created = true;
    }
    scanId = (await reserveServerScan(p.id, { label: "자동 점검", source })).scan.id;
  } catch (e) {
    // 한도 때문에 점검을 못 열었으면 방금 만든 빈 사이트는 지운다 (사이트 수 한도를 괜히 차지하지 않게)
    if (created && p) await db.delete(project).where(eq(project.id, p.id)).catch(() => {});
    if (e instanceof LimitError) return { error: LIMIT_TEXT[e.code] ?? e.message };
    throw e;
  }
  redirect(`/app/s/${scanId}`);
}

/** 결과 화면의 "다시 점검" */
export async function rescanProject(projectId: string, form?: FormData): Promise<void> {
  const user = await requireUser();
  const p = await ownedProject(user, projectId);
  if (!p) throw new Error("사이트를 찾을 수 없습니다.");
  const source = pickSource(form);
  if (!source) redirect("/app/extension");
  let scanId: string;
  try {
    scanId = (await reserveServerScan(p.id, { label: "재점검", source })).scan.id;
  } catch (e) {
    if (e instanceof LimitError) redirect(`/app?error=${e.code}`);
    throw e;
  }
  redirect(`/app/s/${scanId}`);
}
