// 점검을 어디서 돌릴지: 사용자 크롬(확장) 또는 서버(관리형 크롬). 서버 크롬이 설정돼 있지 않으면 확장만 가능하다.
export function serverEngineAvailable(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BROWSER_WS_ENDPOINT) || env.NODE_ENV !== "production";
}

export function pickSource(form: FormData | undefined, env: Record<string, string | undefined> = process.env): "browser" | "server" | null {
  if (form?.get("mode") === "browser") return "browser";
  return serverEngineAvailable(env) ? "server" : null;
}
