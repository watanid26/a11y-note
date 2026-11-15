// 운영 배포 전 설정 점검 (P1-8). 필수 설정 누락·위험한 기본값이면 오류 → 배포 중단.
// 순수 함수: 환경변수 묶음을 받아 오류·경고를 돌려준다. 값은 결과에 넣지 않는다 (비밀값 노출 방지).

export type Role = "web" | "worker";
export interface PreflightResult {
  errors: string[];
  warnings: string[];
}

type Env = Record<string, string | undefined>;
const set = (v: string | undefined) => v !== undefined && v.trim() !== "";

function dbUser(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).username) || null;
  } catch {
    return null;
  }
}
function dbPassword(url: string | undefined): string | null {
  try {
    return url ? decodeURIComponent(new URL(url).password) : null;
  } catch {
    return null;
  }
}
const WEAK_DB_PASSWORDS = new Set(["", "a11y", "postgres", "password", "worker-test-pw", "changeme"]);
const FLAGS = ["FLOW_AUTOTRY", "FLOW_SEARCH", "FLOW_EMPTY_SUBMIT", "AI_FLOWS"];

export function preflight(role: Role, env: Env): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (env.NODE_ENV !== "production") err("NODE_ENV=production 이 아닙니다 (개발 로그인·개발용 허용 목록이 켜질 수 있음).");
  if (set(env.DEV_LOGIN_ENABLED)) err("DEV_LOGIN_ENABLED 가 설정돼 있습니다. 운영에서는 빼세요 (코드에서도 무시하지만 설정 실수 신호).");
  if (set(env.EGRESS_ALLOW_HOSTS)) err("EGRESS_ALLOW_HOSTS 가 설정돼 있습니다. 운영에서는 비워야 합니다 (개발용 내부 주소 허용 목록).");
  if (set(env.ALLOW_LOCAL_STORAGE)) err("ALLOW_LOCAL_STORAGE 가 설정돼 있습니다. 운영 캡처는 비공개 저장소에만 둡니다.");
  if (set(env.PREFLIGHT_SKIP)) err("PREFLIGHT_SKIP 이 설정돼 있습니다. 로컬 시험 전용입니다.");
  if (set(env.EXT_DAILY_LIMIT)) warn("EXT_DAILY_LIMIT 가 설정돼 있어 사용 한도의 확장 업로드 한도를 덮어씁니다. 비상용이 아니면 빼세요.");
  for (const f of FLAGS) if (set(env[f])) warn(`기능 플래그 ${f} 가 켜져 있습니다. 승인된 경우에만 켜세요.`);

  const secret = env.WORKER_SHARED_SECRET ?? "";
  if (secret.length < 32) err("WORKER_SHARED_SECRET 가 없거나 32자 미만입니다 (openssl rand -hex 32).");

  const dbUrl = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (!set(dbUrl)) err("DATABASE_URL 이 없습니다.");
  else {
    const pw = dbPassword(dbUrl);
    if (pw !== null && WEAK_DB_PASSWORDS.has(pw)) err("DB 비밀번호가 예시·테스트 값입니다.");
    if (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl!)) warn("DB 주소가 localhost 입니다. 운영 DB 가 맞는지 확인하세요.");
    if (!/sslmode=(require|verify-full|verify-ca)/.test(dbUrl!) && !/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl!)) warn("DB 주소에 sslmode=require 가 없습니다.");
  }

  if (role === "web") {
    if (!set(env.NEXT_PUBLIC_SUPABASE_URL) || !(set(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || set(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))) err("로그인 설정(NEXT_PUBLIC_SUPABASE_URL, ANON 또는 PUBLISHABLE 키)이 없습니다.");
    if (!set(env.SUPABASE_SERVICE_ROLE_KEY) && !set(env.SUPABASE_SECRET_KEY)) err("캡처 저장소 키(SUPABASE_SERVICE_ROLE_KEY)가 없습니다.");
    if (set(env.WORKER_APP_URL)) err("웹에 WORKER_APP_URL 이 있습니다. 이 값은 워커 전용입니다 (웹이 자기 자신에게 캡처를 보내게 됨).");
    if (dbUser(dbUrl) === "a11y_worker") err("웹이 워커 전용 DB 역할(a11y_worker)로 접속합니다.");
    const site = env.NEXT_PUBLIC_SITE_URL ?? "";
    if (!/^https:\/\//.test(site)) err("NEXT_PUBLIC_SITE_URL 이 https 주소가 아닙니다.");
    const origins = (env.EXTENSION_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!origins.length) err("EXTENSION_ORIGINS 가 없습니다 (운영에서는 허용 확장 ID 를 명시해야 확장이 연결됩니다).");
    else if (origins.some((o) => !/^chrome-extension:\/\/[a-p]{32}$/.test(o))) err("EXTENSION_ORIGINS 형식이 잘못됐습니다 (chrome-extension://<32자 ID>, 쉼표로 구분).");
    for (const [k, v] of Object.entries(env)) {
      if (!k.startsWith("NEXT_PUBLIC_") || !v) continue;
      if (/service_role|sk-ant-|AIza|-----BEGIN|sb_secret_/i.test(v) || (v.length > 20 && (v === env.SUPABASE_SERVICE_ROLE_KEY || v === env.WORKER_SHARED_SECRET || v === env.ANTHROPIC_API_KEY || v === env.GEMINI_API_KEY))) err(`${k} 에 비밀값으로 보이는 값이 있습니다 (NEXT_PUBLIC_ 값은 브라우저에 노출됨).`);
    }
    const provider = env.AI_PROVIDER?.trim() || "anthropic";
    if (provider !== "gemini" && provider !== "anthropic") err("AI_PROVIDER는 gemini 또는 anthropic이어야 합니다.");
    if (provider === "anthropic" && set(env.ANTHROPIC_API_KEY)) {
      if (!set(env.ANTHROPIC_WORKSPACE_ID)) err("Anthropic AI 키가 있는데 ANTHROPIC_WORKSPACE_ID가 없습니다 (multi-workspace 키는 요청마다 workspace ID가 필요합니다).");
      else if (!/^wrkspc_[A-Za-z0-9]+$/.test(env.ANTHROPIC_WORKSPACE_ID!)) err("ANTHROPIC_WORKSPACE_ID 형식이 잘못됐습니다 (wrkspc_로 시작해야 합니다).");
      if (!set(env.AI_DAILY_BUDGET_USD)) err("AI 키가 있는데 AI_DAILY_BUDGET_USD(하루 예산)가 없습니다.");
    }
    if (provider === "gemini" && set(env.GEMINI_API_KEY) && !set(env.AI_DAILY_BUDGET_USD)) err("Gemini AI 키가 있는데 AI_DAILY_BUDGET_USD(하루 예산)가 없습니다.");
  } else {
    if (dbUser(dbUrl) !== "a11y_worker") err("워커가 a11y_worker 가 아닌 DB 역할로 접속합니다 (최소 권한 원칙, P0-2).");
    if (set(env.SUPABASE_SERVICE_ROLE_KEY) || set(env.SUPABASE_SECRET_KEY)) err("워커에 저장소 서비스 키가 있습니다. 워커는 /api/internal/shots 로만 캡처를 다룹니다.");
    if (!/^https:\/\//.test(env.WORKER_APP_URL ?? "")) err("WORKER_APP_URL 이 없거나 https 가 아닙니다.");
    if (env.REQUIRE_ISOLATION === "0") err("REQUIRE_ISOLATION=0 입니다. 운영 워커는 네트워크 격리 확인을 끌 수 없습니다.");
    const provider = env.AI_PROVIDER?.trim() || "anthropic";
    if (provider !== "gemini" && provider !== "anthropic") err("AI_PROVIDER는 gemini 또는 anthropic이어야 합니다.");
    if (provider === "anthropic" && set(env.ANTHROPIC_API_KEY)) {
      if (!set(env.ANTHROPIC_WORKSPACE_ID)) err("Anthropic AI 키가 있는데 ANTHROPIC_WORKSPACE_ID가 없습니다 (multi-workspace 키는 요청마다 workspace ID가 필요합니다).");
      else if (!/^wrkspc_[A-Za-z0-9]+$/.test(env.ANTHROPIC_WORKSPACE_ID!)) err("ANTHROPIC_WORKSPACE_ID 형식이 잘못됐습니다 (wrkspc_로 시작해야 합니다).");
      if (!set(env.AI_DAILY_BUDGET_USD)) err("AI 키가 있는데 AI_DAILY_BUDGET_USD(하루 예산)가 없습니다.");
    }
    if (provider === "gemini" && set(env.GEMINI_API_KEY) && !set(env.AI_DAILY_BUDGET_USD)) err("Gemini AI 키가 있는데 AI_DAILY_BUDGET_USD(하루 예산)가 없습니다.");
    if (set(env.ANTHROPIC_BASE_URL)) err("ANTHROPIC_BASE_URL 이 설정돼 있습니다 (테스트용 가짜 서버 주소일 수 있음).");
  }
  return { errors, warnings };
}

/** .env 형식 문자열 해석 (따옴표·주석 처리) */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}
