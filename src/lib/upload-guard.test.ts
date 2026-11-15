import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { allowedOrigin } from "./ext-auth";
import { hashToken, issueUploadToken } from "./tokens";
import { LIMITS, StateSchema, checkScreenshot } from "./upload-guard";

describe("확장 연결 키 (P0-4)", () => {
  it("DB 에 들어갈 값에 원문이 없음, 해시·끝 4자리·만료일만", () => {
    const { token, fields } = issueUploadToken(new Date("2026-10-09T00:00:00Z"));
    expect(token).toMatch(/^an_[0-9a-f]{48}$/);
    expect(fields.uploadToken).toBeNull();
    expect(fields.uploadTokenHash).toBe(hashToken(token));
    expect(fields.uploadTokenHash).not.toContain(token.slice(3, 20));
    expect(fields.uploadTokenLast4).toBe(token.slice(-4));
    expect(fields.uploadTokenExpiresAt.toISOString()).toBe("2027-01-07T00:00:00.000Z"); // 90일
  });
});

describe("CORS 허용 출처", () => {
  const id = "a".repeat(32);
  it("운영: 등록한 확장 출처만", () => {
    const env = { NODE_ENV: "production", EXTENSION_ORIGINS: `chrome-extension://${id}` };
    expect(allowedOrigin(`chrome-extension://${id}`, env)).toBe(`chrome-extension://${id}`);
    expect(allowedOrigin(`chrome-extension://${"b".repeat(32)}`, env)).toBeNull();
    expect(allowedOrigin("https://evil.example", env)).toBeNull();
    expect(allowedOrigin(null, env)).toBeNull();
  });
  it("개발: 아무 확장 출처 허용, 일반 사이트는 거부", () => {
    expect(allowedOrigin(`chrome-extension://${"c".repeat(32)}`, { NODE_ENV: "development" })).not.toBeNull();
    expect(allowedOrigin("http://localhost:3000", { NODE_ENV: "development" })).toBeNull();
  });
});

describe("캡처 검증", () => {
  const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).png().toBuffer();
  it("정상 PNG·JPEG 통과", async () => {
    expect((await checkScreenshot((await png(100, 100)).toString("base64"))).ok).toBe(true);
    const jpg = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).jpeg().toBuffer();
    expect((await checkScreenshot(jpg.toString("base64"))).ok).toBe(true);
  });
  it("이미지가 아닌 바이트 거부", async () => {
    expect((await checkScreenshot(Buffer.from("<script>alert(1)</script>").toString("base64"))).ok).toBe(false);
    expect((await checkScreenshot(Buffer.from("%PDF-1.7 ...").toString("base64"))).ok).toBe(false);
  });
  it("PNG 머리만 붙인 가짜 거부", async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
    expect((await checkScreenshot(fake.toString("base64"))).ok).toBe(false);
  });
  it("가로·세로 상한 초과 거부", async () => {
    expect((await checkScreenshot((await png(LIMITS.maxWidth + 1, 10)).toString("base64"))).ok).toBe(false);
  });
  it("용량 상한 초과 거부", async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(LIMITS.screenshotBytes + 10)]);
    const r = await checkScreenshot(big.toString("base64"));
    expect(r.ok).toBe(false);
  });
});

describe("업로드 형식 상한", () => {
  const base = { url: "https://a.kr/", title: "t", label: "l", snapshot: { results: [], candidates: [], applicable: { images: 1 }, outline: {}, templateSignature: "x" } };
  it("정상 형식 통과", () => {
    expect(StateSchema.safeParse(base).success).toBe(true);
  });
  it("결과 개수·노드 개수·후보 개수 상한", () => {
    const r = { engine: "axe", ruleId: "x", outcome: "violation", wcag: [], help: "", nodes: [] };
    expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, results: Array(LIMITS.results + 1).fill(r) } }).success).toBe(false);
    const node = { selector: "a", html: "", box: null, message: "" };
    expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, results: [{ ...r, nodes: Array(LIMITS.nodesPerResult + 1).fill(node) }] } }).success).toBe(false);
    expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, candidates: Array(LIMITS.candidates + 1).fill({ kind: "image", selector: "img" }) } }).success).toBe(false);
  });
  it("결과 판정값 위조 거부 (violation·incomplete 외)", () => {
    const r = { engine: "axe", ruleId: "x", outcome: "pass", wcag: [], help: "", nodes: [] };
    expect(StateSchema.safeParse({ ...base, snapshot: { ...base.snapshot, results: [r] } }).success).toBe(false);
  });
});
