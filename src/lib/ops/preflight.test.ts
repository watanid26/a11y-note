import { describe, expect, it } from "vitest";
import { parseEnvFile, preflight } from "./preflight";

const SECRET = "f".repeat(64);
const EXT = `chrome-extension://${"a".repeat(32)}`;
const web = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://a11y_app:Str0ng-and-long@db.example.com:5432/postgres?sslmode=require",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-value-long-enough",
  WORKER_SHARED_SECRET: SECRET,
  NEXT_PUBLIC_SITE_URL: "https://a11ynote.example.com",
  EXTENSION_ORIGINS: EXT,
};
const worker = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://a11y_worker:Str0ng-and-long@db.example.com:5432/postgres?sslmode=require",
  WORKER_SHARED_SECRET: SECRET,
  WORKER_APP_URL: "https://a11ynote.example.com",
};

describe("운영 설정 점검", () => {
  it("올바른 웹·워커 설정은 오류 없음", () => {
    expect(preflight("web", web).errors).toEqual([]);
    expect(preflight("worker", worker).errors).toEqual([]);
  });
  it("개발 설정이 섞이면 오류", () => {
    const r = preflight("web", { ...web, NODE_ENV: "development", DEV_LOGIN_ENABLED: "1", EGRESS_ALLOW_HOSTS: "localhost:4400", ALLOW_LOCAL_STORAGE: "1" });
    expect(r.errors.length).toBe(4);
  });
  it("짧은 공유 비밀·예시 DB 비밀번호", () => {
    const r = preflight("web", { ...web, WORKER_SHARED_SECRET: "short", DATABASE_URL: "postgresql://a11y:a11y@localhost:5432/a11ynote" });
    expect(r.errors.join("\n")).toMatch(/32자 미만/);
    expect(r.errors.join("\n")).toMatch(/예시·테스트 값/);
  });
  it("웹: 확장 출처·https·서비스 키·워커 전용 값", () => {
    const r = preflight("web", { ...web, EXTENSION_ORIGINS: "chrome-extension://abc", NEXT_PUBLIC_SITE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "", WORKER_APP_URL: "https://x" });
    expect(r.errors.length).toBe(4);
  });
  it("웹: NEXT_PUBLIC_ 에 비밀값", () => {
    const r = preflight("web", { ...web, NEXT_PUBLIC_DEBUG: web.SUPABASE_SERVICE_ROLE_KEY });
    expect(r.errors.join("\n")).toMatch(/NEXT_PUBLIC_DEBUG/);
    expect(r.errors.join("\n")).not.toContain(web.SUPABASE_SERVICE_ROLE_KEY); // 값은 출력하지 않음
  });
  it("워커: 소유자 DB 역할·서비스 키·격리 끄기·가짜 AI 주소", () => {
    const r = preflight("worker", { ...worker, DATABASE_URL: web.DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "x", REQUIRE_ISOLATION: "0", ANTHROPIC_BASE_URL: "http://127.0.0.1:4408/" });
    expect(r.errors.length).toBe(4);
  });
  it("경고: 업로드 한도 덮어쓰기, 기능 플래그", () => {
    const r = preflight("worker", { ...worker, EXT_DAILY_LIMIT: "6", FLOW_AUTOTRY: "on" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(2);
  });
  it("AI 키가 있으면 workspace ID를 검증", () => {
    const missing = preflight("web", { ...web, ANTHROPIC_API_KEY: "sk-ant-test" });
    expect(missing.errors.join("\n")).toMatch(/ANTHROPIC_WORKSPACE_ID/);

    const invalid = preflight("web", { ...web, ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_WORKSPACE_ID: "workspace-test" });
    expect(invalid.errors.join("\n")).toMatch(/형식이 잘못됐습니다/);

    const valid = preflight("web", { ...web, ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_WORKSPACE_ID: "wrkspc_abc123", AI_DAILY_BUDGET_USD: "5" });
    expect(valid.errors).toEqual([]);
  });
  it(".env 해석", () => {
    expect(parseEnvFile(`# c\nA=1\nexport B="x y"\nC=z # note\n`)).toEqual({ A: "1", B: "x y", C: "z" });
  });
});
