// 크롬 확장 자동 점검용 "기기 연결". 키를 사람이 복사하지 않는다:
// 로그인한 웹 화면이 키를 발급받아 같은 브라우저의 확장에 바로 넘긴다 (확장 쪽 bridge.js 가 받음).
// 키는 계정 단위이고, 해시로만 저장한다. 키로 할 수 있는 일은 "내 계정의 확장 점검 회차 진행"뿐이다.
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, extDevice } from "./db";
import { hashToken } from "./tokens";
import { takeRateLimitDb } from "./security/rate-limit";
const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function issueDeviceToken(email: string): Promise<string> {
  const token = `ad_${randomBytes(24).toString("hex")}`;
  await db.insert(extDevice).values({ ownerEmail: normalizeEmail(email), tokenHash: hashToken(token) });
  return token;
}

export type DeviceCheck = { ok: true; email: string; deviceId: string } | { ok: false; status: 401 | 429; error: string };

export async function checkDevice(req: Request): Promise<DeviceCheck> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^ad_[0-9a-f]{48}$/.test(token)) return { ok: false, status: 401, error: "확장 연결이 필요합니다." };
  const hash = hashToken(token);
  if (!(await takeRateLimitDb(`dev:${hash}`, 240, 60))) return { ok: false, status: 429, error: "요청이 너무 많습니다." };
  const [d] = await db.select().from(extDevice).where(and(eq(extDevice.tokenHash, hash), isNull(extDevice.revokedAt)));
  if (!d) return { ok: false, status: 401, error: "확장 연결이 끊겼습니다. 사이트에서 다시 점검을 시작하면 자동으로 다시 연결돼요." };
  if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > 60_000) await db.update(extDevice).set({ lastSeenAt: new Date() }).where(eq(extDevice.id, d.id));
  return { ok: true, email: d.ownerEmail, deviceId: d.id };
}
