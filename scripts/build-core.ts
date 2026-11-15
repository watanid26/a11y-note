// 브라우저 주입용 검사 번들을 만든다 (axe-core 포함).
// 결과물: public/a11y-core.js (서버 워커가 읽음), extension/a11y-core.js (크롬 확장이 주입)
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

async function main() {
await build({
  entryPoints: ["src/core/page/index.ts"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "chrome110",
  outfile: "public/a11y-core.js",
  legalComments: "eof",
  logLevel: "warning",
});
mkdirSync("extension", { recursive: true });
copyFileSync("public/a11y-core.js", "extension/a11y-core.js");
console.log("a11y-core.js 생성 완료");
}
main().catch((e) => { console.error(e); process.exit(1); });
