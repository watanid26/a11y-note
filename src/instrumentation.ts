// 웹 서버 시작 시 운영 설정 점검 (P1-8). 오류가 있으면 서버를 띄우지 않는다 (기본 거부).
// 로컬에서 운영 빌드를 시험할 때만 PREFLIGHT_SKIP=1 로 끌 수 있고, 그 사실을 크게 남긴다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { preflight } = await import("./lib/ops/preflight");
  const r = preflight("web", process.env as Record<string, string | undefined>);
  for (const w of r.warnings) console.warn(`[preflight] 경고: ${w}`);
  if (!r.errors.length) return;
  for (const e of r.errors) console.error(`[preflight] 오류: ${e}`);
  if (process.env.PREFLIGHT_SKIP === "1") {
    console.error("[preflight] PREFLIGHT_SKIP=1 — 운영 설정 오류를 무시하고 시작합니다. 운영 배포에서는 절대 쓰지 마세요.");
    return;
  }
  throw new Error(`운영 설정 점검 실패: 오류 ${r.errors.length}건 (scripts/preflight.ts --role web 로 확인)`);
}
