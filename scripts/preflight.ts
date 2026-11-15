// 운영 설정 점검: npx tsx scripts/preflight.ts --role web|worker [--env-file 경로]
// 오류가 하나라도 있으면 종료 코드 1 → 배포 스크립트가 멈춘다. 값은 출력하지 않는다.
import { readFileSync } from "node:fs";
import { parseEnvFile, preflight, type Role } from "../src/lib/ops/preflight";

const args = process.argv.slice(2);
const role = args[args.indexOf("--role") + 1] as Role;
if (args.indexOf("--role") < 0 || (role !== "web" && role !== "worker")) {
  console.error("사용법: npx tsx scripts/preflight.ts --role web|worker [--env-file 경로]");
  process.exit(2);
}
const fi = args.indexOf("--env-file");
const env = fi >= 0 ? parseEnvFile(readFileSync(args[fi + 1], "utf8")) : (process.env as Record<string, string | undefined>);
const r = preflight(role, env);
for (const w of r.warnings) console.log(`경고  ${w}`);
for (const e of r.errors) console.log(`오류  ${e}`);
console.log(r.errors.length ? `설정 점검 실패 (${role}): 오류 ${r.errors.length}건` : `설정 점검 통과 (${role}), 경고 ${r.warnings.length}건`);
process.exit(r.errors.length ? 1 : 0);
