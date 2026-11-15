// 테스트용 확장 사본 만들기. 자동화 브라우저는 권한 요청 창을 누를 수 없으므로,
// "사용자가 이 사이트·이 권한만 허용한 상태"를 manifest 에 미리 넣은 사본으로 흉내 낸다.
//   granted : 디버거·다운로드 + 테스트 사이트(localhost:4400) 한 곳만 허용 — 실제 배포본보다 넓지 않은 범위
//   shipping: 배포본 그대로 (선택 권한 아무것도 허용 안 함)
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

//   granted-capture: granted + "화면 캡처 허용"(<all_urls>)까지 누른 상태
export function extVariant(kind: "granted" | "granted-capture" | "shipping"): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `a11yext-${kind}-`));
  cpSync(path.resolve("extension"), dir, { recursive: true });
  if (kind !== "shipping") {
    const mf = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
    mf.permissions = [...mf.permissions, "debugger", "downloads"];
    mf.host_permissions = kind === "granted-capture" ? ["<all_urls>"] : ["http://localhost:4400/*"];
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(mf, null, 2));
  }
  return dir;
}
