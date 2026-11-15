// 인가 규칙이 코드에서 빠지지 않게 고정하는 정적 점검 (P0-3).
// 새 API·서버 액션을 추가할 때 이 테스트가 실패하면 권한 확인을 넣거나, 의도적 예외면 아래 목록에 사유와 함께 추가한다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname);
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// 로그인 없이 열리는 경로 (사유와 함께만 추가)
const PUBLIC_ROUTES = new Set([
  path.join("api", "health", "route.ts"), // 가동 감시: DB 연결 여부와 버전만
  path.join("api", "tick", "route.ts"), // 1분 주기 점검 이어 가기: 이미 예약된 회차만, 분당 4회 제한
]);

describe("인가 정적 점검", () => {
  const routes = walk(path.join(ROOT, "api")).filter((f) => f.endsWith("route.ts"));

  it("API 경로가 하나 이상 있음 (테스트 전제)", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  for (const f of routes) {
    const rel = path.relative(ROOT, f);
    const src = readFileSync(f, "utf8");
    if (rel.startsWith(path.join("api", "internal"))) {
      it(`워커 내부 경로는 공유 비밀 확인(상수 시간 비교): ${rel}`, () => {
        expect(src).toMatch(/timingSafeEqual/);
        for (const m of src.matchAll(/export async function (GET|POST|PUT|DELETE)\(req: Request\) \{([\s\S]*?)\n\}/g)) expect(m[2], m[1]).toMatch(/authorized\(req\)/);
      });
    } else if (PUBLIC_ROUTES.has(rel)) {
      it(`공개 경로는 내부 정보 없이 제한적으로만: ${rel}`, () => {
        if (rel.includes("tick")) expect(src).toMatch(/takeRateLimitDb\(/);
        else expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
        expect(src).not.toMatch(/from\(|select\(\)\.from|process\.env\.(WORKER_SHARED_SECRET|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY)/);
      });
    } else if (rel === path.join("api", "ext", "pair", "route.ts")) {
      it(`확장 자동 연결 키 발급은 로그인 + 같은 사이트 요청만: ${rel}`, () => {
        expect(src).toMatch(/getAuthUser\(\)/);
        expect(src).toMatch(/origin !== new URL\(req\.url\)\.origin/);
        expect(src).toMatch(/takeRateLimitDb\(/);
      });
    } else if (rel.startsWith(path.join("api", "ext", "run"))) {
      it(`확장 자동 점검은 계정 확장 키 점검 + 내 회차만: ${rel}`, () => {
        for (const m of src.matchAll(/export async function (GET|POST)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
          expect(m[2], m[1]).toMatch(/checkDevice\(req\)/);
          expect(m[2], m[1]).toMatch(/auth\.email/);
        }
      });
    } else if (rel.startsWith(path.join("api", "ext"))) {
      it(`확장 API 는 연결 키 점검: ${rel}`, () => {
        expect(src).toMatch(/checkToken\(req\)/);
      });
    } else {
      it(`로그인 + 소유 확인: ${rel}`, () => {
        const viaHelper = /fileResponse\(/.test(src); // report/respond.ts 가 getAuthUser + ownedScan 수행
        expect(viaHelper || /getAuthUser\(\)/.test(src)).toBe(true);
        expect(viaHelper || /ownedScan\(|ownedProject\(|ownerEmail/.test(src)).toBe(true);
      });
    }
  }

  it("서류 공통 응답 함수가 로그인·소유 확인을 함", () => {
    const src = readFileSync(path.join(ROOT, "..", "lib", "report", "respond.ts"), "utf8");
    expect(src).toMatch(/getAuthUser\(\)/);
    expect(src).toMatch(/ownedScan\(/);
  });

  it("서버 액션은 모두 로그인 확인, 사이트를 다루는 액션은 소유 확인", () => {
    const src = readFileSync(path.join(ROOT, "app", "actions.ts"), "utf8");
    const fns = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
    expect(fns.length).toBeGreaterThan(3);
    const NO_PROJECT = new Set(["createProject", "startScanFromUrl"]); // 새로 만들거나, 내 이메일로만 찾음
    for (const [, name, body] of fns) {
      expect(body, name).toMatch(/requireUser\(\)/);
      if (!NO_PROJECT.has(name)) expect(body, name).toMatch(/ownedProject\(/);
    }
  });

  it("화면(page.tsx)이 ID 로 자료를 열 때 소유 확인", () => {
    for (const f of walk(path.join(ROOT, "app")).filter((x) => /\[id\][\\/]page\.tsx$/.test(x))) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/requireUser\(\)/);
      expect(src, f).toMatch(/ownedScan\(|ownedProject\(/);
    }
  });
});
