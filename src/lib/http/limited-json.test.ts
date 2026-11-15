import { describe, expect, it } from "vitest";
import { BodyInvalid, BodyTooLarge, checkShape, readJsonLimited } from "./limited-json";

const req = (body: string, headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", body, headers });

describe("요청 본문 상한 (GPT 리뷰)", () => {
  it("상한 이하 JSON 은 읽음", async () => {
    expect(await readJsonLimited(req('{"a":1}'), 100)).toEqual({ a: 1 });
  });
  it("Content-Length 가 상한을 넘으면 읽기 전에 거부", async () => {
    await expect(readJsonLimited(req("{}", { "content-length": "999999" }), 100)).rejects.toBeInstanceOf(BodyTooLarge);
  });
  it("길이 표시 없이 큰 본문도 읽다가 상한에서 끊음", async () => {
    await expect(readJsonLimited(req(JSON.stringify({ a: "x".repeat(500) })), 100)).rejects.toBeInstanceOf(BodyTooLarge);
  });
  it("JSON 이 아니면 거부", async () => {
    await expect(readJsonLimited(req("not json"), 100)).rejects.toBeInstanceOf(BodyInvalid);
  });
});

describe("JSON 모양 제한", () => {
  const lim = { maxDepth: 20, maxArray: 100, maxKeys: 50 };
  it("깊이 초과 거부 (스택 넘침 없이)", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 5000; i++) deep = [deep];
    expect(() => checkShape(deep, lim)).toThrow(BodyInvalid);
  });
  it("배열 길이 초과 거부", () => expect(() => checkShape({ a: Array(101).fill(0) }, lim)).toThrow(BodyInvalid));
  it("키 개수 초과 거부", () => expect(() => checkShape(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, i])), lim)).toThrow(BodyInvalid));
  it("정상 모양 통과", () => expect(() => checkShape({ a: [{ b: [1, 2, { c: "d" }] }] }, lim)).not.toThrow());
});
