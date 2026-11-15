import { describe, expect, it } from "vitest";
import { serverlessUrl } from "./index";

describe("서버리스 DB 주소", () => {
  const session = "postgresql://postgres.ref:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";
  it("Vercel 에서는 Supabase 풀러 session(5432) → transaction(6543)", () => {
    expect(serverlessUrl(session, { VERCEL: "1" })).toBe("postgresql://postgres.ref:pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres");
  });
  it("Vercel 이 아니면 그대로", () => expect(serverlessUrl(session, {})).toBe(session));
  it("이미 6543 이거나 다른 DB 면 그대로", () => {
    const tx = session.replace(":5432", ":6543");
    expect(serverlessUrl(tx, { VERCEL: "1" })).toBe(tx);
    expect(serverlessUrl("postgresql://a:b@db.example.com:5432/x", { VERCEL: "1" })).toBe("postgresql://a:b@db.example.com:5432/x");
  });
});
