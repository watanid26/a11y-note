// 비밀값 누출 검사 (P1-8): 저장소에 올라간 파일·확장 패키지·도커 빌드 범위를 본다. 찾은 값은 출력하지 않는다.
// 실행: npx tsx scripts/check-secrets.ts   (문제가 있으면 종료 코드 1)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const PATTERNS: [string, RegExp][] = [
  ["Anthropic API 키", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["Supabase 비밀 키", /sb_secret_[A-Za-z0-9_-]{20,}/],
  ["service_role JWT", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\./],
  ["개인 키", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS 키", /AKIA[0-9A-Z]{16}/],
  ["GitHub 토큰", /gh[pousr]_[A-Za-z0-9]{36,}/],
  // 예시·테스트 비밀번호가 아닌 DB 접속 문자열
  ["DB 비밀번호가 든 주소", /postgres(?:ql)?:\/\/[^:\s/]+:(?!a11y@|worker-test-pw@|<|\$\{|\*\*\*|password@|PASSWORD@|Str0ng-and-long@)[^@\s]{6,}@/],
];
const ALLOW_FILES = new Set(["scripts/check-secrets.ts"]);

const problems: string[] = [];
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
for (const f of files) {
  if (/^\.env(\.|$)/.test(f.split("/").pop()!) && !f.endsWith(".env.example")) problems.push(`환경 파일이 저장소에 올라가 있음: ${f}`);
  if (ALLOW_FILES.has(f) || !existsSync(f) || statSync(f).size > 2_000_000) continue;
  const text = readFileSync(f, "utf8");
  if (text.includes("\u0000")) continue;
  for (const [name, re] of PATTERNS) if (re.test(text)) problems.push(`${name} 형태의 값: ${f}`);
}
const di = existsSync(".dockerignore") ? readFileSync(".dockerignore", "utf8") : "";
for (const need of [".env", ".local-data", ".git"]) if (!di.split(/\r?\n/).includes(need)) problems.push(`.dockerignore 에 ${need} 가 없음 (워커 이미지에 들어갈 수 있음)`);
const gi = readFileSync(".gitignore", "utf8").split(/\r?\n/);
for (const need of [".env", ".env.local", ".local-data", "deploy/worker.env"]) if (!gi.includes(need)) problems.push(`.gitignore 에 ${need} 가 없음`);
// 확장은 사용자에게 배포되므로 서버 비밀이 절대 들어가면 안 된다
for (const f of files.filter((x) => x.startsWith("extension/"))) {
  const t = readFileSync(f, "utf8");
  if (/WORKER_SHARED_SECRET|SUPABASE_SERVICE_ROLE|ANTHROPIC_API_KEY|DATABASE_URL/.test(t)) problems.push(`확장 파일에 서버 설정 이름이 있음: ${f}`);
}
for (const p of problems) console.log(`FAIL  ${p}`);
console.log(problems.length ? `비밀값 검사 실패 ${problems.length}건` : `비밀값 검사 통과 (파일 ${files.length}개)`);
process.exit(problems.length ? 1 : 0);
