// 통합 테스트용 브라우저 실행 파일 찾기 (검사 로직과 무관, 테스트 실행 경로만).
// 순서: CHROMIUM_PATH → macOS Google Chrome·Chromium·Playwright 캐시 → Linux Chromium·Chrome·Playwright 캐시
import { accessSync, constants, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function executable(p: string): boolean {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Playwright 가 내려받은 Chromium (버전 폴더는 최신 것부터) */
function playwrightCache(dir: string, rel: string[]): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    .flatMap((d) => rel.map((r) => path.join(dir, d, r)));
}

export function chromiumCandidates(env: Record<string, string | undefined> = process.env, platform = process.platform): string[] {
  const home = homedir();
  const list: string[] = [];
  if (env.CHROMIUM_PATH) list.push(env.CHROMIUM_PATH);
  if (platform === "darwin") {
    list.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      ...playwrightCache(path.join(home, "Library/Caches/ms-playwright"), [
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ]),
    );
  } else {
    list.push(
      "/opt/pw-browsers/chromium",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      ...playwrightCache(path.join(home, ".cache/ms-playwright"), ["chrome-linux/chrome", "chrome-linux64/chrome"]),
      ...playwrightCache(env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers", ["chrome-linux/chrome", "chrome-linux64/chrome"]),
    );
  }
  return list;
}

/** 실행 가능한 첫 브라우저. 없으면 안내를 출력하고 종료 코드 2 로 멈춘다 (테스트가 조용히 통과하지 않게) */
export function requireChromium(env: Record<string, string | undefined> = process.env): string {
  const tried = chromiumCandidates(env);
  // CHROMIUM_PATH 를 지정했는데 잘못됐으면 다른 브라우저로 넘어가지 않고 멈춘다 (설정 실수를 숨기지 않게)
  const found = env.CHROMIUM_PATH ? (executable(env.CHROMIUM_PATH) ? env.CHROMIUM_PATH : undefined) : tried.find(executable);
  if (found) return found;
  if (env.CHROMIUM_PATH) console.error(`[테스트 중단] CHROMIUM_PATH 가 실행 가능한 파일이 아닙니다: ${env.CHROMIUM_PATH}`);
  console.error("[테스트 중단] 실행할 수 있는 Chrome/Chromium 을 찾지 못해 테스트를 하나도 실행하지 않았습니다.");
  console.error("찾아본 경로:\n  " + tried.join("\n  "));
  console.error("해결: Google Chrome 을 설치하거나, `npx playwright install chromium` 후 경로를 지정하세요.");
  console.error('예: CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx scripts/test-remote-isolation.ts');
  process.exit(2);
}
