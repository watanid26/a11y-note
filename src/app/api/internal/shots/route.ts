// 점검 워커 전용 캡처 저장·읽기 경로 (P0-2 보강).
// 워커가 저장소 서버 키(DB·인증 관리까지 가능한 강한 키)를 갖지 않도록, 캡처 저장만 이 경로로 위임한다.
//  - 인증: WORKER_SHARED_SECRET (해시 후 상수 시간 비교). 앱에 이 값이 없으면 경로 자체가 없음(404)
//  - 저장(PUT): 진행 중인 서버 점검 회차의 키 형식만, 실제 PNG/JPEG 만, 20MB 이하
//  - 읽기(GET): 이미 저장된 화면의 캡처 키만
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db, pageState, scan } from "@/lib/db";
import { loadShot, saveShot } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(png|jpg)$/;
const MAX_BYTES = 20 * 1024 * 1024;

function authorized(req: Request): boolean {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || secret.length < 32) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

function parseKey(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const m = KEY.exec(key);
  return m ? { key, scanId: m[1], ext: m[3] } : null;
}

export async function PUT(req: Request) {
  if (!process.env.WORKER_SHARED_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const k = parseKey(req);
  if (!k) return NextResponse.json({ error: "잘못된 키" }, { status: 400 });
  const len = Number(req.headers.get("content-length") ?? "0");
  if (!len || len > MAX_BYTES) return NextResponse.json({ error: "크기" }, { status: 413 });
  const [s] = await db.select().from(scan).where(eq(scan.id, k.scanId));
  if (!s || s.source !== "server" || s.status !== "running") return NextResponse.json({ error: "진행 중인 서버 점검 회차가 아님" }, { status: 403 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return NextResponse.json({ error: "크기" }, { status: 413 });
  try {
    const m = await sharp(bytes, { limitInputPixels: 4000 * 20000 }).metadata();
    if ((k.ext === "png" && m.format !== "png") || (k.ext === "jpg" && m.format !== "jpeg")) throw new Error("형식");
  } catch {
    return NextResponse.json({ error: "이미지가 아님" }, { status: 400 });
  }
  await saveShot(k.key, bytes);
  return new NextResponse(null, { status: 204 });
}

export async function GET(req: Request) {
  if (!process.env.WORKER_SHARED_SECRET) return new NextResponse(null, { status: 404 });
  if (!authorized(req)) return new NextResponse(null, { status: 401 });
  const k = parseKey(req);
  if (!k) return NextResponse.json({ error: "잘못된 키" }, { status: 400 });
  const [row] = await db.select({ id: pageState.id }).from(pageState).where(and(eq(pageState.scanId, k.scanId), eq(pageState.screenshotKey, k.key)));
  if (!row) return new NextResponse(null, { status: 404 });
  const img = await loadShot(k.key);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(img), { headers: { "content-type": k.ext === "png" ? "image/png" : "image/jpeg", "cache-control": "no-store" } });
}
