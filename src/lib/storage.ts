// 캡처 이미지 저장소.
//   운영: Supabase Storage private 버킷 (기본 "a11y-shots"), 서버에서만 service role 키로 접근
//   개발: Supabase 설정이 없으면 프로젝트 폴더의 .local-data/shots/ 에 저장
// 키는 영문만 쓴다: {scanId}/{pageStateId}.png

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "./env";

const BUCKET = process.env.A11Y_SHOTS_BUCKET ?? "a11y-shots";
const LOCAL_DIR = path.join(process.cwd(), ".local-data", "shots");
let admin: SupabaseClient | null = null;

/**
 * 저장 방식
 *  - remote: 점검 워커. 저장소 서버 키 없이, 웹 앱의 내부 경로(/api/internal/shots)로만 캡처를 올리고 읽는다 (P0-2 보강)
 *  - supabase: 웹 앱. 서버 키로 비공개 버킷 사용
 *  - local: 개발
 */
function mode(): "remote" | "supabase" | "local" {
  if (process.env.WORKER_APP_URL && process.env.WORKER_SHARED_SECRET) return "remote";
  if (supabaseUrl() && supabaseServiceKey()) return "supabase";
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_STORAGE) {
    throw new Error("캡처 저장소가 설정되지 않았습니다 (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return "local";
}

function client(): SupabaseClient {
  if (!admin) admin = createClient(supabaseUrl()!, supabaseServiceKey()!, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

function safeKey(key: string): string {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) throw new Error("잘못된 저장 키");
  return key;
}

function remoteUrl(key: string): string {
  return `${process.env.WORKER_APP_URL!.replace(/\/+$/, "")}/api/internal/shots?key=${encodeURIComponent(key)}`;
}
function remoteHeaders(): Record<string, string> {
  return { authorization: `Bearer ${process.env.WORKER_SHARED_SECRET}` };
}

export async function saveShot(key: string, png: Buffer): Promise<void> {
  key = safeKey(key);
  if (mode() === "remote") {
    const r = await fetch(remoteUrl(key), { method: "PUT", headers: { ...remoteHeaders(), "content-type": "application/octet-stream" }, body: new Uint8Array(png), signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`캡처 저장 실패 (내부 경로 ${r.status})`);
    return;
  }
  if (mode() === "supabase") {
    const { error } = await client().storage.from(BUCKET).upload(key, png, { contentType: key.endsWith(".jpg") ? "image/jpeg" : "image/png", upsert: true });
    if (error) throw new Error(`캡처 저장 실패: ${error.message}`);
    return;
  }
  const full = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, png);
}

export async function loadShot(key: string): Promise<Buffer | null> {
  key = safeKey(key);
  if (mode() === "remote") {
    const r = await fetch(remoteUrl(key), { headers: remoteHeaders(), signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!r?.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  }
  if (mode() === "supabase") {
    const { data, error } = await client().storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await readFile(path.join(LOCAL_DIR, key));
  } catch {
    return null;
  }
}

/** 캡처 파일 삭제 (웹 앱 전용: 워커는 저장소 삭제 권한이 없다) */
export async function deleteShots(keys: string[]): Promise<number> {
  const safe = keys.filter(Boolean).map(safeKey);
  if (!safe.length) return 0;
  const m = mode();
  if (m === "remote") throw new Error("워커는 캡처를 삭제할 수 없습니다.");
  if (m === "supabase") {
    let n = 0;
    for (let i = 0; i < safe.length; i += 100) {
      const { data, error } = await client().storage.from(BUCKET).remove(safe.slice(i, i + 100));
      if (error) throw new Error(`캡처 삭제 실패: ${error.message}`);
      n += data?.length ?? 0;
    }
    return n;
  }
  const { rm } = await import("node:fs/promises");
  let n = 0;
  for (const k of safe) {
    await rm(path.join(LOCAL_DIR, k), { force: true });
    n++;
  }
  return n;
}
