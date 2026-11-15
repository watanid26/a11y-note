// 확장·파일 업로드 검증 (P0-4). 업로드 키가 유출돼도 저장소 비용 폭증·이상한 파일 저장이 일어나지 않게 한다.
import sharp from "sharp";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pageState, scan } from "./db";

export const LIMITS = {
  screenshotBytes: 8 * 1024 * 1024,
  maxWidth: 4000,
  maxHeight: 20000,
  results: 300,
  nodesPerResult: 50,
  candidates: 200,
  importBytes: 50 * 1024 * 1024,
  importStates: 500,
  dailyScreens: Number(process.env.EXT_DAILY_LIMIT ?? 500),
  /** 확장 업로드 요청 1건 최대 크기 (캡처 base64 포함) */
  requestBytes: 12 * 1024 * 1024,
};

const Outline = z
  .object({
    navLinks: z.array(z.object({ text: z.string().max(300), href: z.string().max(2000) })).max(500),
    forms: z.array(z.object({}).passthrough()).max(100),
    searchInput: z.string().max(1000).nullable(),
  })
  .partial()
  .passthrough();
const Keyboard = z
  .object({
    stops: z.array(z.object({ selector: z.string().max(1000), text: z.string().max(300).optional() }).passthrough()).max(400),
    focusableCount: z.number().int().min(0).max(100000),
    trappedAt: z.string().max(1000).nullable(),
    firstStopIsSkipLink: z.boolean(),
  })
  .partial()
  .passthrough();

const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable();
const Node = z.object({ selector: z.string().max(1000), html: z.string().max(2000).optional(), box: Box.optional(), message: z.string().max(2000).optional() }).passthrough();
const Result = z
  .object({ engine: z.string().max(20), ruleId: z.string().max(100), outcome: z.enum(["violation", "incomplete"]), wcag: z.array(z.string().max(20)).max(20), help: z.string().max(1000), nodes: z.array(Node).max(LIMITS.nodesPerResult) })
  .passthrough();

// 0.3.0 코어부터 함께 오는 원본 보존 자료 (판정에 쓰지 않음). 옛 확장은 보내지 않으므로 선택 항목이다.
const RuleOutcomeEntry = z.object({
  ruleId: z.string().max(100),
  tags: z.array(z.string().max(60)).max(40),
  help: z.string().max(1000),
  sample: z.object({ selector: z.string().max(1000), html: z.string().max(2000) }).nullable(),
});
const RuleOutcomes = z.object({ engine: z.literal("axe"), passed: z.array(RuleOutcomeEntry).max(LIMITS.results), inapplicable: z.array(RuleOutcomeEntry).max(LIMITS.results) });
const Environment = z.object({
  userAgent: z.string().max(1000),
  language: z.string().max(50),
  viewport: z.object({ w: z.number().min(0).max(100000), h: z.number().min(0).max(100000) }),
  screen: z.object({ w: z.number().min(0).max(100000), h: z.number().min(0).max(100000) }),
  devicePixelRatio: z.number().min(0).max(20),
  reducedMotion: z.boolean(),
  colorScheme: z.enum(["light", "dark", "no-preference"]),
});

/** 확장이 올리는 화면 상태 한 개의 형식과 크기 상한 */
export const StateSchema = z.object({
  url: z.string().max(4000),
  title: z.string().max(1000),
  label: z.string().max(300),
  flowId: z.string().uuid().nullish(),
  flowStep: z.number().int().min(0).max(1000).nullish(),
  snapshot: z
    .object({
      results: z.array(Result).max(LIMITS.results),
      candidates: z.array(z.object({ kind: z.string().max(30), selector: z.string().max(1000) }).passthrough()).max(LIMITS.candidates),
      applicable: z.record(z.string(), z.union([z.number(), z.boolean()])),
      outline: Outline,
      templateSignature: z.string().max(200),
      ruleOutcomes: RuleOutcomes.optional(),
      environment: Environment.optional(),
    })
    .passthrough(),
  keyboard: Keyboard.nullish(),
  // base64 는 원본의 약 4/3 배
  screenshot: z.string().max(Math.ceil((LIMITS.screenshotBytes * 4) / 3) + 16).nullish(),
  screenshotScale: z.number().positive().max(4).optional(),
});

export type ScreenshotCheck = { ok: true; bytes: Buffer } | { ok: false; reason: string };

/** 캡처가 진짜 PNG/JPEG 이고 크기 상한 안인지 */
export async function checkScreenshot(b64: string): Promise<ScreenshotCheck> {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, reason: "base64 아님" };
  }
  if (bytes.length > LIMITS.screenshotBytes) return { ok: false, reason: `용량 초과 (${Math.round(bytes.length / 1024 / 1024)}MB)` };
  const png = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpg) return { ok: false, reason: "PNG·JPEG 가 아님" };
  try {
    const m = await sharp(bytes, { limitInputPixels: LIMITS.maxWidth * LIMITS.maxHeight }).metadata();
    if ((png && m.format !== "png") || (jpg && m.format !== "jpeg")) return { ok: false, reason: "이미지 형식 불일치" };
    if (!m.width || !m.height || m.width > LIMITS.maxWidth || m.height > LIMITS.maxHeight) return { ok: false, reason: `이미지 크기 초과 (${m.width}×${m.height})` };
  } catch {
    return { ok: false, reason: "이미지를 읽을 수 없음" };
  }
  return { ok: true, bytes };
}

function kstDay(now = Date.now()): string {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * 하루 업로드 한도를 원자적으로 예약한다 (동시 요청에서도 초과 불가, GPT 리뷰).
 * 한 문장 안에서 "현재 수 + n ≤ 한도" 를 확인하고 더하므로 경쟁 상태가 없다.
 */
export async function reserveQuota(projectId: string, n: number, limit = LIMITS.dailyScreens): Promise<boolean> {
  if (n > limit) return false;
  const rows = await db.execute(sql`
    insert into a11y.upload_quota (project_id, day, count) values (${projectId}, ${kstDay()}, ${n})
    on conflict (project_id, day) do update set count = a11y.upload_quota.count + ${n}
      where a11y.upload_quota.count + ${n} <= ${limit}
    returning count`);
  return (rows as unknown as unknown[]).length > 0;
}

/** 예약했지만 저장하지 못한 만큼 되돌린다 */
export async function releaseQuota(projectId: string, n: number): Promise<void> {
  await db.execute(sql`update a11y.upload_quota set count = greatest(0, count - ${n}) where project_id = ${projectId} and day = ${kstDay()}`);
}

function kstDayStart(now = Date.now()): Date {
  const kst = new Date(now + 9 * 3600_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 3600_000);
}

/** 오늘(한국 날짜) 이 프로젝트에 확장·파일로 올라온 화면 수 */
export async function uploadedToday(projectId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pageState)
    .innerJoin(scan, eq(scan.id, pageState.scanId))
    .where(and(eq(scan.projectId, projectId), inArray(scan.source, ["extension", "file"]), gte(pageState.createdAt, kstDayStart())));
  return r?.n ?? 0;
}
